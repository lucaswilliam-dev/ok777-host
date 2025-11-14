import { ethers } from 'ethers';
import prisma from '../../db/prisma';
import { convert } from '../../utils/exchange';
import 'dotenv/config';


// Ethereum configuration
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID';
const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);

// Track processed transactions to prevent duplicates
const processedTransactions = new Set<string>();

// Get all user Ethereum addresses
async function getUserEthereumAddresses(): Promise<{ userId: number; address: string }[]> {
  try {
    const wallets = await prisma.wallet.findMany({
      where: {
        blockchain: 'Ethereum',
        network: 'sepolia'
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
    console.error('Error fetching Ethereum addresses:', error);
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
async function getRecentTransactions(address: string, fromBlock: number): Promise<ethers.TransactionResponse[]> {
  try {
    const currentBlock = await provider.getBlockNumber();
    const toBlock = Math.min(currentBlock, fromBlock + 1000); // Limit to 1000 blocks per request

    const filter = {
      address: address,
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [
        ethers.id('Transfer(address,address,uint256)') // ERC20 Transfer event
      ]
    };

    const logs = await provider.getLogs(filter);
    const transactions: ethers.TransactionResponse[] = [];

    for (const log of logs) {
      try {
        const tx = await provider.getTransaction(log.transactionHash);
        if (tx) {
          transactions.push(tx);
        }
      } catch (error) {
        console.warn(`Error fetching transaction ${log.transactionHash}:`, error);
        continue;
      }
    }

    return transactions;
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    return [];
  }
}

// Parse ETH transfer from transaction
function parseETHTransfer(
  transaction: ethers.TransactionResponse,
  userAddress: string
): { amount: number; fromAddress: string } | null {
  try {
    // Check if this is a direct ETH transfer
    if (transaction.to?.toLowerCase() === userAddress.toLowerCase() && transaction.value > 0) {
      const amount = parseFloat(ethers.formatEther(transaction.value));
      const fromAddress = transaction.from;

      return {
        amount,
        fromAddress
      };
    }

    return null;
  } catch (error) {
    console.error('Error parsing ETH transfer:', error);
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
  currency: string = 'ETH'
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
        network: 'Ethereum',
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

// Monitor a single Ethereum address for deposits
async function monitorEthereumAddress(userId: number, address: string): Promise<void> {
  try {
    // Get the last processed block for this address
    const lastDeposit = await prisma.deposit.findFirst({
      where: {
        userId,
        network: 'Ethereum',
        toAddress: address
      },
      orderBy: {
        blockNumber: 'desc'
      }
    });

    const fromBlock = lastDeposit ? Number(lastDeposit.blockNumber) + 1 : 0;
    const currentBlock = await provider.getBlockNumber();

    if (fromBlock >= currentBlock) {
      return; // No new blocks to process
    }

    // Get recent transactions
    const transactions = await getRecentTransactions(address, fromBlock);

    for (const transaction of transactions) {
      const txHash = transaction.hash;

      // Skip if already processed
      if (await isTransactionProcessed(txHash)) {
        continue;
      }

      try {
        // Parse ETH transfer
        const transfer = parseETHTransfer(transaction, address);

        if (transfer && transfer.amount > 0) {
          await processDeposit(
            userId,
            txHash,
            transfer.fromAddress,
            address,
            transfer.amount,
            transaction.blockNumber || 0,
            'ETH'
          );
        }

      } catch (error) {
        console.error(`Error processing transaction ${txHash}:`, error);
        continue;
      }
    }

  } catch (error) {
    console.error(`Error monitoring Ethereum address ${address}:`, error);
  }
}

// Main Ethereum deposit monitoring function
export async function monitorEthereumDeposits(): Promise<void> {
  try {
    const addresses = await getUserEthereumAddresses();

    if (addresses.length === 0) {
      return;
    }

    // Process all addresses in parallel
    await Promise.all(
      addresses.map(({ userId, address }) =>
        monitorEthereumAddress(userId, address)
      )
    );

  } catch (error) {
    console.error('❌ Error in Ethereum deposit monitoring:', error);
  }
}

// Start continuous monitoring
export function startEthereumDepositMonitoring(): void {
  // Run immediately
  monitorEthereumDeposits();

  // Then run every 5 seconds for near-realtime updates
  setInterval(monitorEthereumDeposits, 5000);
}

// Get Ethereum deposit statistics
export async function getEthereumDepositStats(): Promise<{
  totalDeposits: number;
  totalAmount: number;
  pendingDeposits: number;
  confirmedDeposits: number;
}> {
  try {
    const stats = await prisma.deposit.aggregate({
      where: {
        network: 'Ethereum',
        currency: 'ETH'
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
        network: 'Ethereum',
        currency: 'ETH'
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
    console.error('Error getting Ethereum deposit stats:', error);
    return {
      totalDeposits: 0,
      totalAmount: 0,
      pendingDeposits: 0,
      confirmedDeposits: 0
    };
  }
}
