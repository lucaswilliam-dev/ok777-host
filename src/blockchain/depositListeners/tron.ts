import prisma from '../../db/prisma';
import { convert } from '../../utils/exchange';
import 'dotenv/config';

// Tron configuration - support both Shasta and Mainnet so DB addresses can be labeled either way
const TRON_RPC_SHASTA = 'https://api.shasta.trongrid.io';
const TRON_RPC_MAINNET = 'https://api.trongrid.io';
const TRON_RPC_URL = process.env.TRON_RPC_URL; // optional override

// Initialize TronWeb conditionally
let tronWebShasta: any = null;
let tronWebMainnet: any = null;
try {
  const TronWebModule = require('tronweb');
  const TronWeb = TronWebModule.TronWeb;
  const headers = { "TRON-PRO-API-KEY": process.env.TRON_API_KEY || '' } as any;
  // If an explicit TRON_RPC_URL is provided, use that for shasta slot; otherwise default to shasta endpoint.
  tronWebShasta = new TronWeb({ fullHost: TRON_RPC_URL || TRON_RPC_SHASTA, headers });
  tronWebMainnet = new TronWeb({ fullHost: TRON_RPC_MAINNET, headers });
} catch (error) {
  console.warn('TronWeb not available:', error);
}

// Track processed transactions to prevent duplicates
const processedTransactions = new Set<string>();

// Get all user Tron addresses
async function getUserTronAddresses(): Promise<{ userId: number; address: string }[]> {
  try {
    const wallets = await prisma.wallet.findMany({
      where: {
        blockchain: 'Tron'
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
    console.error('Error fetching Tron addresses:', error);
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

// Get recent transactions for an address
async function getRecentTransactions(address: string, limit: number = 20): Promise<any[]> {
  if (!tronWebShasta && !tronWebMainnet) {
    console.warn('TronWeb not available');
    return [];
  }

  try {
    const results: any[] = [];
    if (tronWebShasta) {
      try {
        const txs = await tronWebShasta.trx.getTransactionsRelated(address, 'to', limit);
        if (Array.isArray(txs)) results.push(...txs);
      } catch { }
    }
    if (tronWebMainnet) {
      try {
        const txs = await tronWebMainnet.trx.getTransactionsRelated(address, 'to', limit);
        if (Array.isArray(txs)) results.push(...txs);
      } catch { }
    }
    const uniq = new Map<string, any>();
    for (const tx of results) uniq.set(tx.txID, tx);
    return Array.from(uniq.values());
  } catch (error) {
    console.error('Error getting recent Tron transactions:', error);
    return [];
  }
}

// Parse TRX transfer from transaction
function parseTRXTransfer(
  transaction: any,
  userAddress: string
): { amount: number; fromAddress: string } | null {
  try {
    // Check if this is a TRX transfer
    if (transaction.raw_data && transaction.raw_data.contract) {
      for (const contract of transaction.raw_data.contract) {
        if (contract.type === 'TransferContract') {
          const parameter = contract.parameter.value;
          const converter = (tronWebShasta || tronWebMainnet);
          const toAddress = converter.address.fromHex(parameter.to_address);

          if (toAddress === userAddress && parameter.amount > 0) {
            const amount = parameter.amount / 1000000; // Convert from Sun to TRX
            const fromAddress = converter.address.fromHex(parameter.owner_address);

            return {
              amount,
              fromAddress
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing TRX transfer:', error);
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
  blockNumber: number,
  currency: string = 'TRX'
): Promise<void> {
  try {
    // Generate unique order ID
    const orderId = `${currency}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get exchange rate to USD
    let rate = 1;
    let realArrival = amount;

    try {
      rate = await convert(1, currency, 'USD');
      realArrival = await convert(amount, currency, 'USD');
    } catch (error) {
      console.warn(`Failed to get exchange rate for ${currency}, using 1:1:`, error);
    }

    // Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId,
        orderId,
        txHash,
        fromAddress,
        toAddress,
        currency,
        network: 'Tron',
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
        where: { userId, currency }
      });

      if (!balance) {
        // Create balance if it doesn't exist
        await tx.balance.create({
          data: { userId, currency, amount }
        });
      } else {
        // Increment existing balance
        await tx.balance.update({
          where: { userId_currency: { userId, currency } },
          data: { amount: { increment: amount } }
        });
      }
    });

    // Add to processed transactions
    processedTransactions.add(txHash);

    console.log(`✅ ${currency} deposit processed: ${amount} ${currency} for user ${userId} (Order: ${orderId})`);

  } catch (error) {
    console.error(`Error processing ${currency} deposit:`, error);
    throw error;
  }
}

// Monitor a single Tron address for deposits
async function monitorTronAddress(userId: number, address: string): Promise<void> {
  try {
    // Get recent transactions
    const transactions = await getRecentTransactions(address, 20);

    for (const transaction of transactions) {
      const txHash = transaction.txID;

      // Skip if already processed
      if (await isTransactionProcessed(txHash)) {
        continue;
      }

      try {
        // Parse TRX transfer
        const transfer = parseTRXTransfer(transaction, address);

        if (transfer && transfer.amount > 0) {
          await processDeposit(
            userId,
            txHash,
            transfer.fromAddress,
            address,
            transfer.amount,
            transaction.blockNumber || 0,
            'TRX'
          );
        }

      } catch (error) {
        console.error(`Error processing transaction ${txHash}:`, error);
        continue;
      }
    }

  } catch (error) {
    console.error(`Error monitoring Tron address ${address}:`, error);
  }
}

// Main Tron deposit monitoring function
export async function monitorTronDeposits(): Promise<void> {
  if (!tronWebShasta && !tronWebMainnet) {
    console.warn('TronWeb not available, skipping Tron deposit monitoring');
    return;
  }

  try {
  const addresses = await getUserTronAddresses();
  
  if (addresses.length === 0) {
    return;
  }

  // Process all addresses in parallel
  await Promise.all(
      addresses.map(({ userId, address }) =>
      monitorTronAddress(userId, address)
      )
  );

  } catch (error) {
    console.error('❌ Error in Tron deposit monitoring:', error);
  }
}

// Manual deposit check for a specific address
export async function checkTronDepositsForAddress(address: string): Promise<any> {
  if (!tronWebShasta && !tronWebMainnet) {
    console.warn('TronWeb not available');
    return { error: 'TronWeb not available' };
  }

  try {
    console.log(`🔍 Checking deposits for address: ${address}`);

    // Get recent transactions for this address
    const transactions = await getRecentTransactions(address, 20);

    let depositsFound = 0;
    let depositsProcessed = 0;

    for (const tx of transactions) {
      if (processedTransactions.has(tx.txID)) {
        continue;
      }

      // Check if this is a TRX deposit
      if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
        const contract = tx.raw_data.contract[0];
        if (contract.type === 'TransferContract' && contract.parameter && contract.parameter.value) {
          const transfer = contract.parameter.value;
          // Tron returns hex addresses; convert both to Base58 for comparison
          const toBase58 = (tronWebShasta || tronWebMainnet).address.fromHex(transfer.to_address);
          if (toBase58 === address) {
            // This is a deposit to our address
            const amount = transfer.amount / 1000000; // Convert from Sun to TRX

            if (amount > 0) {
              // Find the user ID for this address
              const wallet = await prisma.wallet.findFirst({
                where: { publicKey: address, blockchain: 'Tron' }
              });

              if (wallet) {
                await processDeposit(
                  wallet.userId,
                  tx.txID,
                  transfer.owner_address,
                  address,
                  amount,
                  tx.blockNumber || 0,
                  'TRX'
                );
                depositsFound++;
                depositsProcessed++;
                processedTransactions.add(tx.txID);
              }
            }
          }
        }
      }
    }

    return {
      address,
      transactionsChecked: transactions.length,
      depositsFound,
      depositsProcessed
    };
  } catch (error) {
    console.error(`Error checking deposits for ${address}:`, error);
    return { error: error.message };
  }
}

// Start continuous monitoring
export function startTronDepositMonitoring(): void {
// Run immediately
monitorTronDeposits();

// Then run every 5 seconds for near-realtime updates
setInterval(monitorTronDeposits, 5000);
}

// Get Tron deposit statistics
export async function getTronDepositStats(): Promise<{
  totalDeposits: number;
  totalAmount: number;
  pendingDeposits: number;
  confirmedDeposits: number;
}> {
  try {
    const stats = await prisma.deposit.aggregate({
      where: {
        network: 'Tron',
        currency: 'TRX'
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
        network: 'Tron',
        currency: 'TRX'
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
    console.error('Error getting Tron deposit stats:', error);
    return {
      totalDeposits: 0,
      totalAmount: 0,
      pendingDeposits: 0,
      confirmedDeposits: 0
    };
  }
}
