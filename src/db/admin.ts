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

export const updateProduct = async (id: number, data: Partial<{
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
    const existingProduct = await prisma.product.findUnique({
        where: { id },
        select: { provider: true },
    });

    if (!existingProduct) {
        throw new Error("Product not found");
    }

    const updatedProduct = await prisma.product.update({
        where: { id },
        data,
    });

    // IMPORTANT: When product provider changes, update extra_provider field in Game table
    // DO NOT update provider field - provider is the original value used by GameStore page
    // Only extra_provider should be updated when product provider changes
    if (
        data.provider &&
        existingProduct.provider &&
        existingProduct.provider.toLowerCase() !== data.provider.toLowerCase()
    ) {
        // Update extra_provider for games that reference this product by productCode
        // Use the product code from the updated product
        const productCode = updatedProduct.code;
        await prisma.game.updateMany({
            where: {
                productCode: productCode,
            },
            data: {
                extra_provider: data.provider,
            },
        });
    }

    return updatedProduct;
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

export const deleteProduct = async (id: number) => {
    const product = await prisma.product.findUnique({
        where: { id },
        select: { provider: true },
    });

    if (!product) {
        throw new Error("Product not found");
    }

    if (product.provider) {
        const linkedGames = await prisma.game.count({
            where: {
                extra_provider: {
                    equals: product.provider,
                    mode: "insensitive",
                },
            },
        });

        if (linkedGames > 0) {
            const error: any = new Error(
                `Cannot delete provider "${product.provider}" because it is used by ${linkedGames} game${linkedGames === 1 ? "" : "s"}.`
            );
            error.statusCode = 409;
            throw error;
        }
    }

    return prisma.product.delete({
        where: { id },
    })
}

export const getGameFilterOptions = async () => {
    // IMPORTANT: Game store must always use original values (provider, gameType)
    // NOT the extra_* fields which are used for other purposes
    const games = await prisma.game.findMany({
        select: {
            provider: true,
            gameType: true,
            // Also get productCode to look up provider from Product table if needed
            productCode: true,
        },
    });

    // Get products to map productCode to provider (fallback for games without provider set)
    const products = await prisma.product.findMany({
        where: { enabled: true },
        select: {
            code: true,
            provider: true,
        },
    });
    const productMap = new Map();
    products.forEach((product) => {
        productMap.set(product.code, product.provider);
    });

    const providerSet = new Set<string>();
    const categorySet = new Set<string>();

    games.forEach((game) => {
        // Use provider from game table, fallback to Product table lookup
        const provider = (game.provider || (game.productCode ? productMap.get(game.productCode) : null) || "").trim();
        if (provider) {
            providerSet.add(provider);
        }

        // Use gameType (original value), NOT extra_gameType
        const category = (game.gameType || "").trim();
        if (category) {
            categorySet.add(category);
        }
    });

    return {
        providers: Array.from(providerSet).sort(),
        categories: Array.from(categorySet).sort(),
    };
};

export const deleteGamesByIds = async (ids: number[]) => {
    if (!ids || ids.length === 0) {
        return { count: 0 };
    }

    const uniqueIds = [...new Set(ids)].filter((id) => typeof id === "number" && !Number.isNaN(id));
    if (uniqueIds.length === 0) {
        return { count: 0 };
    }

    return prisma.game.deleteMany({
        where: {
            id: {
                in: uniqueIds,
            },
        },
    });
};

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
    categoryGameType?: string; // Category name to filter by gameType
    page?: number;
    limit?: number;
    enabled?: boolean;
    search?: string;
    providerId?: string;
    providerName?: string; // Provider name to filter by Game.provider field directly
    providerProductCodes?: number[]; // Legacy support: filter by product codes
    status?: string; // Filter by status: ACTIVATED, DEACTIVATED, or undefined for all
}) => {
    const { categoryId, categoryGameType, page = 1, limit = 10, enabled, search , providerId, providerName, providerProductCodes, status} = options;

    const skip = (page - 1) * limit;

    const where: any = {};
    // Build where clause with filters for status, category, provider, and search

    // Apply status filter if provided
    if (status && status !== "All") {
        where.status = status.toUpperCase(); // ACTIVATED or DEACTIVATED
    }

    // IMPORTANT: GameStore page filters ONLY on Game table fields (provider, gameType)
    // NOT on Product or Category tables - all filtering must use Game table directly
    
    // Filter by category: use gameType field from Game table directly
    if (categoryGameType && categoryGameType !== "All" && categoryGameType !== "all") {
        // Filter by gameType matching category name (from Game table directly)
        where.gameType = { equals: categoryGameType, mode: 'insensitive' };
    } else if (categoryId && categoryId != "all") {
        // Fallback: filter by category ID if categoryGameType not provided
        where.category = parseInt(categoryId);
    }
    
    // Filter by provider: use provider field from Game table directly
    // NOT productCode - filter directly on Game.provider field
    if (providerName && providerName !== "All" && providerName !== "all") {
        // Filter by provider name directly from Game table
        where.provider = { equals: providerName, mode: 'insensitive' };
    } else if (providerProductCodes && providerProductCodes.length > 0) {
        // Legacy support: filter by product codes (for backward compatibility)
        where.productCode = { in: providerProductCodes };
    } else if (providerId && providerId != "all") {
        // Legacy support: filter by single product code
        where.productCode = parseInt(providerId);
    }
    
    if (search) where.gameName = { contains: search, mode: "insensitive" };

    // Get all categories to map category IDs to names
    const categories = await prisma.gameCategory.findMany();
    const categoryMap = new Map();
    categories.forEach((cat) => {
        categoryMap.set(cat.id, cat.name);
    });

    // Get total count of filtered games
    const total = await prisma.game.count({ where });

    // Fetch filtered games with pagination from database
    const filteredGames = await prisma.game.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
            updatedAt: 'desc', // Order by most recently updated
        },
    });

    // Get all products to map product codes to providers (for fallback only)
    const products = await prisma.product.findMany({
        where: { enabled: true },
    });
    const productMap = new Map();
    products.forEach((product) => {
        productMap.set(product.code, product.provider);
    });

    // Add metadata (category name) to filtered games
    // Use provider from game table directly, with Product table as fallback for legacy games
    const gamesWithMetadata = filteredGames.map((game) => {
        const categoryName = game.category ? categoryMap.get(game.category) : null;
        // Use provider from game table, fallback to Product table lookup if not set (for legacy games)
        const provider = game.provider || (game.productCode ? productMap.get(game.productCode) : null) || null;
        return {
            ...game,
            categoryName: categoryName || null, // Add category name to the game object
            provider: provider, // Use provider from game table (with Product table as fallback)
        };
    });

    return {
        data: gamesWithMetadata,
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

export const getGamesInManager = async (options: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    providerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
}) => {
    const { page = 1, limit = 21, search, categoryId, providerId, status, startDate, endDate } = options;
    const skip = (page - 1) * limit;
    const where: any = {
        inManager: true,
    };
    const andConditions: any[] = [];

    if (status && status !== "All") {
        where.status = status.toUpperCase();
    }

    if (search) {
        where.gameName = { contains: search, mode: "insensitive" };
    }

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
            const parsedStart = new Date(startDate);
            if (!isNaN(parsedStart.getTime())) {
                where.createdAt.gte = parsedStart;
            }
        }
        if (endDate) {
            const parsedEnd = new Date(endDate);
            if (!isNaN(parsedEnd.getTime())) {
                where.createdAt.lte = parsedEnd;
            }
        }
        if (Object.keys(where.createdAt).length === 0) {
            delete where.createdAt;
        }
    }

    const categories = await prisma.gameCategory.findMany();
    const categoryMap = new Map();
    categories.forEach((cat) => {
        categoryMap.set(cat.id, cat.name);
    });

    if (categoryId && categoryId !== "all" && categoryId !== "All") {
        const normalizedCategoryId = categoryId.trim();
        const categoryConditions: any[] = [];

        let resolvedCategoryId: number | undefined;
        const parsedCategory = parseInt(normalizedCategoryId, 10);
        if (!isNaN(parsedCategory)) {
            resolvedCategoryId = parsedCategory;
        }

        const matchedCategory =
            categories.find((cat) => cat.name?.toLowerCase() === normalizedCategoryId.toLowerCase()) ||
            (resolvedCategoryId !== undefined
                ? categories.find((cat) => cat.id === resolvedCategoryId)
                : undefined);

        if (resolvedCategoryId !== undefined) {
            categoryConditions.push({ category: resolvedCategoryId });
        } else if (matchedCategory) {
            categoryConditions.push({ category: matchedCategory.id });
        }

        const categoryNameForExtra =
            matchedCategory?.name || (normalizedCategoryId.length ? normalizedCategoryId : undefined);

        if (categoryNameForExtra) {
            categoryConditions.push({
                extra_gameType: {
                    equals: categoryNameForExtra,
                    mode: "insensitive",
                },
            });
        }

        if (categoryConditions.length === 1) {
            andConditions.push(categoryConditions[0]);
        } else if (categoryConditions.length > 1) {
            andConditions.push({ OR: categoryConditions });
        }
    }

    const products = await prisma.product.findMany({
        where: { enabled: true },
    });
    const productMap = new Map();
    products.forEach((product) => {
        productMap.set(product.code, product.provider);
    });

    if (providerId && providerId !== "all" && providerId !== "All") {
        const normalizedProviderId = providerId.trim();
        const providerConditions: any[] = [];
        const parsedProvider = parseInt(normalizedProviderId, 10);

        if (!isNaN(parsedProvider)) {
            providerConditions.push({ productCode: parsedProvider });
        } else {
            const normalizedProvider = normalizedProviderId.toLowerCase();
            const matchingCodes = products
                .filter((product) => (product.provider || "").toLowerCase() === normalizedProvider)
                .map((product) => product.code);

            if (matchingCodes.length > 0) {
                providerConditions.push({ productCode: { in: matchingCodes } });
            }
        }

        if (normalizedProviderId.length > 0) {
            providerConditions.push({
                provider: {
                    equals: normalizedProviderId,
                    mode: "insensitive",
                },
            });
            providerConditions.push({
                extra_provider: {
                    equals: normalizedProviderId,
                    mode: "insensitive",
                },
            });
        }

        if (providerConditions.length === 1) {
            andConditions.push(providerConditions[0]);
        } else if (providerConditions.length > 1) {
            andConditions.push({ OR: providerConditions });
        }
    }

    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    // Get total count
    const total = await prisma.game.count({ where });

    // Fetch games with pagination
    const games = await prisma.game.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
            updatedAt: 'desc',
        },
    });

    // Add metadata
    const gamesWithMetadata = games.map((game) => {
        const categoryName = game.category ? categoryMap.get(game.category) : null;
        const provider = game.provider || (game.productCode ? productMap.get(game.productCode) : null) || null;
        return {
            ...game,
            categoryName: categoryName || null,
            provider: provider,
        };
    });

    return {
        data: gamesWithMetadata,
        meta: {
            total,
            page,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
        },
    };
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
    // IMPORTANT: Never add the exact same game from a third-party vendor
    // Check for exact duplicate: same gameCode AND same productCode
    // This ensures we don't add the same game twice from the same provider
    const whereClause: any = { gameCode: data.gameCode };
    
    // If productCode is provided, check for exact match (gameCode + productCode)
    // This is the most reliable way to identify the exact same game
    if (data.productCode) {
        whereClause.productCode = data.productCode;
    }
    
    const existingGame = await prisma.game.findFirst({
        where: whereClause
    });

    // If exact duplicate exists, return it without creating a new entry
    if (existingGame) {
        // Log duplicate detection for monitoring
        console.log(`⚠️ [DUPLICATE DETECTED] Game already exists - gameCode: ${data.gameCode}, productCode: ${data.productCode || 'N/A'}, skipping duplicate insertion`);
        
        // Update provider and extra fields if missing (but don't create duplicate)
        const updateData: any = {};
        let needsUpdate = false;
        
        // If provider is missing, try to get it from Product table
        if (!existingGame.provider && data.productCode) {
            const product = await prisma.product.findUnique({
                where: { code: data.productCode },
                select: { provider: true },
            });
            if (product) {
                updateData.provider = product.provider;
                updateData.extra_provider = product.provider;
                needsUpdate = true;
            }
        }
        
        // Sync extra_gameType with gameType if they don't match
        if (existingGame.gameType && existingGame.extra_gameType !== existingGame.gameType) {
            updateData.extra_gameType = existingGame.gameType;
            needsUpdate = true;
        }
        
        // Sync extra_provider with provider if they don't match
        if (existingGame.provider && existingGame.extra_provider !== existingGame.provider) {
            updateData.extra_provider = existingGame.provider;
            needsUpdate = true;
        }

        // Ensure new extra fields mirror current values
        if (existingGame.gameName && existingGame.extra_gameName !== existingGame.gameName) {
            updateData.extra_gameName = existingGame.gameName;
            needsUpdate = true;
        }
        if (existingGame.langName && JSON.stringify(existingGame.extra_langName) !== JSON.stringify(existingGame.langName)) {
            updateData.extra_langName = existingGame.langName;
            needsUpdate = true;
        }
        if (existingGame.imageUrl && existingGame.extra_imageUrl !== existingGame.imageUrl) {
            updateData.extra_imageUrl = existingGame.imageUrl;
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            const updatedGame = await prisma.game.update({
                where: { id: existingGame.id },
                data: updateData,
            });
            return updatedGame;
        }
        
        return existingGame;
    }

    // Look up provider from Product table using productCode
    let provider: string | undefined = undefined;
    if (data.productCode) {
        const product = await prisma.product.findUnique({
            where: { code: data.productCode },
            select: { provider: true },
        });
        if (product) {
            provider = product.provider;
        }
    }

    // Final safety check: Verify no exact duplicate exists before creating
    // This prevents race conditions or edge cases where duplicate might slip through
    const finalCheck = await prisma.game.findFirst({
        where: {
            gameCode: data.gameCode,
            ...(data.productCode && { productCode: data.productCode })
        }
    });
    
    if (finalCheck) {
        console.log(`⚠️ [DUPLICATE PREVENTED] Exact game already exists - gameCode: ${data.gameCode}, productCode: ${data.productCode || 'N/A'}, returning existing game`);
        return finalCheck;
    }

    // Only create if game doesn't exist (verified by checks above)
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
            category: data.category || 1,
            provider: provider, // Set provider from Product table
            extra_gameType: data.gameType, // Set extra_gameType to same value as gameType
            extra_provider: provider, // Set extra_provider to same value as provider
            extra_gameName: data.gameName,
            extra_langName: data.langName,
            extra_imageUrl: data.imageUrl,
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
  // Only update the fields that are explicitly provided
  // Do NOT sync base fields (langName, provider, gameType) when extra_* fields are updated
  const updateData: any = {};
  
  // Only include fields that are explicitly provided in the data
  // Base fields (langName, provider, gameType, gameName, imageUrl) are only updated if explicitly provided
  if (data.langName !== undefined) {
    updateData.langName = data.langName;
  }
  if (data.provider !== undefined) {
    updateData.provider = data.provider;
  }
  if (data.gameType !== undefined) {
    updateData.gameType = data.gameType;
  }
  if (data.gameName !== undefined) {
    updateData.gameName = data.gameName;
  }
  if (data.imageUrl !== undefined) {
    updateData.imageUrl = data.imageUrl;
  }
  
  // Extra fields can be updated independently without affecting base fields
  if (data.extra_langName !== undefined) {
    updateData.extra_langName = data.extra_langName;
  }
  if (data.extra_provider !== undefined) {
    updateData.extra_provider = data.extra_provider;
  }
  if (data.extra_gameType !== undefined) {
    updateData.extra_gameType = data.extra_gameType;
  }
  if (data.extra_gameName !== undefined) {
    updateData.extra_gameName = data.extra_gameName;
  }
  if (data.extra_imageUrl !== undefined) {
    updateData.extra_imageUrl = data.extra_imageUrl;
  }
  
  // Include any other fields that might be passed
  const allowedFields = [
    'status', 'enabled', 'category', 'allowFreeRound', 'supportCurrency',
    'isHot', 'isNew', 'isRecommended', 'onlinePlayers', 'launchParams',
    'visibility', 'aggregator', 'inManager', 'coverImage', 'langIcon'
  ];
  
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }
  
  return await prisma.game.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Backfill provider field for games that don't have it set
 * This function looks up the provider from the Product table using productCode
 * and updates the game's provider field
 */
export const backfillGameProviders = async () => {
    // Find all games without a provider
    const gamesWithoutProvider = await prisma.game.findMany({
        where: {
            OR: [
                { provider: null },
                { provider: "" },
            ],
        },
        select: {
            id: true,
            productCode: true,
        },
    });

    console.log(`Found ${gamesWithoutProvider.length} games without provider`);

    let updated = 0;
    let notFound = 0;

    // Get all products to create a lookup map
    const products = await prisma.product.findMany({
        where: { enabled: true },
        select: {
            code: true,
            provider: true,
        },
    });

    const productMap = new Map();
    products.forEach((product) => {
        productMap.set(product.code, product.provider);
    });

    // Update each game with its provider
    for (const game of gamesWithoutProvider) {
        if (game.productCode) {
            const provider = productMap.get(game.productCode);
            if (provider) {
                await prisma.game.update({
                    where: { id: game.id },
                    data: { provider },
                });
                updated++;
            } else {
                notFound++;
                console.warn(`No product found for game ${game.id} with productCode ${game.productCode}`);
            }
        } else {
            notFound++;
            console.warn(`Game ${game.id} has no productCode`);
        }
    }

    console.log(`Backfill complete: ${updated} games updated, ${notFound} games could not be updated`);

    return {
        total: gamesWithoutProvider.length,
        updated,
        notFound,
    };
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
export const createCategory = async (name: string, icon?: string) => {
    return prisma.gameCategory.create({
        data: { name, icon: icon || null },
    });
};

// Update category by ID
export const updateCategory = async (id: number, name: string, icon?: string) => {
    const existingCategory = await prisma.gameCategory.findUnique({
        where: { id },
        select: { name: true },
    });

    if (!existingCategory) {
        throw new Error("Category not found");
    }

    const updateData: any = { name };
    if (icon !== undefined) {
        updateData.icon = icon || null;
    }

    const updatedCategory = await prisma.gameCategory.update({
        where: { id },
        data: updateData,
    });

    // IMPORTANT: When category name changes, update extra_gameType field in Game table
    // DO NOT update gameType field - gameType is the original value used by GameStore page
    // Only extra_gameType should be updated when category name changes
    if (
        existingCategory.name &&
        existingCategory.name.toLowerCase() !== name.toLowerCase()
    ) {
        // Update extra_gameType for ALL games linked to this category:
        // 1. Games where extra_gameType matches the old category name
        // 2. Games where category ID matches this category
        await prisma.game.updateMany({
            where: {
                OR: [
                    {
                        extra_gameType: {
                            equals: existingCategory.name,
                            mode: "insensitive",
                        },
                    },
                    {
                        category: id,
                    },
                ],
            },
            data: {
                extra_gameType: name,
            },
        });
    }

    return updatedCategory;
};

// Delete category by ID
export const deleteCategory = async (id: number) => {
    const category = await prisma.gameCategory.findUnique({
        where: { id },
        select: { name: true },
    });

    if (!category) {
        throw new Error("Category not found");
    }

    if (category.name) {
        const linkedGames = await prisma.game.count({
            where: {
                extra_gameType: {
                    equals: category.name,
                    mode: "insensitive",
                },
            },
        });

        if (linkedGames > 0) {
            const error: any = new Error(
                `Cannot delete category "${category.name}" because it is used by ${linkedGames} game${linkedGames === 1 ? "" : "s"}.`
            );
            error.statusCode = 409;
            throw error;
        }
    }

    return prisma.gameCategory.delete({
        where: { id },
    });
};