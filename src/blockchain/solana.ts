import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BigNumber from 'bignumber.js';
import { saveTransaction, minusBalance, getBalance } from '../db/wallets';

// Solana configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const MAIN_POOL_PRIVATE_KEY = process.env.SOLANA_MAIN_POOL_PRIVATE_KEY;

// USDC mint address on Solana (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
// Using devnet for testing
const USDC_MINT_ADDRESS = process.env.SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // USDC devnet

// Fee configuration (similar to Tron)
const SOL_WITHDRAWAL_FEE = 0.005; // 0.005 SOL fee
const USDC_WITHDRAWAL_FEE = 1; // 1 USDC fee
const MIN_SOL_BALANCE = 0.01; // Minimum SOL balance to maintain
const MIN_USDC_BALANCE = 1; // Minimum USDC balance to maintain

let connection: Connection;
let mainPoolKeypair: Keypair;

// Initialize Solana connection and main pool keypair
export const initializeSolana = () => {
  try {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    if (!MAIN_POOL_PRIVATE_KEY) {
      throw new Error('SOLANA_MAIN_POOL_PRIVATE_KEY environment variable is required');
    }
    
    // Convert private key from base64 string to Keypair
    const privateKeyBytes = Buffer.from(MAIN_POOL_PRIVATE_KEY, 'base64');
    
    // Validate private key size
    if (privateKeyBytes.length !== 64) {
      throw new Error(`Invalid private key size: ${privateKeyBytes.length} bytes. Expected 64 bytes (512 bits). Please check your SOLANA_MAIN_POOL_PRIVATE_KEY.`);
    }
    
    mainPoolKeypair = Keypair.fromSecretKey(privateKeyBytes);
    
    console.log('✅ Solana initialized successfully');
    console.log('🔗 RPC URL:', SOLANA_RPC_URL);
    console.log('💰 Main Pool Address:', mainPoolKeypair.publicKey.toString());
  } catch (error) {
    console.error('❌ Failed to initialize Solana:', error);
    throw error;
  }
};

// Get Solana connection
export const getSolanaConnection = (): Connection => {
  if (!connection) {
    initializeSolana();
  }
  return connection;
};

// Get main pool keypair
export const getMainPoolKeypair = (): Keypair => {
  if (!mainPoolKeypair) {
    initializeSolana();
  }
  return mainPoolKeypair;
};

// Check if a Solana address is valid
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// Get SOL balance
export const getSolBalance = async (address: string): Promise<number> => {
  try {
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    throw new Error('Failed to get SOL balance');
  }
};

// Get USDC token balance
export const getUsdcBalance = async (address: string): Promise<number> => {
  try {
    const publicKey = new PublicKey(address);
    const mintPublicKey = new PublicKey(USDC_MINT_ADDRESS);
    
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      publicKey
    );
    
    try {
      const accountInfo = await getAccount(connection, associatedTokenAddress);
      return Number(accountInfo.amount) / 1e6; // USDC has 6 decimals
    } catch {
      // Account doesn't exist, balance is 0
      return 0;
    }
  } catch (error) {
    console.error('Error getting USDC balance:', error);
    throw new Error('Failed to get USDC balance');
  }
};

// Withdraw SOL (matching Tron pattern)
export const withdrawSol = async (userId: number, to: string, amount: number): Promise<string> => {
  try {
    console.log(`🚀 Withdrawing ${amount} SOL to ${to}`);
    
    const connection = getSolanaConnection();
    const mainPool = getMainPoolKeypair();
    
    // Validate recipient address
    if (!isValidSolanaAddress(to)) {
      throw new Error('Invalid Solana address');
    }
    
    const recipientPublicKey = new PublicKey(to);
    
    // Use BigNumber for precise calculations (like Tron)
    const amountBN = new BigNumber(amount);
    const feeBN = new BigNumber(SOL_WITHDRAWAL_FEE);
    const totalAmountBN = amountBN.plus(feeBN);
    
    // Convert to lamports with precise calculation
    const lamports = totalAmountBN.times(LAMPORTS_PER_SOL).integerValue(BigNumber.ROUND_DOWN);
    
    console.log(`💰 Amount: ${amount} SOL, Fee: ${SOL_WITHDRAWAL_FEE} SOL, Total: ${totalAmountBN.toString()} SOL`);
    
    // Check main pool balance
    const mainPoolBalance = await connection.getBalance(mainPool.publicKey);
    const mainPoolBalanceSOL = new BigNumber(mainPoolBalance).dividedBy(LAMPORTS_PER_SOL);
    
    console.log(`🏦 Main pool balance: ${mainPoolBalanceSOL.toString()} SOL`);
    
    if (mainPoolBalance < lamports.toNumber()) {
      throw new Error(`Insufficient SOL balance in main pool. Required: ${totalAmountBN.toString()} SOL, Available: ${mainPoolBalanceSOL.toString()} SOL`);
    }
    
    // Check minimum balance requirement
    const remainingBalance = mainPoolBalanceSOL.minus(totalAmountBN);
    if (remainingBalance.isLessThan(MIN_SOL_BALANCE)) {
      throw new Error(`Insufficient balance after withdrawal. Must maintain at least ${MIN_SOL_BALANCE} SOL`);
    }
    
    // Create transfer transaction
    const transaction = new Transaction().add(
                SystemProgram.transfer({
        fromPubkey: mainPool.publicKey,
        toPubkey: recipientPublicKey,
        lamports: lamports.toNumber(),
      })
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [mainPool],
      { 
        commitment: 'confirmed',
        maxRetries: 3,
        skipPreflight: false
      }
    );
    
    if (!signature) {
      throw new Error('Transaction failed or not broadcasted');
    }
    
    console.log(`✅ SOL withdrawal successful | Signature: ${signature}`);
    
    // Save transaction to database (like Tron)
    await saveTransaction(userId, to, -amount, 'SOL', signature, 'withdraw');
    
    // Update user balance (like Tron)
    await minusBalance(userId, amount, 'SOL');
    
    console.log(`📉 User ${userId} SOL balance reduced by ${amount}`);
    
    return signature;
    
  } catch (error) {
    console.error('❌ SOL withdrawal failed:', error);
    throw error;
  }
};

// Withdraw USDC (matching Tron pattern)
export const withdrawUsdc = async (userId: number, to: string, amount: number): Promise<string> => {
  try {
    console.log(`🚀 Withdrawing ${amount} USDC to ${to}`);
    
    const connection = getSolanaConnection();
    const mainPool = getMainPoolKeypair();
    
    // Validate recipient address
    if (!isValidSolanaAddress(to)) {
      throw new Error('Invalid Solana address');
    }
    
    const recipientPublicKey = new PublicKey(to);
    const mintPublicKey = new PublicKey(USDC_MINT_ADDRESS);
    
    // Use BigNumber for precise calculations (like Tron)
    const amountBN = new BigNumber(amount);
    const feeBN = new BigNumber(USDC_WITHDRAWAL_FEE);
    const totalAmountBN = amountBN.plus(feeBN);
    
    console.log(`💰 Amount: ${amount} USDC, Fee: ${USDC_WITHDRAWAL_FEE} USDC, Total: ${totalAmountBN.toString()} USDC`);
    
    // Get or create associated token account for recipient
    const recipientTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      recipientPublicKey
    );
    
    // Get main pool's USDC token account
    const mainPoolTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      mainPool.publicKey
    );
    
    // Check main pool USDC balance first
    const mainPoolUsdcBalance = await getUsdcBalance(mainPool.publicKey.toString());
    const mainPoolUsdcBalanceBN = new BigNumber(mainPoolUsdcBalance);
    
    console.log(`🏦 Main pool USDC balance: ${mainPoolUsdcBalanceBN.toString()} USDC`);
    
    if (mainPoolUsdcBalanceBN.isLessThan(totalAmountBN)) {
      throw new Error(`Insufficient USDC balance in main pool. Required: ${totalAmountBN.toString()} USDC, Available: ${mainPoolUsdcBalanceBN.toString()} USDC`);
    }
    
    // Check minimum balance requirement
    const remainingBalance = mainPoolUsdcBalanceBN.minus(totalAmountBN);
    if (remainingBalance.isLessThan(MIN_USDC_BALANCE)) {
      throw new Error(`Insufficient balance after withdrawal. Must maintain at least ${MIN_USDC_BALANCE} USDC`);
    }
    
    // Check if recipient has a token account, create if not
    try {
      await getAccount(connection, recipientTokenAccount);
      console.log(`✅ Recipient token account exists: ${recipientTokenAccount.toString()}`);
    } catch {
      console.log(`📝 Creating recipient token account: ${recipientTokenAccount.toString()}`);
      // Create associated token account for recipient
      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        mainPool.publicKey, // payer
        recipientTokenAccount, // associated token account
        recipientPublicKey, // owner
        mintPublicKey // mint
      );
      
      const createTransaction = new Transaction().add(createAccountInstruction);
      await sendAndConfirmTransaction(connection, createTransaction, [mainPool], {
        commitment: 'confirmed',
        maxRetries: 3
      });
    }
    
    // Create transfer instruction with precise amount calculation
    const transferAmount = totalAmountBN.times(1e6).integerValue(BigNumber.ROUND_DOWN); // USDC has 6 decimals
    const transferInstruction = createTransferInstruction(
      mainPoolTokenAccount, // source
      recipientTokenAccount, // destination
      mainPool.publicKey, // owner
      transferAmount.toNumber(),
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Create and send transaction
    const transaction = new Transaction().add(transferInstruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [mainPool],
      { 
        commitment: 'confirmed',
        maxRetries: 3,
        skipPreflight: false
      }
    );
    
    if (!signature) {
      throw new Error('Transaction failed or not broadcasted');
    }
    
    console.log(`✅ USDC withdrawal successful | Signature: ${signature}`);
    
    // Save transaction to database (like Tron)
    await saveTransaction(userId, to, -amount, 'USDC', signature, 'withdraw');
    
    // Update user balance (like Tron)
    await minusBalance(userId, amount, 'USDC');
    
    console.log(`📉 User ${userId} USDC balance reduced by ${amount}`);
    
    return signature;
    
  } catch (error) {
    console.error('❌ USDC withdrawal failed:', error);
    throw error;
  }
};

// Get transaction status
export const getTransactionStatus = async (signature: string): Promise<{
  confirmed: boolean;
  slot?: number;
  blockTime?: number;
  error?: string;
}> => {
  try {
    const connection = getSolanaConnection();
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value?.err) {
      return {
        confirmed: false,
        error: status.value.err.toString()
      };
    }
    
    return {
      confirmed: status.value?.confirmationStatus === 'confirmed',
      slot: status.value?.slot,
      blockTime: undefined // blockTime is not available in SignatureStatus
    };
  } catch (error) {
    console.error('Error getting transaction status:', error);
    return {
      confirmed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Get main pool SOL balance (like Tron)
export const getMainPoolSolBalance = async (): Promise<number> => {
  try {
    const connection = getSolanaConnection();
    const mainPool = getMainPoolKeypair();
    
    const balance = await connection.getBalance(mainPool.publicKey);
    const solBalance = new BigNumber(balance).dividedBy(LAMPORTS_PER_SOL);
    
    console.log(`🏦 Main pool SOL balance: ${solBalance.toString()} SOL`);
    return solBalance.toNumber();
  } catch (error) {
    console.error('Error getting main pool SOL balance:', error);
    throw new Error('Failed to get main pool SOL balance');
  }
};

// Get main pool USDC balance (like Tron)
export const getMainPoolUsdcBalance = async (): Promise<number> => {
  try {
    const mainPool = getMainPoolKeypair();
    return await getUsdcBalance(mainPool.publicKey.toString());
  } catch (error) {
    console.error('Error getting main pool USDC balance:', error);
    throw new Error('Failed to get main pool USDC balance');
  }
};

// Check if withdrawal is possible (like Tron)
export const canWithdrawSol = async (amount: number): Promise<{ canWithdraw: boolean; reason?: string }> => {
  try {
    const mainPoolBalance = await getMainPoolSolBalance();
    const totalRequired = new BigNumber(amount).plus(SOL_WITHDRAWAL_FEE);
    const remainingBalance = new BigNumber(mainPoolBalance).minus(totalRequired);
    
    if (remainingBalance.isLessThan(MIN_SOL_BALANCE)) {
      return {
        canWithdraw: false,
        reason: `Insufficient balance. Required: ${totalRequired.toString()} SOL, Available: ${mainPoolBalance} SOL, Must maintain: ${MIN_SOL_BALANCE} SOL`
      };
    }
    
    return { canWithdraw: true };
  } catch (error) {
    return {
      canWithdraw: false,
      reason: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Check if USDC withdrawal is possible (like Tron)
export const canWithdrawUsdc = async (amount: number): Promise<{ canWithdraw: boolean; reason?: string }> => {
  try {
    const mainPoolBalance = await getMainPoolUsdcBalance();
    const totalRequired = new BigNumber(amount).plus(USDC_WITHDRAWAL_FEE);
    const remainingBalance = new BigNumber(mainPoolBalance).minus(totalRequired);
    
    if (remainingBalance.isLessThan(MIN_USDC_BALANCE)) {
      return {
        canWithdraw: false,
        reason: `Insufficient balance. Required: ${totalRequired.toString()} USDC, Available: ${mainPoolBalance} USDC, Must maintain: ${MIN_USDC_BALANCE} USDC`
      };
    }
    
    return { canWithdraw: true };
  } catch (error) {
    return {
      canWithdraw: false,
      reason: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Get withdrawal fees (like Tron)
export const getWithdrawalFees = () => {
  return {
    SOL: SOL_WITHDRAWAL_FEE,
    USDC: USDC_WITHDRAWAL_FEE
  };
};

// Get minimum balances (like Tron)
export const getMinimumBalances = () => {
  return {
    SOL: MIN_SOL_BALANCE,
    USDC: MIN_USDC_BALANCE
  };
};

// Initialize Solana on module load
initializeSolana();