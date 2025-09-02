"use client"

import { useState, useEffect } from "react"

const HellaRekt = () => {
  const [selectedAsset, setSelectedAsset] = useState("BTCUSDT")
  const [leverage, setLeverage] = useState(10)
  const [collateral, setCollateral] = useState("")
  const [positions, setPositions] = useState([])
  const [prices, setPrices] = useState({
    BTCUSDT: 0,
    ETHUSDT: 0,
    SOLUSDT: 0,
    MATICUSDT: 0,
    LINKUSDT: 0,
  })
  const [priceChanges, setPriceChanges] = useState({})
  const [connected, setConnected] = useState(false)
  const [account, setAccount] = useState("")

  // Binance WebSocket price feeds
  useEffect(() => {
    const symbols = ["btcusdt", "ethusdt", "solusdt", "maticusdt", "linkusdt"]
    const streams = symbols.map((s) => `${s}@ticker`).join("/")
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      const symbol = data.s
      const price = Number.parseFloat(data.c)
      const change24h = Number.parseFloat(data.P)

      setPrices((prev) => ({
        ...prev,
        [symbol]: price,
      }))

      setPriceChanges((prev) => ({
        ...prev,
        [symbol]: change24h,
      }))
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [])

  // TradingView Widget Integration
  useEffect(() => {
    // Clear existing widget
    const container = document.getElementById("tradingview-widget")
    if (container) {
      container.innerHTML = ""
    }

    // Load TradingView script
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
        // Request account access
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        })

        // Add Base Sepolia
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

        setAccount(accounts[0])
        setConnected(true)
      } catch (error) {
        console.error("Failed to connect wallet:", error)
      }
    } else {
      alert("Please install MetaMask!")
    }
  }

  const formatPrice = (price) => {
    if (!price) return "0.00"
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 6 : 2,
    })
  }

  const calculatePnL = (position) => {
    const currentPrice = prices[position.asset]
    if (!currentPrice) return 0

    const priceDiff = currentPrice - position.entryPrice
    const direction = position.isLong ? 1 : -1
    return (priceDiff * direction * position.collateral * position.leverage) / position.entryPrice
  }

  const getLiquidationPrice = (position) => {
    const liquidationThreshold = 0.9 // 90%
    const priceMove = (position.collateral * liquidationThreshold) / (position.collateral * position.leverage)

    if (position.isLong) {
      return position.entryPrice * (1 - priceMove)
    } else {
      return position.entryPrice * (1 + priceMove)
    }
  }

  const openPosition = (isLong) => {
    if (!connected) {
      alert("Connect wallet first")
      return
    }

    if (!collateral || Number.parseFloat(collateral) <= 0) {
      alert("Enter collateral amount")
      return
    }

    const newPosition = {
      id: Date.now(),
      asset: selectedAsset,
      collateral: Number.parseFloat(collateral),
      entryPrice: prices[selectedAsset],
      leverage: leverage,
      isLong: isLong,
      timestamp: Date.now(),
    }

    setPositions([...positions, newPosition])
    setCollateral("")
  }

  const closePosition = (positionId) => {
    const position = positions.find((p) => p.id === positionId)
    const pnl = calculatePnL(position)

    setPositions(positions.filter((p) => p.id !== positionId))

    const message =
      pnl > 0 ? `Position closed. Profit: +$${pnl.toFixed(2)}` : `Position closed. Loss: $${pnl.toFixed(2)}`
    alert(message)
  }

  const assets = [
    { symbol: "BTCUSDT", name: "Bitcoin" },
    { symbol: "ETHUSDT", name: "Ethereum" },
    { symbol: "SOLUSDT", name: "Solana" },
    { symbol: "MATICUSDT", name: "Polygon" },
    { symbol: "LINKUSDT", name: "Chainlink" },
  ]

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold">HellaRekt</h1>
            <span className="text-gray-500 text-sm">Futures Trading</span>
          </div>
          <div className="flex items-center space-x-4">
            {connected ? (
              <>
                <div className="text-sm">
                  <span className="text-gray-500">Base Sepolia</span>
                </div>
                <div className="bg-gray-900 border border-gray-700 px-3 py-1 rounded text-sm">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </div>
              </>
            ) : (
              <button
                onClick={connectWallet}
                className="bg-white text-black px-4 py-2 rounded hover:bg-gray-200 transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-12 gap-6">
          {/* Asset Selection */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex space-x-1 mb-4">
              {assets.map((asset) => (
                <button
                  key={asset.symbol}
                  onClick={() => setSelectedAsset(asset.symbol)}
                  className={`px-4 py-2 text-sm transition-colors ${
                    selectedAsset === asset.symbol
                      ? "bg-white text-black"
                      : "bg-gray-900 border border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="font-medium">{asset.symbol.replace("USDT", "")}</div>
                  <div className="text-xs opacity-70">${formatPrice(prices[asset.symbol])}</div>
                </button>
              ))}
            </div>

            {/* Current Price */}
            <div className="mb-4">
              <div className="text-3xl font-bold">${formatPrice(prices[selectedAsset])}</div>
              <div className={`text-sm ${(priceChanges[selectedAsset] || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {(priceChanges[selectedAsset] || 0) >= 0 ? "+" : ""}
                {(priceChanges[selectedAsset] || 0).toFixed(2)}% 24h
              </div>
            </div>

            {/* TradingView Chart */}
            <div className="bg-gray-950 border border-gray-800 rounded h-96">
              <div id="tradingview-widget" className="w-full h-full"></div>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="bg-gray-950 border border-gray-800 rounded p-4">
              <h3 className="text-lg font-medium mb-4">Open Position</h3>

              <div className="space-y-4">
                {/* Leverage */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm text-gray-400">Leverage</label>
                    <span className="text-sm">{leverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    value={leverage}
                    onChange={(e) => setLeverage(Number.parseInt(e.target.value))}
                    className="w-full bg-gray-800 rounded-lg appearance-none slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>2x</span>
                    <span>50x</span>
                  </div>
                </div>

                {/* Collateral */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Collateral (HLS)</label>
                  <input
                    type="number"
                    value={collateral}
                    onChange={(e) => setCollateral(e.target.value)}
                    placeholder="0.1"
                    step="0.01"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-gray-600"
                  />
                  {collateral && prices[selectedAsset] && (
                    <div className="text-xs text-gray-500 mt-1">
                      Position: ${(Number.parseFloat(collateral) * prices[selectedAsset] * leverage).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Trading Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openPosition(true)}
                    disabled={!connected || !collateral}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded transition-colors"
                  >
                    Long
                  </button>
                  <button
                    onClick={() => openPosition(false)}
                    disabled={!connected || !collateral}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded transition-colors"
                  >
                    Short
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Positions */}
          <div className="col-span-12">
            <div className="bg-gray-950 border border-gray-800 rounded p-4">
              <h3 className="text-lg font-medium mb-4">Open Positions</h3>

              {positions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No open positions</div>
              ) : (
                <div className="space-y-3">
                  {positions.map((position) => {
                    const pnl = calculatePnL(position)
                    const liquidationPrice = getLiquidationPrice(position)
                    const currentPrice = prices[position.asset]

                    return (
                      <div key={position.id} className="bg-gray-900 border border-gray-800 rounded p-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-4">
                            <div
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                position.isLong ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"
                              }`}
                            >
                              {position.isLong ? "Long" : "Short"}
                            </div>
                            <div>
                              <div className="font-medium">
                                {position.asset.replace("USDT", "")} {position.leverage}x
                              </div>
                              <div className="text-sm text-gray-400">Size: {position.collateral} ETH</div>
                            </div>
                            <div className="text-sm">
                              <div>Entry: ${formatPrice(position.entryPrice)}</div>
                              <div>Mark: ${formatPrice(currentPrice)}</div>
                              <div>Liq: ${formatPrice(liquidationPrice)}</div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <div className={`text-lg font-medium ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                              </div>
                              <div className="text-sm text-gray-400">
                                {((pnl / position.collateral) * 100).toFixed(1)}%
                              </div>
                            </div>
                            <button
                              onClick={() => closePosition(position.id)}
                              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-sm transition-colors"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: white;
          cursor: pointer;
          border-radius: 50%;
        }
        
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: white;
          cursor: pointer;
          border-radius: 50%;
          border: none;
        }
      `}</style>
    </div>
  )
}

export default HellaRekt
