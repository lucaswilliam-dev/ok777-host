// Test script for withdrawal validation
const { convert } = require('./dist/utils/exchange');

async function testWithdrawalFlow() {
  try {
    console.log('🧪 Testing withdrawal flow...');
    
    // Simulate the exact API call parameters
    const amountUsd = 100;
    const currency = 'Sol'; // Note: this is 'Sol' not 'SOL'
    
    console.log(`1. Converting ${amountUsd} USD to ${currency}...`);
    
    // This is what the API does
    const amount = await convert(amountUsd, 'USD', currency);
    console.log(`Conversion result: ${amount} ${currency}`);
    console.log(`Type: ${typeof amount}`);
    console.log(`Is finite: ${isFinite(amount)}`);
    console.log(`> 0: ${amount > 0}`);
    
    // This is what withdrawRequest does
    const amountNum = Number(amount);
    console.log(`\n2. Amount validation:`);
    console.log(`amount: ${amount}`);
    console.log(`amountNum: ${amountNum}`);
    console.log(`isFinite(amountNum): ${isFinite(amountNum)}`);
    console.log(`amountNum > 0: ${amountNum > 0}`);
    
    if (!isFinite(amountNum) || amountNum <= 0) {
      console.error('❌ Amount validation would fail!');
    } else {
      console.log('✅ Amount validation would pass!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testWithdrawalFlow();
