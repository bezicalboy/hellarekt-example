// web3-config.js
import { ethers } from "ethers"

// Your deployed contract address
export const CONTRACT_ADDRESS = "0xa88691518A97028Fbfd55B87a3B6D7d55A68D2b5"

// Base Sepolia network config
export const NETWORK_CONFIG = {
  chainId: 84532,
  name: "Base Sepolia",
  rpc: "https://sepolia.base.org",
  explorer: "https://sepolia-explorer.base.org",
  currency: "ETH",
}

// Contract ABI (essential functions only)
export const CONTRACT_ABI = [
  // View functions
  "function owner() external view returns (address)",
  "function assetPrices(string memory) external view returns (uint256)",
  "function positions(uint256) external view returns (address trader, string asset, uint256 collateral, uint256 entryPrice, uint256 leverage, uint256 size, bool isLong, uint256 timestamp, bool isActive)",
  "function getUserPositions(address user) external view returns (uint256[] memory)",
  "function calculatePnL(uint256 positionId) external view returns (int256)",
  "function shouldLiquidate(uint256 positionId) external view returns (bool)",
  "function totalPoolValue() external view returns (uint256)",
  "function platformFees() external view returns (uint256)",

  // Write functions
  "function openPosition(string memory asset, uint256 leverage, bool isLong) external payable",
  "function closePosition(uint256 positionId) external",
  "function updatePrice(string memory asset, uint256 newPrice) external",
  "function updateMultiplePrices(string[] memory assets, uint256[] memory prices) external",

  // Events
  "event PositionOpened(uint256 indexed positionId, address indexed trader, string asset, uint256 collateral, uint256 leverage, bool isLong)",
  "event PositionClosed(uint256 indexed positionId, address indexed trader, int256 pnl, string reason)",
  "event UserGotRekt(address indexed user, uint256 lossAmount)",
  "event UserMadeBank(address indexed user, uint256 profitAmount)",
]

// Initialize Web3 provider
export const getProvider = () => {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum)
  }
  // Fallback to read-only provider
  return new ethers.providers.JsonRpcProvider(NETWORK_CONFIG.rpc)
}

// Get contract instance
export const getContract = (signer = null) => {
  const provider = getProvider()
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer || provider)
}

// Helper functions
export const formatPrice = (price) => {
  return ethers.utils.formatEther(price)
}

export const parsePrice = (price) => {
  return ethers.utils.parseEther(price.toString())
}

// Contract interaction functions
export class HellaRektContract {
  constructor(signer) {
    this.contract = getContract(signer)
    this.signer = signer
  }

  // Open position
  async openPosition(asset, leverage, isLong, collateralETH) {
    try {
      console.log("[v0] Opening position with params:", { asset, leverage, isLong, collateralETH })

      // Check if asset price exists in contract first
      const assetPrice = await this.contract.assetPrices(asset)
      console.log("[v0] Asset price in contract:", formatPrice(assetPrice))

      if (assetPrice.eq(0)) {
        throw new Error(`Asset ${asset} not supported or price not set in contract`)
      }

      // Validate leverage
      if (leverage < 2 || leverage > 50) {
        throw new Error("Leverage must be between 2x and 50x")
      }

      // Validate collateral
      if (collateralETH <= 0) {
        throw new Error("Collateral must be greater than 0")
      }

      const tx = await this.contract.openPosition(asset, leverage, isLong, {
        value: ethers.utils.parseEther(collateralETH.toString()),
        gasLimit: 500000, // Increased gas limit
      })

      console.log("[v0] Transaction sent:", tx.hash)
      const receipt = await tx.wait()
      console.log("[v0] Position opened successfully:", receipt)
      return receipt
    } catch (error) {
      console.error("[v0] Error opening position:", error)

      if (error.code === "CALL_EXCEPTION") {
        if (error.reason) {
          throw new Error(`Contract error: ${error.reason}`)
        } else {
          throw new Error("Transaction failed - check if asset is supported and you have enough ETH")
        }
      }

      throw error
    }
  }

  // Close position
  async closePosition(positionId) {
    try {
      const tx = await this.contract.closePosition(positionId, {
        gasLimit: 200000,
      })

      const receipt = await tx.wait()
      console.log("Position closed:", receipt)
      return receipt
    } catch (error) {
      console.error("Error closing position:", error)
      throw error
    }
  }

  // Get user positions
  async getUserPositions(userAddress) {
    try {
      const positionIds = await this.contract.getUserPositions(userAddress)
      const positions = []

      for (let i = 0; i < positionIds.length; i++) {
        const position = await this.contract.positions(positionIds[i])
        const pnl = await this.contract.calculatePnL(positionIds[i])

        positions.push({
          id: positionIds[i].toString(),
          trader: position.trader,
          asset: position.asset,
          collateral: formatPrice(position.collateral),
          entryPrice: formatPrice(position.entryPrice),
          leverage: position.leverage.toString(),
          size: formatPrice(position.size),
          isLong: position.isLong,
          timestamp: position.timestamp.toString(),
          isActive: position.isActive,
          pnl: formatPrice(pnl),
        })
      }

      return positions
    } catch (error) {
      console.error("Error getting user positions:", error)
      return []
    }
  }

  // Get asset price
  async getAssetPrice(asset) {
    try {
      const price = await this.contract.assetPrices(asset)
      return formatPrice(price)
    } catch (error) {
      console.error("Error getting asset price:", error)
      return "0"
    }
  }

  // Update price (owner only)
  async updatePrice(asset, newPrice) {
    try {
      const priceWei = parsePrice(newPrice)
      const tx = await this.contract.updatePrice(asset, priceWei)
      const receipt = await tx.wait()
      return receipt
    } catch (error) {
      console.error("Error updating price:", error)
      throw error
    }
  }

  // Listen to events
  listenToEvents(callback) {
    // Position opened
    this.contract.on("PositionOpened", (positionId, trader, asset, collateral, leverage, isLong, event) => {
      callback("PositionOpened", {
        positionId: positionId.toString(),
        trader,
        asset,
        collateral: formatPrice(collateral),
        leverage: leverage.toString(),
        isLong,
        txHash: event.transactionHash,
      })
    })

    // Position closed
    this.contract.on("PositionClosed", (positionId, trader, pnl, reason, event) => {
      callback("PositionClosed", {
        positionId: positionId.toString(),
        trader,
        pnl: formatPrice(pnl),
        reason,
        txHash: event.transactionHash,
      })
    })

    // User got rekt
    this.contract.on("UserGotRekt", (user, lossAmount, event) => {
      callback("UserGotRekt", {
        user,
        lossAmount: formatPrice(lossAmount),
        txHash: event.transactionHash,
      })
    })

    // User made profit
    this.contract.on("UserMadeBank", (user, profitAmount, event) => {
      callback("UserMadeBank", {
        user,
        profitAmount: formatPrice(profitAmount),
        txHash: event.transactionHash,
      })
    })
  }

  // Stop listening
  removeAllListeners() {
    this.contract.removeAllListeners()
  }
}

// Price update service (for contract owner)
export class PriceUpdateService {
  constructor(signer) {
    this.contract = new HellaRektContract(signer)
    this.isUpdating = false
  }

  async startPriceUpdates() {
    if (this.isUpdating) return
    this.isUpdating = true

    const updatePrices = async () => {
      try {
        // Get prices from Binance
        const response = await fetch("https://api.binance.com/api/v3/ticker/price")
        const binancePrices = await response.json()

        // Map to our assets
        const assets = ["BTC", "ETH", "SOL", "MATIC", "LINK"]
        const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "MATICUSDT", "LINKUSDT"]

        const prices = []
        for (let i = 0; i < symbols.length; i++) {
          const binancePrice = binancePrices.find((p) => p.symbol === symbols[i])
          if (binancePrice) {
            prices.push(Number.parseFloat(binancePrice.price))
          }
        }

        // Update contract prices
        if (prices.length === assets.length) {
          console.log("Updating contract prices...", prices)
          await this.contract.contract.updateMultiplePrices(
            assets,
            prices.map((p) => parsePrice(p)),
          )
          console.log("Prices updated successfully")
        }
      } catch (error) {
        console.error("Error updating prices:", error)
      }
    }

    // Update immediately
    await updatePrices()

    // Then update every 30 seconds
    this.priceInterval = setInterval(updatePrices, 30000)
  }

  stopPriceUpdates() {
    this.isUpdating = false
    if (this.priceInterval) {
      clearInterval(this.priceInterval)
    }
  }
}

export default {
  CONTRACT_ADDRESS,
  NETWORK_CONFIG,
  CONTRACT_ABI,
  getProvider,
  getContract,
  HellaRektContract,
  PriceUpdateService,
  formatPrice,
  parsePrice,
}
