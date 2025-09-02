export interface Position {
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

export interface PriceData {
  [key: string]: {
    price: number
    change24h: number
  }
}

export const formatPrice = (price: number) => {
  if (!price) return "0.00"
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 6 : 2,
  })
}

export const calculatePnL = (position: Position, currentPrice: number) => {
  if (!currentPrice) return 0;

  const priceDiff = currentPrice - position.entryPrice;
  const direction = position.isLong ? 1 : -1;
  const positionSize = position.collateral * position.leverage;

  const grossPnl = (priceDiff * direction * positionSize) / position.entryPrice;
  
  return grossPnl;
}

export const getLiquidationPrice = (position: Position) => {
  const liquidationThreshold = 0.9 // 90%
  const priceMove = (position.collateral * liquidationThreshold) / (position.collateral * position.leverage)

  if (position.isLong) {
    return position.entryPrice * (1 - priceMove)
  } else {
    return position.entryPrice * (1 + priceMove)
  }
}
