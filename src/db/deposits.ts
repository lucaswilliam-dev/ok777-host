import prisma from './prisma';
import { convert } from '../utils/exchange';
import { v4 as uuidv4 } from 'uuid';

export interface CreateDepositData {
  userId: number;
  txHash: string;
  fromAddress?: string;
  toAddress: string;
  currency: string;
  network: string;
  amount: number;
  blockNumber?: bigint;
  confirmations?: number;
}

export interface DepositFilters {
  orderId?: string;
  userId?: number;
  txHash?: string;
  currency?: string;
  network?: string;
  type?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface DepositListResponse {
  deposits: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Create a new deposit record
export async function createDeposit(data: CreateDepositData) {
  try {
    // Generate unique order ID
    const orderId = `DEP_${Date.now()}_${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Convert amount to USD for rate calculation
    let rate: number | null = null;
    let realArrival: number | null = null;
    
    try {
      if (data.currency !== 'USD') {
        rate = await convert(1, data.currency, 'USD');
        realArrival = data.amount * rate;
      } else {
        rate = 1;
        realArrival = data.amount;
      }
    } catch (error) {
      console.warn(`Failed to convert ${data.currency} to USD:`, error);
      // Continue without conversion
    }

    const deposit = await prisma.deposit.create({
      data: {
        orderId,
        txHash: data.txHash,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        currency: data.currency,
        network: data.network,
        amount: data.amount,
        rate: rate,
        realArrival: realArrival,
        status: 'pending',
        type: 'crypto',
        blockNumber: data.blockNumber,
        confirmations: data.confirmations || 0,
        userId: data.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    console.log(`✅ Deposit created: ${orderId} - ${data.amount} ${data.currency} from ${data.network}`);
    return deposit;
  } catch (error) {
    console.error('Error creating deposit:', error);
    throw error;
  }
}

// Update deposit status
export async function updateDepositStatus(
  txHash: string, 
  status: 'pending' | 'confirmed' | 'failed',
  confirmations?: number
) {
  try {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'confirmed') {
      updateData.confirmedAt = new Date();
    }

    if (confirmations !== undefined) {
      updateData.confirmations = confirmations;
    }

    const deposit = await prisma.deposit.update({
      where: { txHash },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    console.log(`✅ Deposit status updated: ${txHash} -> ${status}`);
    return deposit;
  } catch (error) {
    console.error('Error updating deposit status:', error);
    throw error;
  }
}

// Get deposits with filtering and pagination
export async function getDeposits(filters: DepositFilters = {}): Promise<DepositListResponse> {
  try {
    const {
      orderId,
      userId,
      txHash,
      currency,
      network,
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = filters;

    const where: any = {};

    if (orderId) where.orderId = { contains: orderId, mode: 'insensitive' };
    if (userId) where.userId = userId;
    if (txHash) where.txHash = { contains: txHash, mode: 'insensitive' };
    if (currency) where.currency = currency;
    if (network) where.network = network;
    if (type) where.type = type;
    if (status) where.status = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        }
      }),
      prisma.deposit.count({ where })
    ]);

    return {
      deposits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting deposits:', error);
    throw error;
  }
}

// Get deposit by transaction hash
export async function getDepositByTxHash(txHash: string) {
  try {
    return await prisma.deposit.findUnique({
      where: { txHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });
  } catch (error) {
    console.error('Error getting deposit by tx hash:', error);
    throw error;
  }
}

// Check if deposit already exists
export async function depositExists(txHash: string): Promise<boolean> {
  try {
    const count = await prisma.deposit.count({
      where: { txHash }
    });
    return count > 0;
  } catch (error) {
    console.error('Error checking if deposit exists:', error);
    return false;
  }
}

// Get user's deposit addresses
export async function getUserDepositAddresses(userId: number) {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { 
        userId,
        blockchain: {
          in: ['Solana', 'Ethereum', 'Tron']
        }
      },
      select: {
        blockchain: true,
        publicKey: true,
        network: true
      }
    });

    return wallets.map(wallet => ({
      blockchain: wallet.blockchain,
      address: wallet.publicKey,
      network: wallet.network
    }));
  } catch (error) {
    console.error('Error getting user deposit addresses:', error);
    throw error;
  }
}

// Get all users with their deposit addresses
export async function getAllUsersWithDepositAddresses() {
  try {
    const users = await prisma.user.findMany({
      where: {
        wallets: {
          some: {
            blockchain: {
              in: ['Solana', 'Ethereum', 'Tron']
            }
          }
        }
      },
      include: {
        wallets: {
          where: {
            blockchain: {
              in: ['Solana', 'Ethereum', 'Tron']
            }
          },
          select: {
            blockchain: true,
            publicKey: true,
            network: true
          }
        }
      }
    });

    return users.map(user => ({
      userId: user.id,
      email: user.email,
      addresses: user.wallets.map(wallet => ({
        blockchain: wallet.blockchain,
        address: wallet.publicKey,
        network: wallet.network
      }))
    }));
  } catch (error) {
    console.error('Error getting all users with deposit addresses:', error);
    throw error;
  }
}

// Update user balance after confirmed deposit
export async function updateUserBalanceAfterDeposit(
  userId: number, 
  currency: string, 
  amount: number
) {
  try {
    // Get or create balance record
    let balance = await prisma.balance.findFirst({
      where: { userId, currency }
    });

    if (balance) {
      // Update existing balance
      balance = await prisma.balance.update({
        where: { id: balance.id },
        data: {
          amount: {
            increment: amount
          }
        }
      });
    } else {
      // Create new balance
      balance = await prisma.balance.create({
        data: {
          userId,
          currency,
          amount
        }
      });
    }

    console.log(`✅ User ${userId} balance updated: +${amount} ${currency}`);
    return balance;
  } catch (error) {
    console.error('Error updating user balance after deposit:', error);
    throw error;
  }
}
