import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  ParsedInstruction,
} from '@solana/web3.js';
import prisma from '../../db/prisma';
import { convert } from '../../utils/exchange';
import 'dotenv/config';


// Solana configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.testnet.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Track processed transactions to prevent duplicates
const processedTransactions = new Set<string>();

// Get all user Solana addresses
async function getUserSolanaAddresses(): Promise<{ userId: number; address: string }[]> {
  try {
    const wallets = await prisma.wallet.findMany({
      where: {
        blockchain: 'Solana',
        network: 'testnet'
      },
      select: {
        userId: true,
        publicKey: true
      }
    });

    return wallets.map(wallet => ({
      userId: wallet.userId,
      address: wallet.publicKey
    }));
  } catch (error) {
    console.error('Error fetching Solana addresses:', error);
    return [];
  }
}

// Check if transaction is already processed
async function isTransactionProcessed(txHash: string): Promise<boolean> {
  if (processedTransactions.has(txHash)) {
    return true;
  }

  const existing = await prisma.deposit.findFirst({
    where: { txHash }
  });

  if (existing) {
    processedTransactions.add(txHash);
    return true;
  }

  return false;
}

// Parse SOL transfer from transaction
function parseSOLTransfer(
  transaction: ParsedTransactionWithMeta,
  userAddress: string
): { amount: number; fromAddress: string } | null {
  try {
    if (!transaction.meta || transaction.meta.err) {
      return null;
    }

    const instructions = transaction.transaction.message.instructions;

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.parsed?.type === 'transfer') {
        const parsed = instruction.parsed as any;

        // Check if this is a transfer TO our user address
        if (parsed.info.destination === userAddress) {
          const amount = parsed.info.lamports / LAMPORTS_PER_SOL;
          const fromAddress = parsed.info.source;

          return {
            amount,
            fromAddress
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing SOL transfer:', error);
    return null;
  }
}

// Process a single deposit
async function processDeposit(
  userId: number,
  txHash: string,
  fromAddress: string,
  toAddress: string,
  amount: number,
  blockNumber: number
): Promise<void> {
  try {
    // Generate unique order ID
    const orderId = `SOL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get exchange rate to USD
    let rate = 1;
    let realArrival = amount;

    try {
      rate = await convert(1, 'SOL', 'USD');
      realArrival = await convert(amount, 'SOL', 'USD');
    } catch (error) {
      console.warn('Failed to get exchange rate, using 1:1:', error);
    }

    // Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId,
        orderId,
        txHash,
        fromAddress,
        toAddress,
        currency: 'SOL',
        network: 'Solana',
        amount,
        rate,
        realArrival,
        status: 'confirmed',
        type: 'crypto',
        blockNumber: BigInt(blockNumber),
        confirmations: 1,
        confirmedAt: new Date()
      }
    });

    // Update user balance using transaction
    await prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findFirst({
        where: { userId, currency: 'SOL' }
      });

      if (!balance) {
        // Create balance if it doesn't exist
        await tx.balance.create({
          data: { userId, currency: 'SOL', amount }
        });
      } else {
        // Increment existing balance
        await tx.balance.update({
          where: { userId_currency: { userId, currency: 'SOL' } },
          data: { amount: { increment: amount } }
        });
      }
    });

    // Add to processed transactions
    processedTransactions.add(txHash);

    console.log(`✅ SOL deposit processed: ${amount} SOL for user ${userId} (Order: ${orderId})`);

  } catch (error) {
    console.error('Error processing SOL deposit:', error);
    throw error;
  }
}

// Monitor a single Solana address for deposits
async function monitorSolanaAddress(userId: number, address: string): Promise<void> {
  try {
    const publicKey = new PublicKey(address);

    // Get recent signatures for this address
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 10
    });

    for (const signatureInfo of signatures) {
      const txHash = signatureInfo.signature;

      // Skip if already processed
      if (await isTransactionProcessed(txHash)) {
        continue;
      }

      try {
        // Get full transaction details
        const transaction = await connection.getParsedTransaction(txHash, {
          maxSupportedTransactionVersion: 0
        });

        if (!transaction) {
          continue;
        }

        // Parse SOL transfer
        const transfer = parseSOLTransfer(transaction, address);

        if (transfer && transfer.amount > 0) {
          await processDeposit(
            userId,
            txHash,
            transfer.fromAddress,
            address,
            transfer.amount,
            signatureInfo.slot
          );
        }

      } catch (error) {
        console.error(`Error processing transaction ${txHash}:`, error);
        continue;
      }
    }

  } catch (error) {
    console.error(`Error monitoring Solana address ${address}:`, error);
  }
}

// Main Solana deposit monitoring function
export async function monitorSolanaDeposits(): Promise<void> {
  try {
    const addresses = await getUserSolanaAddresses();

    if (addresses.length === 0) {
      return;
    }

    // Process all addresses in parallel
    await Promise.all(
      addresses.map(({ userId, address }) =>
        monitorSolanaAddress(userId, address)
      )
    );

  } catch (error) {
    console.error('❌ Error in Solana deposit monitoring:', error);
  }
}

// Start continuous monitoring
export function startSolanaDepositMonitoring(): void {
  // Run immediately
  monitorSolanaDeposits();

  // Then run every 5 seconds for near-realtime updates
  setInterval(monitorSolanaDeposits, 5000);
}

// Get Solana deposit statistics
export async function getSolanaDepositStats(): Promise<{
  totalDeposits: number;
  totalAmount: number;
  pendingDeposits: number;
  confirmedDeposits: number;
}> {
  try {
    const stats = await prisma.deposit.aggregate({
      where: {
        network: 'Solana',
        currency: 'SOL'
      },
      _count: {
        id: true
      },
      _sum: {
        amount: true
      }
    });

    const statusCounts = await prisma.deposit.groupBy({
      by: ['status'],
      where: {
        network: 'Solana',
        currency: 'SOL'
      },
      _count: {
        id: true
      }
    });

    const pendingMatch = statusCounts.find(s => s.status === 'pending');
    const confirmedMatch = statusCounts.find(s => s.status === 'confirmed');
    const pendingCount = (pendingMatch && (pendingMatch as any)._count && (pendingMatch as any)._count.id) ? (pendingMatch as any)._count.id : 0;
    const confirmedCount = (confirmedMatch && (confirmedMatch as any)._count && (confirmedMatch as any)._count.id) ? (confirmedMatch as any)._count.id : 0;

    return {
      totalDeposits: stats._count.id || 0,
      totalAmount: Number(stats._sum.amount || 0),
      pendingDeposits: pendingCount,
      confirmedDeposits: confirmedCount
    };
  } catch (error) {
    console.error('Error getting Solana deposit stats:', error);
    return {
      totalDeposits: 0,
      totalAmount: 0,
      pendingDeposits: 0,
      confirmedDeposits: 0
    };
  }
}
