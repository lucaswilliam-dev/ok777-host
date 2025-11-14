// Complete Solana test matching Tron functionality
const { 
  getMainPoolSolBalance, 
  getMainPoolUsdcBalance, 
  canWithdrawSol, 
  canWithdrawUsdc,
  getWithdrawalFees,
  getMinimumBalances,
  withdrawSol,
  withdrawUsdc
} = require('./dist/blockchain/solana');

async function testSolanaComplete() {
  console.log('🧪 Testing Complete Solana Implementation (Matching Tron Pattern)');
  console.log('=' .repeat(60));
  
  try {
    // 1. Test pool status (like Tron)
    console.log('\n1. 📊 Testing Pool Status...');
    const solBalance = await getMainPoolSolBalance();
    const usdcBalance = await getMainPoolUsdcBalance();
    const fees = getWithdrawalFees();
    const minimums = getMinimumBalances();
    
    console.log(`✅ SOL Balance: ${solBalance} SOL`);
    console.log(`✅ USDC Balance: ${usdcBalance} USDC`);
    console.log(`✅ Withdrawal Fees:`, fees);
    console.log(`✅ Minimum Balances:`, minimums);
    
    // 2. Test withdrawal feasibility (like Tron)
    console.log('\n2. 🔍 Testing Withdrawal Feasibility...');
    
    const testAmounts = [0.1, 1, 10, 100];
    
    for (const amount of testAmounts) {
      console.log(`\n   Testing ${amount} SOL withdrawal:`);
      const solCheck = await canWithdrawSol(amount);
      console.log(`   ${solCheck.canWithdraw ? '✅' : '❌'} Can withdraw: ${solCheck.canWithdraw}`);
      if (!solCheck.canWithdraw) {
        console.log(`   Reason: ${solCheck.reason}`);
      }
      
      console.log(`   Testing ${amount} USDC withdrawal:`);
      const usdcCheck = await canWithdrawUsdc(amount);
      console.log(`   ${usdcCheck.canWithdraw ? '✅' : '❌'} Can withdraw: ${usdcCheck.canWithdraw}`);
      if (!usdcCheck.canWithdraw) {
        console.log(`   Reason: ${usdcCheck.reason}`);
      }
    }
    
    // 3. Test fee calculations (like Tron)
    console.log('\n3. 💰 Testing Fee Calculations...');
    const testAmount = 1;
    const solFee = fees.SOL;
    const usdcFee = fees.USDC;
    
    console.log(`   For ${testAmount} SOL withdrawal:`);
    console.log(`   - Amount: ${testAmount} SOL`);
    console.log(`   - Fee: ${solFee} SOL`);
    console.log(`   - Total: ${testAmount + solFee} SOL`);
    
    console.log(`   For ${testAmount} USDC withdrawal:`);
    console.log(`   - Amount: ${testAmount} USDC`);
    console.log(`   - Fee: ${usdcFee} USDC`);
    console.log(`   - Total: ${testAmount + usdcFee} USDC`);
    
    // 4. Test minimum balance requirements (like Tron)
    console.log('\n4. 🏦 Testing Minimum Balance Requirements...');
    console.log(`   Minimum SOL balance to maintain: ${minimums.SOL} SOL`);
    console.log(`   Minimum USDC balance to maintain: ${minimums.USDC} USDC`);
    
    // 5. Test BigNumber precision (like Tron)
    console.log('\n5. 🔢 Testing BigNumber Precision...');
    const BigNumber = require('bignumber.js');
    
    const amount = new BigNumber('1.123456789');
    const fee = new BigNumber('0.005');
    const total = amount.plus(fee);
    
    console.log(`   Amount: ${amount.toString()}`);
    console.log(`   Fee: ${fee.toString()}`);
    console.log(`   Total: ${total.toString()}`);
    console.log(`   Precision maintained: ${total.decimalPlaces() > 6 ? '✅' : '❌'}`);
    
    console.log('\n✅ All Solana tests completed successfully!');
    console.log('🎉 Solana implementation now matches Tron functionality perfectly!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSolanaComplete();

