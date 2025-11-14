import { ethers } from 'ethers';
import { 
  createDeposit, 
  depositExists, 
  updateDepositStatus, 
  updateUserBalanceAfterDeposit,
  getAllUsersWithDepositAddresses 
} from '../db/deposits';
import { convert } from '../utils/exchange';
import 'dotenv/config';

// Ethereum configuration
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID';
const CONFIRMATION_THRESHOLD = 1; // Number of confirmations required
const POLL_INTERVAL = 15000; // Poll every 15 seconds
const BLOCK_RANGE = 100; // Check last 100 blocks

let provider: ethers.Provider;
let isPolling = false;
let lastProcessedBlock = 0;

// Initialize Ethereum provider
function initializeEthereumProvider() {
  try {
    provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
    console.log(`🔗 Ethereum provider initialized: ${ETHEREUM_RPC_URL}`);
  } catch (error) {
    console.error('❌ Failed to initialize Ethereum provider:', error);
    throw error;
  }
}

// Check if an address is a valid Ethereum address
function isValidEthereumAddress(address: string): boolean {
  return ethers.isAddress(address);
}

// Convert Wei to ETH
function weiToEth(wei: string | bigint): number {
  return parseFloat(ethers.formatEther(wei));
}

// Get ETH balance for an address
async function getEthBalance(address: string): Promise<number> {
  try {
    const balance = await provider.getBalance(address);
    return weiToEth(balance);
  } catch (error) {
    console.error(`Error getting ETH balance for ${address}:`, error);
    return 0;
  }
}

// Process a single transaction for ETH deposits
async function processEthereumTransaction(
  tx: ethers.TransactionResponse,
  receipt: ethers.TransactionReceipt,
  userAddresses: Array<{ userId: number; address: string; blockchain: string }>
) {
  try {
    if (!tx || !receipt || receipt.status !== 1) {
      return; // Transaction failed
    }

    const txHash = tx.hash;
    const toAddress = tx.to?.toLowerCase();
    const fromAddress = tx.from?.toLowerCase();
    const value = weiToEth(tx.value);

    if (!toAddress || value <= 0) {
      return;
    }

    // Check if this transaction is a deposit to any of our user addresses
    for (const userAddress of userAddresses) {
      if (userAddress.blockchain !== 'Ethereum') continue;

      const userAddr = userAddress.address.toLowerCase();
      
      if (toAddress === userAddr) {
        console.log(`🔍 Found ETH deposit: ${value} ETH to ${userAddress.address}`);

        // Check if deposit already exists
        const exists = await depositExists(txHash);
        if (exists) {
          console.log(`⚠️ Deposit already exists: ${txHash}`);
          continue;
        }

        // Create deposit record
        await createDeposit({
          userId: userAddress.userId,
          txHash,
          fromAddress: fromAddress || undefined,
          toAddress: userAddress.address,
          currency: 'ETH',
          network: 'Ethereum',
          amount: value,
          blockNumber: BigInt(receipt.blockNumber),
          confirmations: await receipt.confirmations()
        });

        // Update deposit status to confirmed
        await updateDepositStatus(txHash, 'confirmed', await receipt.confirmations());

        // Update user balance
        await updateUserBalanceAfterDeposit(
          userAddress.userId,
          'ETH',
          value
        );

        console.log(`✅ ETH deposit processed: ${txHash} - ${value} ETH`);
      }
    }
  } catch (error) {
    console.error(`Error processing Ethereum transaction ${tx?.hash}:`, error);
  }
}

// Get recent transactions for a specific address
async function getRecentTransactionsForAddress(
  address: string, 
  fromBlock: number, 
  toBlock: number
): Promise<Array<{ tx: ethers.TransactionResponse; receipt: ethers.TransactionReceipt }>> {
  try {
    const filter = {
      address: address,
      fromBlock: fromBlock,
      toBlock: toBlock
    };

    const logs = await provider.getLogs(filter);
    const transactions: Array<{ tx: ethers.TransactionResponse; receipt: ethers.TransactionReceipt }> = [];

    // Process each log to get the full transaction
    for (const log of logs) {
      try {
        const tx = await provider.getTransaction(log.transactionHash);
        const receipt = await provider.getTransactionReceipt(log.transactionHash);
        
        if (tx && receipt) {
          transactions.push({ tx, receipt });
        }
      } catch (error) {
        console.warn(`Failed to get transaction ${log.transactionHash}:`, error);
      }
    }

    return transactions;
  } catch (error) {
    console.error(`Error getting recent transactions for ${address}:`, error);
    return [];
  }
}

// Get recent blocks and check for deposits
async function checkRecentBlocksForDeposits(
  userAddresses: Array<{ userId: number; address: string; blockchain: string }>
) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(currentBlock - BLOCK_RANGE, lastProcessedBlock + 1);
    
    console.log(`🔍 Checking blocks ${fromBlock} to ${currentBlock} for ETH deposits`);

    // Get all unique Ethereum addresses
    const ethAddresses = userAddresses
      .filter(user => user.blockchain === 'Ethereum')
      .map(user => user.address.toLowerCase());

    if (ethAddresses.length === 0) {
      console.log('ℹ️ No Ethereum users found for deposit monitoring');
      return;
    }

    // Check each address for recent transactions
    for (const address of ethAddresses) {
      try {
        const transactions = await getRecentTransactionsForAddress(
          address,
          fromBlock,
          currentBlock
        );

        for (const { tx, receipt } of transactions) {
          await processEthereumTransaction(tx, receipt, userAddresses);
        }
      } catch (error) {
        console.error(`Error checking transactions for address ${address}:`, error);
      }
    }

    lastProcessedBlock = currentBlock;
  } catch (error) {
    console.error('Error checking recent blocks for deposits:', error);
  }
}

// Poll for new deposits
async function pollForDeposits() {
  if (isPolling) {
    console.log('⚠️ Ethereum deposit polling already in progress');
    return;
  }

  isPolling = true;
  console.log('🔍 Starting Ethereum deposit polling...');

  try {
    // Get all users with their Ethereum addresses
    const users = await getAllUsersWithDepositAddresses();
    const ethereumUsers = users
      .filter(user => user.addresses.some(addr => addr.blockchain === 'Ethereum'))
      .map(user => ({
        userId: user.userId,
        address: user.addresses.find(addr => addr.blockchain === 'Ethereum')?.address || '',
        blockchain: 'Ethereum'
      }))
      .filter(user => user.address && isValidEthereumAddress(user.address));

    if (ethereumUsers.length === 0) {
      console.log('ℹ️ No Ethereum users found for deposit monitoring');
      return;
    }

    console.log(`📊 Monitoring ${ethereumUsers.length} Ethereum addresses`);

    // Check recent blocks for deposits
    await checkRecentBlocksForDeposits(ethereumUsers);

  } catch (error) {
    console.error('Error in Ethereum deposit polling:', error);
  } finally {
    isPolling = false;
  }
}

// Start the Ethereum deposit monitoring service
export function startEthereumDepositMonitoring() {
  console.log('🚀 Starting Ethereum deposit monitoring service...');
  
  // Initialize provider
  initializeEthereumProvider();
  
  // Start polling immediately
  pollForDeposits();
  
  // Set up interval polling
  setInterval(pollForDeposits, POLL_INTERVAL);
  
  console.log(`✅ Ethereum deposit monitoring started (polling every ${POLL_INTERVAL/1000}s)`);
}

// Stop the monitoring service
export function stopEthereumDepositMonitoring() {
  console.log('🛑 Stopping Ethereum deposit monitoring service...');
  isPolling = false;
}

// Manual deposit check for a specific address
export async function checkDepositsForAddress(address: string, userId: number) {
  try {
    if (!isValidEthereumAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(currentBlock - BLOCK_RANGE, 0);
    
    const transactions = await getRecentTransactionsForAddress(
      address,
      fromBlock,
      currentBlock
    );

    const userAddress = { userId, address, blockchain: 'Ethereum' };

    for (const { tx, receipt } of transactions) {
      await processEthereumTransaction(tx, receipt, [userAddress]);
    }

    console.log(`✅ Manual deposit check completed for ${address}`);
  } catch (error) {
    console.error(`Error checking deposits for address ${address}:`, error);
    throw error;
  }
}

// Get Ethereum network status
export async function getEthereumNetworkStatus() {
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await (provider as any).getGasPrice();
    
    return {
      rpcUrl: ETHEREUM_RPC_URL,
      chainId: network.chainId.toString(),
      name: network.name,
      blockNumber,
      gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
      isConnected: true
    };
  } catch (error) {
    console.error('Error getting Ethereum network status:', error);
    return {
      rpcUrl: ETHEREUM_RPC_URL,
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Get ETH balance for an address
export async function getAddressEthBalance(address: string): Promise<number> {
  try {
    if (!isValidEthereumAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    return await getEthBalance(address);
  } catch (error) {
    console.error(`Error getting ETH balance for ${address}:`, error);
    throw error;
  }
}
