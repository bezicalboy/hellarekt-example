import { ethers } from "ethers"

// Contract configuration for Base Sepolia
export const CONTRACT_ADDRESS = "0xa88691518A97028Fbfd55B87a3B6D7d55A68D2b5"

export const NETWORK_CONFIG = {
  chainId: 84532,
  name: "Base Sepolia",
  rpc: "https://sepolia.base.org",
  explorer: "https://sepolia-explorer.base.org",
  currency: "ETH",
}

// Essential contract ABI
export const CONTRACT_ABI = [
  "function owner() external view returns (address)",
  "function assetPrices(string memory) external view returns (uint256)",
  "function positions(uint256) external view returns (address trader, string asset, uint256 collateral, uint256 entryPrice, uint256 leverage, uint256 size, bool isLong, uint256 timestamp, bool isActive)",
  "function getUserPositions(address user) external view returns (uint256[] memory)",
  "function calculatePnL(uint256 positionId) external view returns (int256)",
  "function shouldLiquidate(uint256 positionId) external view returns (bool)",
  "function totalPoolValue() external view returns (uint256)",
  "function platformFees() external view returns (uint256)",
  "function openPosition(string memory asset, uint256 leverage, bool isLong) external payable",
  "function closePosition(uint256 positionId) external",
  "function updatePrice(string memory asset, uint256 newPrice) external",
  "function updateMultiplePrices(string[] memory assets, uint256[] memory prices) external",
  "event PositionOpened(uint256 indexed positionId, address indexed trader, string asset, uint256 collateral, uint256 leverage, bool isLong)",
  "event PositionClosed(uint256 indexed positionId, address indexed trader, int256 pnl, string reason)",
  "event UserGotRekt(address indexed user, uint256 lossAmount)",
  "event UserMadeBank(address indexed user, uint256 profitAmount)",
]

// Web3 provider utilities
export const getProvider = () => {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum)
  }
  return new ethers.providers.JsonRpcProvider(NETWORK_CONFIG.rpc)
}

export const getContract = (signer?: ethers.Signer) => {
  const provider = getProvider()
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer || provider)
}

// Helper functions
export const formatPrice = (price: ethers.BigNumber) => {
  return ethers.utils.formatEther(price)
}

export const parsePrice = (price: number) => {
  return ethers.utils.parseEther(price.toString())
}

export default {
  CONTRACT_ADDRESS,
  NETWORK_CONFIG,
  CONTRACT_ABI,
  getProvider,
  getContract,
  formatPrice,
  parsePrice,
}
