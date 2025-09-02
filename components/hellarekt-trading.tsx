"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, TrendingUp, TrendingDown, Wallet, ExternalLink } from "lucide-react"
import { HellaRektContract } from "@/lib/web3-integration"
import { ethers } from "ethers"

// Types
interface Position {
  id: string
  asset: string
  collateral: number
  entryPrice: number
  leverage: number
  size: number
  isLong: boolean
  timestamp: number
  isActive: boolean
  pnl?: number
}

interface PriceData {
  [key: string]: {
    price: number
    change24h: number
  }
}

const HellaRektTrading = () => {
  const [selectedAsset, setSelectedAsset] = useState("BTCUSDT")
  const [leverage, setLeverage] = useState([10])
  const [collateral, setCollateral] = useState("")
  const [positions, setPositions] = useState<Position[]>([])
  const [prices, setPrices] = useState<PriceData>({})
  const [connected, setConnected] = useState(false)
  const [account, setAccount] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [contract, setContract] = useState<HellaRektContract | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)

  // Assets configuration
  const assets = [
    { symbol: "BTCUSDT", name: "Bitcoin", icon: "₿" },
    { symbol: "ETHUSDT", name: "Ethereum", icon: "Ξ" },
    { symbol: "SOLUSDT", name: "Solana", icon: "◎" },
    { symbol: "MATICUSDT", name: "Polygon", icon: "⬟" },
    { symbol: "LINKUSDT", name: "Chainlink", icon: "🔗" },
  ]

  // Fixed testnet prices with slight fluctuation
  useEffect(() => {
    // Fixed prices for testnet development
    const fixedPrices = {
      BTCUSDT: { price: 65000, change24h: 2.5 },
      ETHUSDT: { price: 4000, change24h: 1.8 },
      SOLUSDT: { price: 180, change24h: -0.5 },
      MATICUSDT: { price: 0.85, change24h: 3.2 },
      LINKUSDT: { price: 15.5, change24h: -1.1 },
    }

    // Set initial prices
    setPrices(fixedPrices)

    // Add slight price fluctuation every 5 seconds for realistic testing
    const interval = setInterval(() => {
      setPrices((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach((symbol) => {
          // Random price change between -0.5% to +0.5%
          const changePercent = (Math.random() - 0.5) * 0.01
          const newPrice = updated[symbol].price * (1 + changePercent)
          updated[symbol] = {
            ...updated[symbol],
            price: Number(newPrice.toFixed(symbol === "MATICUSDT" ? 4 : 2)),
          }
        })
        return updated
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // TradingView Widget Integration
  useEffect(() => {
    const container = document.getElementById("tradingview-widget")
    if (!container) return

    container.innerHTML = ""

    const script = document.createElement("script")
    script.src = "https://s3.tradingview.com/tv.js"
    script.async = true

    script.onload = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: `BINANCE:${selectedAsset}`,
          interval: "5",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#000000",
          enable_publishing: false,
          backgroundColor: "#000000",
          gridColor: "#1a1a1a",
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: "tradingview-widget",
          studies: [],
          overrides: {
            "paneProperties.background": "#000000",
            "paneProperties.vertGridProperties.color": "#1a1a1a",
            "paneProperties.horzGridProperties.color": "#1a1a1a",
            "symbolWatermarkProperties.transparency": 90,
            "scalesProperties.textColor": "#ffffff",
            "mainSeriesProperties.candleStyle.upColor": "#22c55e",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          },
        })
      }
    }

    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [selectedAsset])

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        setIsLoading(true)

        // Request account access
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        })

        // Add Base Sepolia network
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x14A34", // 84532 in hex (Base Sepolia)
                chainName: "Base Sepolia",
                rpcUrls: ["https://sepolia.base.org"],
                nativeCurrency: {
                  name: "Ethereum",
                  symbol: "ETH",
                  decimals: 18,
                },
                blockExplorerUrls: ["https://sepolia-explorer.base.org"],
              },
            ],
          })
        } catch (addError) {
          console.log("Network already added or user rejected")
        }

        const provider = new ethers.providers.Web3Provider(window.ethereum)
        const userSigner = provider.getSigner()
        const contractInstance = new HellaRektContract(userSigner)

        setAccount(accounts[0])
        setConnected(true)
        setSigner(userSigner)
        setContract(contractInstance)

        await loadUserPositions(accounts[0], contractInstance)
      } catch (error) {
        console.error("Failed to connect wallet:", error)
      } finally {
        setIsLoading(false)
      }
    } else {
      alert("Please install MetaMask!")
    }
  }

  const loadUserPositions = async (userAddress: string, contractInstance?: HellaRektContract) => {
    if (!contractInstance && !contract) return

    try {
      const contractToUse = contractInstance || contract!
      const contractPositions = await contractToUse.getUserPositions(userAddress)

      const formattedPositions: Position[] = contractPositions.map((pos: any) => ({
        id: pos.id,
        asset: pos.asset + "USDT", // Convert BTC to BTCUSDT for price matching
        collateral: Number.parseFloat(pos.collateral),
        entryPrice: Number.parseFloat(pos.entryPrice),
        leverage: Number.parseInt(pos.leverage),
        size: Number.parseFloat(pos.size),
        isLong: pos.isLong,
        timestamp: Number.parseInt(pos.timestamp) * 1000, // Convert to milliseconds
        isActive: pos.isActive,
        pnl: Number.parseFloat(pos.pnl),
      }))

      setPositions(formattedPositions.filter((p) => p.isActive))
    } catch (error) {
      console.error("Error loading positions:", error)
    }
  }

  const formatPrice = (price: number) => {
    if (!price) return "0.00"
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 6 : 2,
    })
  }

  const calculatePnL = useCallback(
    (position: Position) => {
      const currentPrice = prices[position.asset]?.price
      if (!currentPrice) return 0

      const priceDiff = currentPrice - position.entryPrice
      const direction = position.isLong ? 1 : -1

      // Calculate PnL: (price difference * direction * position size) / entry price
      // Position size = collateral * leverage
      const positionSize = position.collateral * position.leverage
      return (priceDiff * direction * positionSize) / position.entryPrice
    },
    [prices],
  )

  const getLiquidationPrice = (position: Position) => {
    const liquidationThreshold = 0.9 // 90%
    const priceMove = (position.collateral * liquidationThreshold) / (position.collateral * position.leverage)

    if (position.isLong) {
      return position.entryPrice * (1 - priceMove)
    } else {
      return position.entryPrice * (1 + priceMove)
    }
  }

  const openPosition = async (isLong: boolean) => {
    if (!connected || !contract) {
      alert("Connect wallet first")
      return
    }

    if (!collateral || Number.parseFloat(collateral) <= 0) {
      alert("Enter collateral amount")
      return
    }

    const currentPrice = prices[selectedAsset]?.price
    if (!currentPrice) {
      alert("Price data not available")
      return
    }

    try {
      setIsLoading(true)

      // Convert BTCUSDT to BTC for contract
      const contractAsset = selectedAsset.replace("USDT", "")

      console.log("[v0] Opening position:", {
        asset: contractAsset,
        leverage: leverage[0],
        isLong,
        collateral: collateral,
      })

      // Check if asset price is set in contract
      try {
        const contractPrice = await contract.getAssetPrice(contractAsset)
        console.log("[v0] Contract price for", contractAsset, ":", contractPrice)

        if (contractPrice === "0" || contractPrice === "0.0") {
          throw new Error(
            `Asset ${contractAsset} price not set in contract. Contract owner needs to update prices first.`,
          )
        }
      } catch (priceError) {
        console.error("[v0] Error checking contract price:", priceError)
        throw new Error(`Cannot get ${contractAsset} price from contract. Make sure prices are initialized.`)
      }

      // Check minimum collateral (0.001 ETH minimum)
      const minCollateral = 0.001
      if (Number.parseFloat(collateral) < minCollateral) {
        throw new Error(`Minimum collateral is ${minCollateral} ETH`)
      }

      // Check maximum leverage
      if (leverage[0] > 50) {
        throw new Error("Maximum leverage is 50x")
      }

      console.log("[v0] Pre-transaction validation passed")

      // Call smart contract with increased gas limit
      const tx = await contract.openPosition(contractAsset, leverage[0], isLong, collateral)

      console.log("[v0] Transaction sent:", tx.transactionHash)
      alert(`Position opened! TX: ${tx.transactionHash}`)

      // Reload positions
      await loadUserPositions(account)
      setCollateral("")
    } catch (error) {
      console.error("[v0] Error opening position:", error)

      let errorMessage = "Transaction failed"

      if (error.message.includes("user rejected")) {
        errorMessage = "Transaction rejected by user"
      } else if (error.message.includes("insufficient funds")) {
        errorMessage = "Insufficient ETH balance"
      } else if (error.message.includes("price not set")) {
        errorMessage = error.message
      } else if (error.message.includes("CALL_EXCEPTION")) {
        errorMessage = "Contract execution failed. Check if prices are initialized and collateral meets requirements."
      } else if (error.message) {
        errorMessage = error.message
      }

      alert(`Error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const closePosition = async (positionId: string) => {
    if (!contract) return

    try {
      setIsLoading(true)

      console.log("[v0] Closing position:", positionId)

      const tx = await contract.closePosition(Number.parseInt(positionId))

      console.log("[v0] Position closed:", tx.transactionHash)
      alert(`Position closed! TX: ${tx.transactionHash}`)

      // Reload positions
      await loadUserPositions(account)
    } catch (error) {
      console.error("[v0] Error closing position:", error)
      alert(`Error: ${error.message || "Transaction failed"}`)
    } finally {
      setIsLoading(false)
    }
  }

  const currentPrice = prices[selectedAsset]?.price || 0
  const priceChange = prices[selectedAsset]?.change24h || 0
  const positionSize = collateral ? Number.parseFloat(collateral) * currentPrice * leverage[0] : 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <h1 className="text-2xl font-bold">HellaRekt</h1>
              <Badge variant="outline" className="text-xs">
                Futures Trading
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              {connected ? (
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="text-xs">
                    Base Sepolia
                  </Badge>
                  <div className="flex items-center space-x-2 bg-muted px-3 py-2 rounded-md">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm font-mono">
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={connectWallet}
                  disabled={isLoading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isLoading ? "Connecting..." : "Connect Wallet"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Asset Selection & Chart */}
          <div className="lg:col-span-3 space-y-6">
            {/* Asset Tabs */}
            <Tabs value={selectedAsset} onValueChange={setSelectedAsset}>
              <TabsList className="grid w-full grid-cols-5 bg-muted">
                {assets.map((asset) => (
                  <TabsTrigger
                    key={asset.symbol}
                    value={asset.symbol}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{asset.icon}</span>
                      <div className="text-left">
                        <div className="font-medium text-sm">{asset.symbol.replace("USDT", "")}</div>
                        <div className="text-xs opacity-70">${formatPrice(prices[asset.symbol]?.price || 0)}</div>
                      </div>
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Current Price Display */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold font-mono">${formatPrice(currentPrice)}</div>
                    <div
                      className={`flex items-center space-x-2 text-sm ${
                        priceChange >= 0 ? "text-chart-1" : "text-chart-2"
                      }`}
                    >
                      {priceChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span>
                        {priceChange >= 0 ? "+" : ""}
                        {priceChange.toFixed(2)}% 24h
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Live Price
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* TradingView Chart */}
            <Card>
              <CardContent className="p-0">
                <div id="tradingview-widget" className="w-full h-96 bg-black rounded-lg"></div>
              </CardContent>
            </Card>
          </div>

          {/* Trading Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <span>Open Position</span>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Leverage Slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm text-muted-foreground">Leverage</label>
                    <Badge variant="outline" className="text-xs">
                      {leverage[0]}x
                    </Badge>
                  </div>
                  <Slider value={leverage} onValueChange={setLeverage} max={50} min={2} step={1} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>2x</span>
                    <span>50x</span>
                  </div>
                </div>

                {/* Collateral Input */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Collateral (ETH)</label>
                  <Input
                    type="number"
                    value={collateral}
                    onChange={(e) => setCollateral(e.target.value)}
                    placeholder="0.1"
                    step="0.01"
                    className="font-mono"
                  />
                  {collateral && currentPrice && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Position Size: ${positionSize.toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Trading Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => openPosition(true)}
                    disabled={!connected || !collateral || isLoading}
                    className="bg-chart-1 hover:bg-chart-1/90 text-white font-medium"
                  >
                    {isLoading ? "..." : "Long"}
                  </Button>
                  <Button
                    onClick={() => openPosition(false)}
                    disabled={!connected || !collateral || isLoading}
                    className="bg-chart-2 hover:bg-chart-2/90 text-white font-medium"
                  >
                    {isLoading ? "..." : "Short"}
                  </Button>
                </div>

                {!connected && (
                  <div className="text-xs text-muted-foreground text-center p-2 bg-muted rounded">
                    Connect wallet to start trading
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Account Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Open Positions</span>
                  <span className="font-mono">{positions.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total PnL</span>
                  <span className="font-mono text-chart-1">+$0.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs">Base Sepolia</span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Positions Table */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No open positions</div>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => {
                  const pnl = calculatePnL(position)
                  const liquidationPrice = getLiquidationPrice(position)
                  const currentAssetPrice = prices[position.asset]?.price || 0

                  return (
                    <div key={position.id} className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <Badge variant={position.isLong ? "default" : "destructive"} className="text-xs">
                            {position.isLong ? "Long" : "Short"}
                          </Badge>
                          <div>
                            <div className="font-medium">
                              {position.asset.replace("USDT", "")} {position.leverage}x
                            </div>
                            <div className="text-sm text-muted-foreground">Size: {position.collateral} ETH</div>
                          </div>
                          <div className="text-sm font-mono space-y-1">
                            <div>Entry: ${formatPrice(position.entryPrice)}</div>
                            <div>Mark: ${formatPrice(currentAssetPrice)}</div>
                            <div>Liq: ${formatPrice(liquidationPrice)}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div
                              className={`text-lg font-medium font-mono ${pnl >= 0 ? "text-chart-1" : "text-chart-2"}`}
                            >
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {((pnl / position.collateral) * 100).toFixed(1)}%
                            </div>
                          </div>
                          <Button
                            onClick={() => closePosition(position.id)}
                            variant="outline"
                            size="sm"
                            disabled={isLoading}
                          >
                            {isLoading ? "..." : "Close"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default HellaRektTrading
