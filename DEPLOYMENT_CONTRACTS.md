# HellaRekt V2 - Smart Contracts for Deployment

## Contracts to Deploy (in order):

### 1. FakeUSDT.sol
- **Location**: `contracts/FakeUSDT.sol`
- **Purpose**: Test USDT token for Base Sepolia
- **Deploy first**: This contract needs to be deployed first

### 2. LiquidityPool.sol  
- **Location**: `contracts/LiquidityPool.sol`
- **Purpose**: Handles profits/losses and liquidity
- **Constructor params**: FakeUSDT contract address

### 3. HellaRektV2.sol
- **Location**: `contracts/HellaRektV2.sol` 
- **Purpose**: Main futures trading contract
- **Constructor params**: FakeUSDT address, LiquidityPool address

## Deployment Steps:

1. Deploy FakeUSDT contract
2. Deploy LiquidityPool with FakeUSDT address
3. Deploy HellaRektV2 with both addresses
4. Update contract addresses in `lib/web3-integration-v2.js`

## Contract Addresses (update after deployment):
- FakeUSDT: `YOUR_USDT_ADDRESS`
- LiquidityPool: `YOUR_POOL_ADDRESS` 
- HellaRektV2: `YOUR_FUTURES_ADDRESS`
