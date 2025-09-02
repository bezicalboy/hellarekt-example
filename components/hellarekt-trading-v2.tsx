
"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Wallet, ExternalLink, Coins, DollarSign } from "lucide-react"
import { ethers } from "ethers"
import { type Position, type PriceData, calculatePnL, getLiquidationPrice, formatPrice } from "@/lib/trading-utils"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount, useBalance, useReadContract, useWriteContract, useReadContracts } from "wagmi"
import { useQueryClient } from "@tanstack/react-query";
import { HELLAREKTV2_ABI, LIQUIDITYPOOL_ABI, FAKEUSDT_ABI } from "@/lib/web3-integration-v2";
import dynamic from 'next/dynamic'

const AdvancedRealTimeChart = dynamic(
  () => import('react-ts-tradingview-widgets').then((w) => w.AdvancedRealTimeChart),
  {
    ssr: false,
  }
)

const HELLAREKTV2_CONTRACT_ADDRESS = "0x1C8F04C7c7dda08bd14091C59fdd9c2CCA87b51B";
const LIQUIDITYPOOL_CONTRACT_ADDRESS = "0x1026D7429B2EA2A6AC8Efb081Ee2eCc666a6358D";
const FAKEUSDT_CONTRACT_ADDRESS = "0x1941FA0bE10F42fc964113Db4F77385DFC618451";

const HellaRektTradingV2 = () => {
  const [leverage, setLeverage] = useState([10])
  const [collateral, setCollateral] = useState("")
  const [positions, setPositions] = useState<Position[]>([])
  const [prices, setPrices] = useState<PriceData>({})
  const selectedAsset = "BTCUSDT";

  const queryClient = useQueryClient();

  const { address, isConnected } = useAccount()
  const { data: usdtBalance, refetch: refetchUsdtBalance } = useBalance({ address, token: FAKEUSDT_CONTRACT_ADDRESS })
  const { data: poolStats, refetch: refetchPoolStats } = useReadContract({
    abi: LIQUIDITYPOOL_ABI,
    address: LIQUIDITYPOOL_CONTRACT_ADDRESS,
    functionName: 'getPoolStats',
  })
  const { data: userPoolShare, refetch: refetchUserPoolShare } = useReadContract({
    abi: LIQUIDITYPOOL_ABI,
    address: LIQUIDITYPOOL_CONTRACT_ADDRESS,
    functionName: 'getUserPoolShare',
    args: [address],
  })
  const { data: userPositionIds, refetch: refetchUserPositions } = useReadContract({
      abi: HELLAREKTV2_ABI,
      address: HELLAREKTV2_CONTRACT_ADDRESS,
      functionName: 'getUserPositions',
      args: [address],
  });

  const { data: userPositionsData, refetch: refetchUserPositionsData } = useReadContracts({
      contracts: (userPositionIds as any[])?.map(id => ({
          abi: HELLAREKTV2_ABI,
          address: HELLAREKTV2_CONTRACT_ADDRESS,
          functionName: 'positions',
          args: [id],
      })) || [],
  });

  const refetchAll = () => {
      console.log("Refetching all data...");
      queryClient.invalidateQueries(); // Invalidate all queries
  }

  const { writeContract: openPositionWrite, isPending: isOpenPositionPending } = useWriteContract()
  const { writeContract: closePositionWrite, isPending: isClosePositionPending } = useWriteContract()
  const { writeContract: claimUSDTWrite, isPending: isClaimUSGTPending } = useWriteContract()
  const { writeContract: depositToPoolWrite, isPending: isDepositToPoolPending } = useWriteContract()
  const { writeContract: approveWrite, isPending: isApprovePending } = useWriteContract()
  const isPending = isOpenPositionPending || isClosePositionPending || isClaimUSGTPending || isDepositToPoolPending || isApprovePending;


  useEffect(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@ticker`)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.s && data.c) {
        const symbol = data.s.toUpperCase()
        const price = Number.parseFloat(data.c)
        const change24h = Number.parseFloat(data.P)

        setPrices((prev) => ({
          ...prev,
          [symbol]: {
            price,
            change24h,
            timestamp: Date.now(),
          },
        }))
      }
    }
    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }
    return () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
      if (userPositionsData && userPositionIds) {
          const formattedPositions: Position[] = userPositionsData.map((posResult: any, index: number) => {
              const pos = posResult.result;
              if (!pos) return null;
              return {
                  id: (userPositionIds as any[])[index].toString(),
                  asset: pos[1] + "USDT",
                  collateral: parseFloat(ethers.utils.formatUnits(pos[2], 6)),
                  entryPrice: parseFloat(ethers.utils.formatUnits(pos[3], 6)),
                  leverage: parseInt(pos[4].toString()),
                  size: parseFloat(ethers.utils.formatUnits(pos[5], 6)),
                  isLong: pos[6],
                  timestamp: parseInt(pos[7].toString()) * 1000,
                  isActive: pos[8],
                  pnl: 0, // PnL is calculated on the frontend
              };
          }).filter((p): p is Position => p !== null && p.isActive);
          setPositions(formattedPositions);
      }
  }, [userPositionsData, userPositionIds]);


  const claimUSDT = async () => {
    claimUSDTWrite({
        abi: FAKEUSDT_ABI,
        address: FAKEUSDT_CONTRACT_ADDRESS,
        functionName: 'faucet',
    }, {
        onSettled: () => {
            console.log("claimUSDT settled");
            refetchAll();
        }
    })
  }

  const depositToPool = async () => {
    const amount = prompt("Enter USDT amount to deposit to liquidity pool:")
    if (!amount || Number.parseFloat(amount) <= 0) return

    const amountParsed = ethers.utils.parseUnits(amount, 6);

    approveWrite({
        abi: FAKEUSDT_ABI,
        address: FAKEUSDT_CONTRACT_ADDRESS,
        functionName: 'approve',
        args: [LIQUIDITYPOOL_CONTRACT_ADDRESS, amountParsed]
    }, {
        onSettled: () => {
            depositToPoolWrite({
                abi: LIQUIDITYPOOL_ABI,
                address: LIQUIDITYPOOL_CONTRACT_ADDRESS,
                functionName: 'deposit',
                args: [amountParsed]
            }, { 
                onSettled: () => {
                    console.log("depositToPool settled");
                    refetchAll();
                }
            })
        }
    })
  }

  const openPosition = async (isLong: boolean) => {
    if (!isConnected) {
      alert("Connect wallet first")
      return
    }

    if (!collateral || Number.parseFloat(collateral) <= 0) {
      alert("Enter USDT collateral amount")
      return
    }

    if (usdtBalance && Number.parseFloat(usdtBalance.formatted) < Number.parseFloat(collateral)) {
      alert("Insufficient USDT balance. Use the faucet to get test USDT.")
      return
    }

    const currentPrice = prices[selectedAsset]?.price
    if (!currentPrice) {
      alert(`Price data not available for ${selectedAsset}.`)
      return
    }

    const contractAsset = selectedAsset.replace("USDT", "")
    const collateralAmount = ethers.utils.parseUnits(collateral, 6);
    const entryPriceParsed = ethers.utils.parseUnits(currentPrice.toString(), 6);

    approveWrite({
        abi: FAKEUSDT_ABI,
        address: FAKEUSDT_CONTRACT_ADDRESS,
        functionName: 'approve',
        args: [HELLAREKTV2_CONTRACT_ADDRESS, collateralAmount]
    }, {
        onSettled: () => {
            openPositionWrite({
                abi: HELLAREKTV2_ABI,
                address: HELLAREKTV2_CONTRACT_ADDRESS,
                functionName: 'openPosition',
                args: [contractAsset, leverage[0], isLong, collateralAmount, entryPriceParsed]
            }, { 
                onSettled: () => {
                    console.log("openPosition settled");
                    refetchAll();
                }
            })
        }
    })
  }

  const closePosition = async (positionId: string, asset: string) => {
    console.log("Closing position:", positionId, asset);
    const currentPrice = prices[asset]?.price
    console.log("Current price:", currentPrice);
    if (!currentPrice) {
      alert(`Price data not available for ${asset}.`)
      return
    }
    const currentPriceParsed = ethers.utils.parseUnits(currentPrice.toString(), 6);
    console.log("Parsed price:", currentPriceParsed.toString());

    closePositionWrite({
        abi: HELLAREKTV2_ABI,
        address: HELLAREKTV2_CONTRACT_ADDRESS,
        functionName: 'closePosition',
        args: [positionId, currentPriceParsed]
    }, {
        onSettled: () => {
            console.log("closePosition settled");
            refetchAll();
        },
        onError: (error) => {
            console.error("closePosition error:", error);
        }
    })
  }

  const currentPrice = prices[selectedAsset]?.price || 0
  const priceChange = prices[selectedAsset]?.change24h || 0
  const positionSize = collateral ? Number.parseFloat(collateral) * leverage[0] : 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <h1 className="text-2xl font-bold">HellaRekt</h1>
              <Badge variant="outline" className="text-xs">
                USDT Futures
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
                <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Trading Panel */}
          <div className="space-y-6 flex flex-col justify-end">
            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Coins className="h-4 w-4" />
                    <span>USDT Management</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="font-mono">{usdtBalance ? parseFloat(usdtBalance.formatted).toFixed(2) : 0} USDT</span>
                  </div>
                  <Button
                    onClick={claimUSDT}
                    disabled={isPending}
                    variant="outline"
                    size="sm"
                    className="w-full bg-transparent"
                  >
                    {isClaimUSGTPending ? "Claiming..." : "Claim 1000 USDT (Faucet)"}
                  </Button>
                  <Button
                    onClick={depositToPool}
                    disabled={isPending || !usdtBalance || Number.parseFloat(usdtBalance.formatted) === 0}
                    variant="outline"
                    size="sm"
                    className="w-full bg-transparent"
                  >
                    {isDepositToPoolPending ? "Depositing..." : "Deposit to Pool"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <span>Open Position</span>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Collateral Input */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Collateral (USDT)</label>
                  <Input
                    type="number"
                    value={collateral}
                    onChange={(e) => setCollateral(e.target.value)}
                    placeholder="100"
                    step="1"
                    className="font-mono"
                  />
                  {collateral && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Position Size: {positionSize.toLocaleString()} USDT
                    </div>
                  )}
                </div>

                {/* Asset Selector */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Asset</label>
                  <Input
                    type="text"
                    value={selectedAsset}
                    disabled
                    className="w-full p-2 bg-background border border-border rounded-md font-mono"
                  />
                  {/* Current Price Display */}
                  <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                    <span>Current Price: ${formatPrice(currentPrice)}</span>
                    <span className={priceChange >= 0 ? "text-chart-1" : "text-chart-2"}>
                      {priceChange >= 0 ? "+" : ""}
                      {priceChange.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Leverage Selector */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Leverage: {leverage[0]}x</label>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    value={leverage[0]}
                    onChange={(e) => setLeverage([Number.parseInt(e.target.value)])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>2x</span>
                    <span>50x</span>
                  </div>
                </div>

                {/* Long/Short Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => openPosition(true)}
                    disabled={isPending}
                    className="bg-chart-1 hover:bg-chart-1/90 text-white"
                  >
                    {isOpenPositionPending ? "Opening..." : "Long"}
                  </Button>
                  <Button
                    onClick={() => openPosition(false)}
                    disabled={isPending}
                    className="bg-chart-2 hover:bg-chart-2/90 text-white"
                  >
                    {isApprovePending && !isOpenPositionPending ? "Approving..." : isOpenPositionPending ? "Opening..." : "Short"}
                  </Button>
                </div>

                {!isConnected && (
                  <div className="text-xs text-muted-foreground text-center p-2 bg-muted rounded">
                    Connect wallet to start trading
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pool & Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Open Positions</span>
                  <span className="font-mono">{positions.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pool Balance</span>
                  <span className="font-mono">{poolStats ? parseFloat(ethers.utils.formatUnits((poolStats as any)[0], 6)).toFixed(0) : 0} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Pool Share</span>
                  <span className="font-mono">{userPoolShare ? parseFloat(ethers.utils.formatUnits((userPoolShare as any)[1], 6)).toFixed(2) : 0} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs">MEGA Testnet</span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart and Positions */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="h-[600px]">
              <CardHeader>
                <CardTitle>Chart - {selectedAsset.replace("USDT", "/USDT")}</CardTitle>
              </CardHeader>
              <CardContent className="h-full p-0">
                <AdvancedRealTimeChart theme="dark" autosize symbol="BINANCE:BTCUSDT"></AdvancedRealTimeChart>
              </CardContent>
            </Card>

            {/* Positions Table */}
            <Card>
              <CardHeader>
                <CardTitle>Open Positions</CardTitle>
              </CardHeader>
              <CardContent>
                {positions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No open positions</div>
                ) : (
                  <div className="space-y-3">
                    {positions.map((position) => {
                      const currentAssetPrice = prices[position.asset]?.price || 0
                      const pnl = calculatePnL(position, currentAssetPrice)
                      const liquidationPrice = getLiquidationPrice(position)

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
                                <div className="text-sm text-muted-foreground">Size: {position.collateral} USDT</div>
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
                                  {pnl >= 0 ? "+" : ""}
                                  {pnl.toFixed(2)} USDT
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {((pnl / position.collateral) * 100).toFixed(1)}%
                                </div>
                              </div>
                              <Button
                                onClick={() => closePosition(position.id, position.asset)}
                                disabled={isPending}
                                variant="outline"
                                size="sm"
                              >
                                {isClosePositionPending ? "Closing..." : "Close"}
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
      </div>
    </div>
  )
}

export default HellaRektTradingV2
