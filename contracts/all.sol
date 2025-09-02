// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*************************************************************
 *  FakeUSDT.sol — Minimal ERC20 (6 decimals) with 24h faucet
 *************************************************************/

contract FakeUSDT {
    string public name = "FakeUSDT";
    string public symbol = "USDT";
    uint8 public constant decimals = 6; // match USDT

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;

    // Faucet controls
    uint256 public faucetAmount = 1_000 * 10 ** decimals; // 1000 USDT
    uint256 public faucetCooldown = 24 hours;
    mapping(address => uint256) public lastFaucetAt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Faucet(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals); // owner supply buffer (optional)
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    // Faucet: one claim per address per 24 hours
    function faucet() external {
        require(block.timestamp - lastFaucetAt[msg.sender] >= faucetCooldown, "cooldown 24h");
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit Faucet(msg.sender, faucetAmount);
    }

    function setFaucetAmount(uint256 amount) external onlyOwner { faucetAmount = amount; }
    function setFaucetCooldown(uint256 secs) external onlyOwner { faucetCooldown = secs; }

    // Add supportsInterface to prevent wallet errors for non-ERC20 interfaces
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // ERC-721 interface ID (0x80ac58cd)
        // ERC-1155 metadata interface ID (0xd9b67a26)
        // This contract is an ERC-20, so it does not support ERC-721 or ERC-1155.
        // Returning false for these to prevent reverts.
        if (interfaceId == 0x80ac58cd || interfaceId == 0xd9b67a26) {
            return false;
        }
        // For other interfaces, including ERC-20 (which doesn't have a standard supportsInterface),
        // we can return true or false based on actual implementation.
        // Since this is a basic ERC-20, we'll return true for the ERC-165 interface itself
        // if we were to inherit ERC165, but for now, just return false for unknown interfaces.
        return false;
    }
}

/*************************************************************
 *  LiquidityPool.sol — simple USDT pool paying profits
 *************************************************************/

interface IFakeUSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract LiquidityPool {
    IFakeUSDT public immutable usdtToken;
    address public owner;
    address public futuresContract; // authorized to pay profits from pool

    uint256 public totalShares; // share token supply (internal accounting)
    mapping(address => uint256) public userShares;
    mapping(address => uint256) public userDeposits; // informational

    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount, uint256 shares);
    event FuturesSet(address indexed futures);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyFutures() { require(msg.sender == futuresContract, "not futures"); _; }

    constructor(address _usdt) {
        usdtToken = IFakeUSDT(_usdt);
        owner = msg.sender;
    }

    function setFuturesContract(address _f) external onlyOwner {
        futuresContract = _f;
        emit FuturesSet(_f);
    }

    function totalPoolBalance() public view returns (uint256) {
        return usdtToken.balanceOf(address(this));
    }

    function getPoolStats() external view returns (uint256 totalBalance, uint256 _totalShares, uint256 sharePrice) {
        totalBalance = totalPoolBalance();
        _totalShares = totalShares;
        sharePrice = _totalShares == 0 ? (10 ** usdtToken.decimals()) : (totalBalance * (10 ** usdtToken.decimals())) / _totalShares;
    }

    function getUserPoolShare(address user) external view returns (uint256 sharePctBps, uint256 usdtValue) {
        if (totalShares == 0) return (0, 0);
        sharePctBps = userShares[user] * 10_000 / totalShares; // basis points
        usdtValue = totalPoolBalance() * userShares[user] / totalShares;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        uint256 _totalBalance = totalPoolBalance();
        uint256 sharesToMint = totalShares == 0 ? amount : (amount * totalShares) / _totalBalance;
        require(usdtToken.transferFrom(msg.sender, address(this), amount), "transferFrom");
        totalShares += sharesToMint;
        userShares[msg.sender] += sharesToMint;
        userDeposits[msg.sender] += amount;
        emit Deposit(msg.sender, amount, sharesToMint);
    }

    function withdraw(uint256 shares) external {
        require(shares > 0 && userShares[msg.sender] >= shares, "shares");
        uint256 amount = totalPoolBalance() * shares / totalShares;
        userShares[msg.sender] -= shares;
        totalShares -= shares;
        require(usdtToken.transfer(msg.sender, amount), "transfer");
        emit Withdraw(msg.sender, amount, shares);
    }

    // Futures pays profit to trader from pool
    function payProfit(address to, uint256 amount) external onlyFutures returns (bool) {
        require(amount > 0, "amount=0");
        require(usdtToken.balanceOf(address(this)) >= amount, "insufficient pool");
        return usdtToken.transfer(to, amount);
    }

    function canPayProfit(uint256 amount) external view returns (bool) {
        return usdtToken.balanceOf(address(this)) >= amount;
    }
}

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

    function shouldLiquidate(uint256 positionId) external view returns (bool) {
        Position storage p = positions[positionId];
        if (!p.isActive) return false;
        uint256 current = assetPrices[p.asset];
        if (current == 0) return false;
        uint256 liq = getLiquidationPrice(positionId);
        return p.isLong ? (current <= liq) : (current >= liq);
    }

    function calculatePnL(uint256 positionId) public view returns (int256 pnl) {
        Position storage p = positions[positionId];
        require(p.isActive, "inactive");
        uint256 current = assetPrices[p.asset];
        require(current > 0, "price not set");
        // pnl = size * (current - entry) / entry
        // signed based on direction
        int256 diff = int256(current) - int256(p.entryPrice);
        int256 unsigned = int256((p.size * uint256(diff >= 0 ? diff : -diff)) / p.entryPrice);
        pnl = p.isLong ? (diff >= 0 ? int256((p.size * uint256(diff)) / p.entryPrice) : -int256(unsigned))
                       : (diff >= 0 ? -int256(unsigned) : int256((p.size * uint256(-diff)) / p.entryPrice));
    }

    // --- Trading ---
    function openPosition(string calldata asset, uint256 leverage, bool isLong, uint256 collateralAmount) external {
        require(leverage >= 2 && leverage <= 50, "lev");
        require(collateralAmount > 0, "collateral");
        uint256 price = assetPrices[asset];
        require(price > 0, "price not set");

        // take collateral
        require(usdtToken.transferFrom(msg.sender, address(this), collateralAmount), "collateral xfer");

        uint256 id = nextPositionId++;
        uint256 size = collateralAmount * leverage; // 6d
        positions[id] = Position({
            trader: msg.sender,
            asset: asset,
            collateral: collateralAmount,
            entryPrice: price,
            leverage: leverage,
            size: size,
            isLong: isLong,
            timestamp: block.timestamp,
            isActive: true
        });
        userPositions[msg.sender].push(id);

        emit PositionOpened(id, msg.sender, asset, collateralAmount, leverage, isLong);
    }

    function closePosition(uint256 positionId) external {
        Position storage p = positions[positionId];
        require(p.isActive, "inactive");
        require(p.trader == msg.sender, "not trader");
        uint256 price = assetPrices[p.asset];
        require(price > 0, "price not set");

        int256 pnl = calculatePnL(positionId); // signed USDT (6d)

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
