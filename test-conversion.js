// Test script for currency conversion
const { convert } = require('./dist/utils/exchange');

async function testConversion() {
  try {
    console.log('🧪 Testing currency conversion...');
    
    // Test USD to SOL conversion
    console.log('1. Testing USD to SOL conversion...');
    const usdToSol = await convert(100, 'USD', 'SOL');
    console.log(`100 USD = ${usdToSol} SOL`);
    
    // Test SOL to USD conversion
    console.log('2. Testing SOL to USD conversion...');
    const solToUsd = await convert(usdToSol, 'SOL', 'USD');
    console.log(`${usdToSol} SOL = ${solToUsd} USD`);
    
    // Test USD to USDC conversion
    console.log('3. Testing USD to USDC conversion...');
    const usdToUsdc = await convert(100, 'USD', 'USDC');
    console.log(`100 USD = ${usdToUsdc} USDC`);
    
    // Test USD to USDT conversion (should be same as USDC)
    console.log('4. Testing USD to USDT conversion...');
    const usdToUsdt = await convert(100, 'USD', 'USDT');
    console.log(`100 USD = ${usdToUsdt} USDT`);
    
    console.log('✅ All conversion tests completed!');
    
  } catch (error) {
    console.error('❌ Conversion test failed:', error);
  }
}

// Run the test
testConversion();
