/*************************************************************
 *  HellaRektV2.sol — single-asset futures (testnet)
 *  - Public price push (frontend calls updatePrice before actions)
 *  - Collateral held in this contract, profits paid from pool
 *************************************************************/

interface ILiquidityPool {
    function payProfit(address to, uint256 amount) external returns (bool);
    function canPayProfit(uint256 amount) external view returns (bool);
}

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract HellaRektV2 {
    struct Position {
        address trader;
        string asset;            // e.g., "BTC"
        uint256 collateral;      // USDT (6d)
        uint256 entryPrice;      // price (6d)
        uint256 leverage;        // 2..50
        uint256 size;            // collateral * leverage (6d)
        bool isLong;
        uint256 timestamp;
        bool isActive;
    }

    IERC20Like public immutable usdtToken;
    ILiquidityPool public immutable liquidityPool;
    address public owner;

    // Asset price store (frontend is expected to push before open/close)
    mapping(string => uint256) public assetPrices; // 6 decimals

    // Positions
    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private userPositions;

    event PositionOpened(uint256 indexed positionId, address indexed trader, string asset, uint256 collateral, uint256 leverage, bool isLong);
    event PositionClosed(uint256 indexed positionId, address indexed trader, int256 pnl, string reason);
    event UserGotRekt(address indexed user, uint256 lossAmount);
    event UserMadeBank(address indexed user, uint256 profitAmount);
    event PriceUpdated(string asset, uint256 price);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address _usdt, address _pool) {
        owner = msg.sender;
        usdtToken = IERC20Like(_usdt);
        liquidityPool = ILiquidityPool(_pool);
    }

    // --- Price push (public for testnet) ---
    function updatePrice(string memory asset, uint256 newPrice) public {
        require(newPrice > 0, "price=0");
        assetPrices[asset] = newPrice;
        emit PriceUpdated(asset, newPrice);
    }

    function updateMultiplePrices(string[] memory assets, uint256[] memory prices_) external {
        require(assets.length == prices_.length, "len");
        for (uint256 i = 0; i < assets.length; i++) {
            updatePrice(assets[i], prices_[i]);
        }
    }

    // --- Views ---
    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function getLiquidationPrice(uint256 positionId) public view returns (uint256 liqPrice) {
        Position storage p = positions[positionId];
        require(p.isActive, "inactive");
        // simplistic: liquidate when loss == collateral
        // size * |(mark-entry)| / entry == collateral
        // => |mark-entry| == collateral * entry / size
        uint256 delta = (p.collateral * p.entryPrice) / p.size; // 6d
        if (p.isLong) {
            if (p.entryPrice > delta) liqPrice = p.entryPrice - delta; else liqPrice = 0;
        } else {
            liqPrice = p.entryPrice + delta;
        }
    }

    function shouldLiquidate(uint256 positionId, uint256 currentPrice) external view returns (bool) {
        Position storage p = positions[positionId];
        if (!p.isActive) return false;
        if (currentPrice == 0) return false;
        uint256 liq = getLiquidationPrice(positionId);
        return p.isLong ? (currentPrice <= liq) : (currentPrice >= liq);
    }

    function calculatePnL(uint256 positionId, uint256 currentPrice) public view returns (int256 pnl) {
        Position storage p = positions[positionId];
        require(p.isActive, "inactive");
        require(currentPrice > 0, "price not set");
        // pnl = size * (current - entry) / entry
        // signed based on direction
        int256 diff = int256(currentPrice) - int256(p.entryPrice);
        int256 unsigned = int256((p.size * uint256(diff >= 0 ? diff : -diff)) / p.entryPrice);
        pnl = p.isLong ? (diff >= 0 ? int256((p.size * uint256(diff)) / p.entryPrice) : -int256(unsigned))
                       : (diff >= 0 ? -int256(unsigned) : int256((p.size * uint256(-diff)) / p.entryPrice));
    }

    // Add supportsInterface to prevent wallet errors
    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        // This contract is not a standard token, so we return false for all interfaces
        // except for the ERC165 interface itself if we were to implement it.
        // For now, we'll just return false to prevent reverts for token-related calls.
        return false;
    }

    // Add decimals to prevent wallet errors
    function decimals() external pure returns (uint8) {
        // This contract is not a token, so it has no decimals.
        // Returning 0 to prevent reverts.
        return 0;
    }

    // --- Trading ---
    function openPosition(string calldata asset, uint256 leverage, bool isLong, uint256 collateralAmount, uint256 entryPrice) external {
        require(leverage >= 2 && leverage <= 50, "lev");
        require(collateralAmount > 0, "collateral");
        require(entryPrice > 0, "price not set");

		updatePrice(asset, entryPrice);

        // take collateral
        require(usdtToken.transferFrom(msg.sender, address(this), collateralAmount), "collateral xfer");

        uint256 id = nextPositionId++;
        uint256 size = collateralAmount * leverage; // 6d

        // Calculate fee (0.05% of size)
        uint256 feeAmount = (size * 5) / 10000; // 5 / 10000 = 0.0005

        // Ensure collateral is sufficient for the fee
        require(collateralAmount >= feeAmount, "collateral too low for fee");
        uint256 netCollateral = collateralAmount - feeAmount;

        // Transfer fee to liquidity pool
        require(usdtToken.transfer(address(liquidityPool), feeAmount), "fee xfer to pool");

        positions[id] = Position({
            trader: msg.sender,
            asset: asset,
            collateral: netCollateral, // Use net collateral
            entryPrice: entryPrice,
            leverage: leverage,
            size: netCollateral * leverage, // Recalculate size with net collateral
            isLong: isLong,
            timestamp: block.timestamp,
            isActive: true
        });
        userPositions[msg.sender].push(id);

        emit PositionOpened(id, msg.sender, asset, collateralAmount, leverage, isLong);
    }

    function closePosition(uint256 positionId, uint256 currentPrice) external {
        Position storage p = positions[positionId];
        require(p.isActive, "inactive");
        require(p.trader == msg.sender, "not trader");
        require(currentPrice > 0, "price not set");

        updatePrice(p.asset, currentPrice);

        int256 pnl = calculatePnL(positionId, currentPrice); // signed USDT (6d)

        p.isActive = false; // effects first

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            // pay profit from pool, return full collateral
            if (profit > 0) {
                require(liquidityPool.canPayProfit(profit), "pool low");
                require(liquidityPool.payProfit(p.trader, profit), "pool pay");
                emit UserMadeBank(p.trader, profit);
            }
            require(usdtToken.transfer(p.trader, p.collateral), "collateral back");
            emit PositionClosed(positionId, p.trader, pnl, "closed profit/flat");
        } else {
            uint256 loss = uint256(-pnl);
            if (loss >= p.collateral) {
                // all collateral lost -> send all to pool (protocol PnL)
                require(usdtToken.transfer(address(liquidityPool), p.collateral), "loss to pool");
                emit UserGotRekt(p.trader, p.collateral);
                emit PositionClosed(positionId, p.trader, -int256(p.collateral), "liquidated (collateral <= loss)");
            } else {
                // partial loss -> send loss to pool, return remainder
                require(usdtToken.transfer(address(liquidityPool), loss), "loss to pool");
                uint256 remainder = p.collateral - loss;
                require(usdtToken.transfer(p.trader, remainder), "return rem");
                emit UserGotRekt(p.trader, loss);
                emit PositionClosed(positionId, p.trader, -int256(loss), "closed with loss");
            }
        }
    }
}