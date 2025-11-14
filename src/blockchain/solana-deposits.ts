import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { clusterApiUrl } from '@solana/web3.js';
import { 
  createDeposit, 
  depositExists, 
  updateDepositStatus, 
  updateUserBalanceAfterDeposit,
  getAllUsersWithDepositAddresses 
} from '../db/deposits';
import { convert } from '../utils/exchange';
import 'dotenv/config';

// Solana configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('testnet');
const CONFIRMATION_THRESHOLD = 1; // Number of confirmations required
const POLL_INTERVAL = 10000; // Poll every 10 seconds

let connection: Connection;
let isPolling = false;

// Initialize Solana connection
function initializeSolanaConnection() {
  try {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log(`🔗 Solana connection initialized: ${SOLANA_RPC_URL}`);
  } catch (error) {
    console.error('❌ Failed to initialize Solana connection:', error);
    throw error;
  }
}

// Check if an address is a valid Solana address
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Convert lamports to SOL
function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

// Check if transaction is a SOL transfer to our address
function isSolTransferToAddress(
  transaction: ParsedTransactionWithMeta,
  targetAddress: string
): { isTransfer: boolean; amount: number; fromAddress?: string } {
  try {
    if (!transaction.meta || transaction.meta.err) {
      return { isTransfer: false, amount: 0 };
    }

    const targetPubkey = new PublicKey(targetAddress);
    
    // Check if the target address received SOL
    const preBalances = transaction.meta.preBalances || [];
    const postBalances = transaction.meta.postBalances || [];
    const accountKeys = transaction.transaction.message.accountKeys || [];

    // Find the target address index
    const targetIndex = accountKeys.findIndex(key => 
      key.toString() === targetAddress
    );

    if (targetIndex === -1) {
      return { isTransfer: false, amount: 0 };
    }

    // Calculate SOL received
    const preBalance = preBalances[targetIndex] || 0;
    const postBalance = postBalances[targetIndex] || 0;
    const solReceived = lamportsToSol(postBalance - preBalance);

    if (solReceived <= 0) {
      return { isTransfer: false, amount: 0 };
    }

    // Find the sender (account that lost SOL)
    let fromAddress: string | undefined;
    for (let i = 0; i < accountKeys.length; i++) {
      if (i !== targetIndex && preBalances[i] > postBalances[i]) {
        fromAddress = accountKeys[i].toString();
        break;
      }
    }

    return {
      isTransfer: true,
      amount: solReceived,
      fromAddress
    };
  } catch (error) {
    console.error('Error checking SOL transfer:', error);
    return { isTransfer: false, amount: 0 };
  }
}

// Process a single transaction for SOL deposits
async function processSolanaTransaction(
  signature: string,
  transaction: any,
  userAddresses: Array<{ userId: number; address: string; blockchain: string }>
) {
  try {
    if (!transaction.meta || transaction.meta.err) {
      return;
    }

    // Check each user address for SOL deposits
    for (const userAddress of userAddresses) {
      if (userAddress.blockchain !== 'Solana') continue;

      const transferInfo = isSolTransferToAddress(transaction, userAddress.address);
      
      if (transferInfo.isTransfer && transferInfo.amount > 0) {
        console.log(`🔍 Found SOL deposit: ${transferInfo.amount} SOL to ${userAddress.address}`);

        // Check if deposit already exists
        const exists = await depositExists(signature);
        if (exists) {
          console.log(`⚠️ Deposit already exists: ${signature}`);
          continue;
        }

        // Create deposit record
        await createDeposit({
          userId: userAddress.userId,
          txHash: signature,
          fromAddress: transferInfo.fromAddress,
          toAddress: userAddress.address,
          currency: 'SOL',
          network: 'Solana',
          amount: transferInfo.amount,
          blockNumber: BigInt(transaction.slot),
          confirmations: 1
        });

        // Update deposit status to confirmed
        await updateDepositStatus(signature, 'confirmed', 1);

        // Update user balance
        await updateUserBalanceAfterDeposit(
          userAddress.userId,
          'SOL',
          transferInfo.amount
        );

        console.log(`✅ SOL deposit processed: ${signature} - ${transferInfo.amount} SOL`);
      }
    }
  } catch (error) {
    console.error(`Error processing Solana transaction ${signature}:`, error);
  }
}

// Get recent transactions for a specific address
async function getRecentTransactionsForAddress(address: string, limit: number = 10) {
  try {
    const publicKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit
    });

    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        try {
          const tx = await connection.getTransaction(sig.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          return { signature: sig.signature, transaction: tx };
        } catch (error) {
          console.warn(`Failed to get transaction ${sig.signature}:`, error);
          return null;
        }
      })
    );

    return transactions.filter(tx => tx !== null);
  } catch (error) {
    console.error(`Error getting recent transactions for ${address}:`, error);
    return [];
  }
}

// Poll for new deposits
async function pollForDeposits() {
  if (isPolling) {
    console.log('⚠️ Solana deposit polling already in progress');
    return;
  }

  isPolling = true;
  console.log('🔍 Starting Solana deposit polling...');

  try {
    // Get all users with their Solana addresses
    const users = await getAllUsersWithDepositAddresses();
    const solanaUsers = users
      .filter(user => user.addresses.some(addr => addr.blockchain === 'Solana'))
      .map(user => ({
        userId: user.userId,
        address: user.addresses.find(addr => addr.blockchain === 'Solana')?.address || '',
        blockchain: 'Solana'
      }))
      .filter(user => user.address && isValidSolanaAddress(user.address));

    if (solanaUsers.length === 0) {
      console.log('ℹ️ No Solana users found for deposit monitoring');
      return;
    }

    console.log(`📊 Monitoring ${solanaUsers.length} Solana addresses`);

    // Process each user's recent transactions
    for (const user of solanaUsers) {
      try {
        const recentTxs = await getRecentTransactionsForAddress(user.address, 5);
        
        for (const { signature, transaction } of recentTxs) {
          if (transaction) {
            await processSolanaTransaction(signature, transaction, [user]);
          }
        }
      } catch (error) {
        console.error(`Error processing transactions for user ${user.userId}:`, error);
      }
    }

  } catch (error) {
    console.error('Error in Solana deposit polling:', error);
  } finally {
    isPolling = false;
  }
}

// Start the Solana deposit monitoring service
export function startSolanaDepositMonitoring() {
  console.log('🚀 Starting Solana deposit monitoring service...');
  
  // Initialize connection
  initializeSolanaConnection();
  
  // Start polling immediately
  pollForDeposits();
  
  // Set up interval polling
  setInterval(pollForDeposits, POLL_INTERVAL);
  
  console.log(`✅ Solana deposit monitoring started (polling every ${POLL_INTERVAL/1000}s)`);
}

// Stop the monitoring service
export function stopSolanaDepositMonitoring() {
  console.log('🛑 Stopping Solana deposit monitoring service...');
  isPolling = false;
}

// Manual deposit check for a specific address
export async function checkDepositsForAddress(address: string, userId: number) {
  try {
    if (!isValidSolanaAddress(address)) {
      throw new Error('Invalid Solana address');
    }

    const recentTxs = await getRecentTransactionsForAddress(address, 10);
    const userAddress = { userId, address, blockchain: 'Solana' };

    for (const { signature, transaction } of recentTxs) {
      if (transaction) {
        await processSolanaTransaction(signature, transaction, [userAddress]);
      }
    }

    console.log(`✅ Manual deposit check completed for ${address}`);
  } catch (error) {
    console.error(`Error checking deposits for address ${address}:`, error);
    throw error;
  }
}

// Get Solana network status
export async function getSolanaNetworkStatus() {
  try {
    const version = await connection.getVersion();
    const epochInfo = await connection.getEpochInfo();
    const blockHeight = await connection.getBlockHeight();
    
    return {
      rpcUrl: SOLANA_RPC_URL,
      version: version['solana-core'],
      epoch: epochInfo.epoch,
      blockHeight,
      isConnected: true
    };
  } catch (error) {
    console.error('Error getting Solana network status:', error);
    return {
      rpcUrl: SOLANA_RPC_URL,
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
