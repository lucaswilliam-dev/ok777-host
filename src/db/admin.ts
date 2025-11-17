import 'dotenv/config';
import { hashPassword } from '../utils/bcrypt';
import prisma from "./prisma";
import { topBalance } from './wallets';
// Defer blockchain operations to runtime to avoid importing modules at startup
import { convert } from '../utils/exchange';
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


export const createAdmin = async (email: string, password: string, role: string = 'admin', status: string = 'active') => {
    try {
        // Check if admin already exists
        const existingAdmin = await prisma.admin.findUnique({ where: { email } });
        if (existingAdmin) {
            throw new Error("Admin with this email already exists");
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create admin
        const admin = await prisma.admin.create({
            data: {
                email,
                password: hashedPassword,
                role,
                status,
            },
        });

        // Remove password from response
        const { password: _, ...adminWithoutPassword } = admin;
        return adminWithoutPassword;
    } catch (err) {
        console.log(err);
        throw err;
    }
};

export const login = async (email: string, password: string) => {
    try {

        const user = await prisma.admin.findUnique({ where: { email } });
        if (!user) {
            throw new Error("User not found");
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            throw new Error("Not correct password");
        }

        const token = jwt.sign(user, process.env.JWTPRIVATEKEY);
        return { token, user };

    } catch (err) {
        console.log(err);
        throw err;
    }
};


export const changePassword = async (userId: number, password: string, newPassword: string) => {
    try {

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });

        if (!existingUser) {
            throw new Error('User not found');
        } else {
            const match = await bcrypt.compare(password, existingUser.password);
            if (match) {

                const hash = await hashPassword(newPassword);
                await prisma.user.update({
                    where: { id: userId },
                    data: { password: hash }
                });

            } else {
                throw new Error('Not correct password');
            }

        }

    } catch (err) {
        console.log(err);
        throw err;
    }
};

function toNum(v: any) {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v);
    if (typeof v === "object" && "toNumber" in v) return Number((v as any).toNumber());
    return Number(v);
}

export async function getPlatformStats(range = 30) {
    // Clamp range
    if (![7, 30, 90].includes(range)) range = 30;

    // Date from: today - (range - 1) days (UTC midnight)
    const now = new Date();
    const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    dateFrom.setUTCDate(dateFrom.getUTCDate() - (range - 1));

    // 1. Aggregates
    const [userCount, depositsAgg, withdrawalsAgg, betsAgg] = await Promise.all([
        prisma.user.count(),
        prisma.transaction.aggregate({
            where: { type: "deposit", createdAt: { gte: dateFrom } },
            _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
            where: { type: "withdrawal", createdAt: { gte: dateFrom } },
            _sum: { amount: true },
        }),
        prisma.bet.aggregate({
            where: { createdAt: { gte: dateFrom } },
            _count: { id: true },
            _sum: { amount: true, payout: true },
        }),
    ]);

    const totalDeposits = toNum(depositsAgg._sum.amount);
    const totalWithdrawals = toNum(withdrawalsAgg._sum.amount);
    const totalBetAmount = toNum(betsAgg._sum.amount);
    const totalPayouts = toNum(betsAgg._sum.payout);
    const betPnL = totalBetAmount - totalPayouts; // platform P/L
    const netDeposits = totalDeposits - totalWithdrawals;

    // 2. Timeseries: daily deposits, withdrawals, bet amount/pnl
    type Row = { day: string; deposits?: string; withdrawals?: string; betamount?: string; betpayout?: string };

    const [txDaily, betsDaily] = await Promise.all([
        // Use unsafe raw with our lightweight prisma stub
        (prisma as any).$queryRawUnsafe(
            `SELECT
              to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
              SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END)::text AS deposits,
              SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END)::text AS withdrawals
            FROM "Transactions"
            WHERE "createdAt" >= $1
            GROUP BY 1
            ORDER BY 1 ASC;`,
            dateFrom
        ),
        (prisma as any).$queryRawUnsafe(
            `SELECT
              to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
              SUM(amount)::text  AS betamount,
              SUM(payout)::text  AS betpayout
            FROM "Bets"
            WHERE "createdAt" >= $1
            GROUP BY 1
            ORDER BY 1 ASC;`,
            dateFrom
        ),
    ]);

    // Fill missing days
    const days: string[] = [];
    for (let i = 0; i < range; i++) {
        const d = new Date(dateFrom);
        d.setUTCDate(dateFrom.getUTCDate() + i);
        days.push(d.toISOString().slice(0, 10));
    }

    const txMap = new Map((txDaily as any[]).map((r: any) => [r.day, r]));
    const betMap = new Map((betsDaily as any[]).map((r: any) => [r.day, r]));

    const timeseries = days.map(day => {
        const t = txMap.get(day) as any;
        const b = betMap.get(day) as any;
        const deposits = toNum(t?.deposits as any);
        const withdrawals = toNum(t?.withdrawals as any);
        const betAmount = toNum(b?.betamount as any);
        const betPayout = toNum(b?.betpayout as any);
        const betPnLDay = betAmount - betPayout;
        return { date: day, deposits, withdrawals, betAmount, betPnL: betPnLDay };
    });

    // 3. Distribution by currency
    type CurRow = { currency: string; volume: string };
    const byCurrencyRows = await prisma.$queryRaw<CurRow[]>`
    SELECT currency, SUM(amount)::text AS volume
    FROM "Transactions"
    WHERE "createdAt" >= ${dateFrom} AND type = 'deposit'
    GROUP BY currency
    ORDER BY SUM(amount) DESC
    LIMIT 12;
  `;
    const byCurrency = byCurrencyRows.map(r => ({
        currency: r.currency || "UNKNOWN",
        volume: toNum(r.volume),
    }));

    // 4. Distribution by game
    type GameRow = { game: number; volume: string };
    const byGameRows = await prisma.$queryRaw<GameRow[]>`
    SELECT game, SUM(amount)::text AS volume
    FROM "Bets"
    WHERE "createdAt" >= ${dateFrom}
    GROUP BY game
    ORDER BY SUM(amount) DESC
    LIMIT 12;
  `;
    const gameLabel = (g: number) =>
        ({ 1: "Big/Small", 2: "Lucky", 3: "NiuNiu", 4: "Banker/Player", 5: "Odd/Even" } as Record<number, string>)[g] || `Game ${g}`;
    const byGame = byGameRows.map(r => ({ game: gameLabel(r.game), volume: toNum(r.volume) }));

    return {
        summary: {
            userCount,
            totalDeposits,
            totalWithdrawals,
            totalBets: betsAgg._count.id,
            totalBetAmount,
            totalPayouts,
            betPnL,
            netDeposits,
        },
        timeseries,
        byCurrency,
        byGame,
    };
}

/* ================== USER MANAGEMENT ================== */

// 1. Basic user info
export async function getUserBasicInfo(userId: number) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            status: true,
            role: true,
            phone: true,
            balances: {
                select: {
                    currency: true,
                    amount: true,
                },
            },
        },
    });
}

// 2. Activated blockchain addresses
export async function getUserAddresses(userId: number) {
    return prisma.wallet.findMany({
        where: { userId },
        select: { id: true, publicKey: true, blockchain: true },
    });
}

// 3. Game records
export async function getUserGameRecords(userId: number, limit = 50, page = 1) {
    return prisma.bet.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
    });
}

export async function getUserTransactions(userId: number, limit = 50, page = 1) {

    // Count total items
    const total = await prisma.transaction.count({ where: { userId } });
    const totalPages = Math.ceil(total / limit);

    // Fetch paginated data
    const data = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
    });

    return {
        meta: {
            total,
            page,
            limit,
            totalPages,
        },
        data,
    };

}

export async function getTransactions(limit: number, page: number, search: string = null, type: string = null, currency: string = null) {

    const where: any = {};

    if (search && search.length) {
        where.OR = [
            { id: { contains: search, mode: "insensitive" } },      // transaction ID
            { userId: { contains: search, mode: "insensitive" } },  // user ID
            { address: { contains: search, mode: "insensitive" } }, // wallet address
        ];
    }

    if (type != "all") {
        where.type = type;
    }

    if (currency != "all") {
        where.currency = currency;
    }

    // Count total
    const total = await prisma.transaction.count({ where });
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const data = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
    });

    return {
        meta: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
        data,
    };

}
// 6. Agent commission records
// export async function getUserAgentCommissions(userId: number, limit = 50, page = 1) {
//   return prisma.agentCommission.findMany({
//     where: { userId },
//     orderBy: { createdAt: 'desc' },
//     skip: (page - 1) * limit,
//     take: limit,
//   });
// }

/* ================== ADMIN OPERATIONS ================== */

// Manual credit adjustment
// export async function adjustCredit(userId: number, amount: number, reason: string) {
//   return prisma.balance.update({
//     where: { userId },
//     data: { amount: { increment: amount } },
//   });
// }

// Manual debit adjustment
// export async function adjustDebit(userId: number, amount: number, reason: string) {
//   return prisma.balance.update({
//     where: { userId: userId },
//     data: { amount: { decrement: amount } },
//   });
// }

// Suspend / ban user
export async function suspendUser(userId: number) {
    return prisma.user.update({
        where: { id: userId },
        data: { status: 'suspended' },
    });
}

// Edit user info
export async function updateUserInfo(userId: number, data: Partial<{ name: string; email: string; status: string, role: string, phone: string }>) {
    return prisma.user.update({
        where: { id: userId },
        data: {
            name: data.name,
            email: data.email,
            status: data.status,
            role: data.role,
            phone: data.phone
        },
    });
}

export async function getUsersWithBalances(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            skip,
            take: limit,
            orderBy: { id: "desc" },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                status: true,
                role: true,
                balances: {
                    select: {
                        currency: true,
                        amount: true,
                    },
                },
            },
        }),
        prisma.user.count(),
    ]);

    return {
        data: users,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function topUpUserBalance(
    adminId: number,
    userId: number,
    currency: string,
    amount: number,
    description: string
) {
    if (amount <= 0) throw new Error("Amount must be greater than zero");

    return await prisma.$transaction(async (tx) => {
        // 1. Update or create balance
        const balance = await tx.balance.upsert({
            where: { userId_currency: { userId, currency } },
            update: { amount: { increment: amount } },
            create: { userId, currency, amount: amount },
        });

        // 2. Log the top-up
        await tx.log.create({
            data: {
                adminId,
                userId,
                type: "TOPUP",
                description,
            },
        });

        return balance;
    });
}

export async function getLogs({
    page = 1,
    pageSize = 20,
    userId,
    adminId,
}: {
    page?: number;
    pageSize?: number;
    userId?: number;
    adminId?: number;
}) {
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (userId) where.userId = userId;
    if (adminId) where.adminId = adminId;

    const [logs, total] = await Promise.all([
        prisma.log.findMany({
            skip,
            take: pageSize,
            where,
            orderBy: { createdAt: "desc" },
        }),
        prisma.log.count({ where }),
    ]);

    return {
        data: logs,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}

export async function readAllConfigs() {
    return await prisma.hashGameConfig.findMany({ orderBy: { id: 'asc' } });
}

export async function updateConfigById(
    id: number,
    newConfig: Partial<{
        type: string;
        // bigSmallHousePrivateKey: string;
        bigSmallHouseAddress: string;
        // luckyHousePrivateKey: string;
        luckyHouseAddress: string;
        // niuNiuHousePrivateKey: string;
        niuNiuHouseAddress: string;
        // bankerPlayerHousePrivateKey: string;
        bankerPlayerHouseAddress: string;
        // oddEvenHousePrivateKey: string;
        oddEvenHouseAddress: string;
    }>
) {
    return await prisma.hashGameConfig.update({
        where: { id },
        data: newConfig,
    });
}

// Read current game settings
export async function getGameSettings() {
    return prisma.gameSettings.findUnique({
        where: { id: 1 },
    });
}

// Update game settings
export async function updateGameSettings(data: {
    oddsNumerator: number;
    oddsDenominator: number;
    feeNumerator: number;
    feeDenominator: number;
    trxMin: number;
    trxMax: number;
    usdtMin: number;
    usdtMax: number;
}) {
    return prisma.gameSettings.update({
        where: { id: 1 },
        data,
    });
}

export const getAllProducts = async (page?: number, limit?: number) => {
    if (page !== undefined && limit !== undefined) {
        const skip = (page - 1) * limit;
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                skip: skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.product.count(),
        ]);
        return {
            data: products,
            meta: {
                total,
                page,
                pageSize: limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    return prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    });
};

export const toggleProductStatus = async (productCode: number, enabled: boolean) => {
    return prisma.product.update({
        where: { code: productCode },
        data: { enabled },
    });
};

export const updateProduct = (id: number, data: Partial<{
    provider: string
    currency: string
    status: string
    providerId: number
    code: number
    name: string
    gameType: string
    title: string
    enabled: boolean,
    image: string
}>) => {
    return prisma.product.update({
        where: { id },
        data,
    })
}

export const createProduct = (data: {
    provider: string
    currency: string
    status: string
    providerId: number
    code: number
    name: string
    gameType: string
    title: string
    enabled: boolean,
    image: string
}) => {
    return prisma.product.create({
        data,
    })
}

export const deleteProduct = (id: number) => {
    return prisma.product.delete({
        where: { id },
    })
}

export interface GetPayoutsParams {
    page?: number;
    pageSize?: number;
    status?: string;
    currency?: string;
    search?: string;
}

export async function getPayouts(params: GetPayoutsParams) {

    const { page = 1, pageSize = 10, status, currency, search } = params;

    const where: any = {};
    if (status) where.status = status;
    if (currency && currency !== "all") where.currency = currency;

    if (search) {
        where.OR = [
            {
                userId: {
                    equals: parseInt(search) || -1, // match numeric userId if search is number
                },
            },
            {
                to: {
                    contains: search, // match address partially
                    mode: "insensitive",
                },
            },
        ];
    }

    console.log("WHERE:", where);

    const payouts = await prisma.payout.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
    });

    const total = await prisma.payout.count({ where });

    return {
        data: payouts,
        meta: {
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        },
    };
}

export async function processPayout(payoutId: number) {

    const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (!payout.to) throw new Error("No recipient address");
    if (payout.status !== "pending") throw new Error("Payout already processed");

    if (payout.userId) {
        await topBalance(payout.userId, payout.amount, payout.currency);
    } else {
        if (payout.currency == "TRX") {
            const { withdrawTrxOnchain } = require('../blockchain/tron');
            await withdrawTrxOnchain(payout.to, payout.amount);
        } else if (payout.currency == "USDT") {
            const { withdrawTokenTronOnchain } = require('../blockchain/tron');
            await withdrawTokenTronOnchain(payout.to, payout.amount);
        }
    }

    const updated = await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "completed" },
    });

    return { payout: updated };
}

export const getAllCategories = async () => {
    return await prisma.gameCategory.findMany();
};

export const getGames = async (options: {
    categoryId?: string;
    page?: number;
    limit?: number;
    enabled?: boolean;
    search?: string;
    providerId?: string;
}) => {
    const { categoryId, page = 1, limit = 10, enabled, search , providerId} = options;

    const skip = (page - 1) * limit;

    const where: any = {
        status: "ACTIVATED"
    };

    if (categoryId && categoryId != "all") where.category = parseInt(categoryId);
    if (providerId && providerId != "all") where.productCode = parseInt(providerId);
    if (enabled !== undefined) where.enabled = enabled;
    if (search) where.gameName = { contains: search, mode: "insensitive" };

    // First, get all games and deduplicate by gameCode (keep the most recent one)
    const allGames = await prisma.game.findMany({
        where,
        orderBy: { createdAt: "desc" },
    });

    // Get all categories to map category IDs to names
    const categories = await prisma.gameCategory.findMany();
    const categoryMap = new Map();
    categories.forEach((cat) => {
        categoryMap.set(cat.id, cat.name);
    });

    // Deduplicate by gameCode - keep only the first occurrence (most recent due to orderBy)
    const uniqueGamesMap = new Map();
    for (const game of allGames) {
        if (!uniqueGamesMap.has(game.gameCode)) {
            uniqueGamesMap.set(game.gameCode, game);
        }
    }

    // Convert map values back to array and enrich with category name
    const uniqueGames = Array.from(uniqueGamesMap.values()).map((game) => {
        const categoryName = game.category ? categoryMap.get(game.category) : null;
        return {
            ...game,
            categoryName: categoryName || null, // Add category name to the game object
        };
    });

    // Apply pagination to unique games
    const total = uniqueGames.length;
    const paginatedGames = uniqueGames.slice(skip, skip + limit);

    return {
        data: paginatedGames,
        meta: {
            total,
            page,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export const getAllGames = async () => {

    return prisma.game.findMany({});

}

export const savedGamesBulk = async (games: Array<any>) => {

    const formated = games.map((data: any)=>{
        return {
            gameCode: data.game_code,
            gameName: data.game_name,
            gameType: data.game_type,
            imageUrl: data.image_url,
            productId: data.product_id,
            productCode: data.product_code,
            supportCurrency: data.support_currency,
            status: data.status,
            allowFreeRound: data.allow_free_round,
            langName: data.lang_name,
            langIcon: data.lang_icon,
            category: 1
        }
    })

    await prisma.tempGame.createMany({
        data: formated
    });

}

export const getTempGames = async () => {

    return prisma.tempGame.findMany({});

}

export const addGame = async (data) => {
    // Check if game already exists by gameCode
    const existingGame = await prisma.game.findFirst({
        where: { gameCode: data.gameCode }
    });

    // If game already exists, skip insertion
    if (existingGame) {
        return existingGame;
    }

    // Only create if game doesn't exist
    const game = await prisma.game.create({
        data: {
            gameCode: data.gameCode,
            gameName: data.gameName,
            gameType: data.gameType,
            imageUrl: data.imageUrl,
            productId: data.productId,
            productCode: data.productCode,
            supportCurrency: data.supportCurrency,
            status: data.status,
            allowFreeRound: data.allowFreeRound,
            langName: data.langName,
            langIcon: data.langIcon,
            category: data.category || 1
        }
    });

    await prisma.tempGame.deleteMany({ where : { gameCode: data.gameCode }});

    return game;
}

export const toggleGameEnabled = async (gameId: number) => {
    // First, fetch the current value
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { enabled: true },
    });

    if (!game) throw new Error("Game not found");

    // Toggle the value
    const updatedGame = await prisma.game.update({
        where: { id: gameId },
        data: { enabled: !game.enabled },
    });

    return updatedGame;
}

export const updateGameCategory = async (gameId: number, category: number) => {
    // Check if the game exists
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true },
    });

    if (!game) throw new Error("Game not found");

    // Update the category
    const updatedGame = await prisma.game.update({
        where: { id: gameId },
        data: { category },
    });

    return updatedGame;
}

export const updateGame = async (id: number, data: any)=> {
  return await prisma.game.update({
    where: { id },
    data,
  });
}

export const processWithdraw = async (id: number) => {
    const withdraw = await prisma.withdrawRequest.findUnique({ where: { id: id } });
    if (!withdraw) throw new Error("Payout not found");
    if (!withdraw.to) throw new Error("No recipient address");
    if (withdraw.status !== "pending") throw new Error("Payout already processed");

        if (withdraw.blockchain == "Tron") {
            if (withdraw.currency == "TRX") {
                const { withdrawTrx } = require('../blockchain/tron');
                let amount = await convert(withdraw.amount, "USDT", "TRX");
                await withdrawTrx(withdraw.userId, withdraw.to, amount);
            } else if (withdraw.currency == "USDT") {
                const { withdrawTokenTron } = require('../blockchain/tron');
                await withdrawTokenTron(withdraw.userId, withdraw.to, withdraw.amount);
            }
        } else if (withdraw.blockchain == "Ethereum") {
            if (withdraw.currency == "ETH") {
                const { withdrawEth } = require('../blockchain/ether');
                let amount = await convert(withdraw.amount, "USDT", "ETH");
                await withdrawEth(withdraw.userId, withdraw.to, amount);
            } else if (withdraw.currency == "USDT") {
                const { withdrawERC20 } = require('../blockchain/ether');
                await withdrawERC20(withdraw.userId, withdraw.to, withdraw.amount);
            }
                } else if (withdraw.blockchain == "Solana") {
                    if (withdraw.currency == "SOL") {
                        const { withdrawSol, canWithdrawSol } = require('../blockchain/solana');
                        let amount = await convert(withdraw.amount, "USD", "SOL");
                        
                        // Check if withdrawal is possible
                        const canWithdraw = await canWithdrawSol(amount);
                        if (!canWithdraw.canWithdraw) {
                            throw new Error(canWithdraw.reason || 'Cannot withdraw SOL at this time');
                        }
                        
                        await withdrawSol(withdraw.userId, withdraw.to, amount);
                    } else if (withdraw.currency == "USDC") {
                        const { withdrawUsdc, canWithdrawUsdc } = require('../blockchain/solana');
                        let amount = await convert(withdraw.amount, "USD", "USDC");
                        
                        // Check if withdrawal is possible
                        const canWithdraw = await canWithdrawUsdc(amount);
                        if (!canWithdraw.canWithdraw) {
                            throw new Error(canWithdraw.reason || 'Cannot withdraw USDC at this time');
                        }
                        
                        await withdrawUsdc(withdraw.userId, withdraw.to, amount);
                    }
        }

    const updated = await prisma.withdrawRequest.update({
        where: { id: id },
        data: { status: "completed" },
    });
}

export async function getWithdrawals(params: GetPayoutsParams) {

    const { page = 1, pageSize = 10, status, currency, search } = params;

    const where: any = {};
    if (status) where.status = status;
    if (currency && currency !== "all") where.currency = currency;

    if (search) {
        where.OR = [
            {
                userId: {
                    equals: parseInt(search) || -1, // match numeric userId if search is number
                },
            },
            {
                to: {
                    contains: search, // match address partially
                    mode: "insensitive",
                },
            },
        ];
    }

    console.log("WHERE:", where);

    const withdrawals = await prisma.withdrawRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
    });

    const total = await prisma.withdrawRequest.count({ where });

    return {
        data: withdrawals,
        meta: {
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        },
    };
}

// Create new category
export const createCategory = async (name: string) => {
    return prisma.gameCategory.create({
        data: { name },
    });
};

// Update category by ID
export const updateCategory = async (id: number, name: string) => {
    return prisma.gameCategory.update({
        where: { id },
        data: { name },
    });
};

// Delete category by ID
export const deleteCategory = async (id: number) => {
    return prisma.gameCategory.delete({
        where: { id },
    });
};
