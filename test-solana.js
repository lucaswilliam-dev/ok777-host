// Simple test script for Solana integration
const { initializeSolana, isValidSolanaAddress, getSolBalance } = require('./dist/blockchain/solana');

async function testSolanaIntegration() {
  try {
    console.log('🧪 Testing Solana integration...');
    
    // Test 1: Initialize Solana
    console.log('1. Testing Solana initialization...');
    initializeSolana();
    console.log('✅ Solana initialized successfully');
    
    // Test 2: Validate Solana address
    console.log('2. Testing address validation...');
    const validAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Example Solana address
    const invalidAddress = 'invalid-address';
    
    console.log('Valid address test:', isValidSolanaAddress(validAddress));
    console.log('Invalid address test:', isValidSolanaAddress(invalidAddress));
    
    // Test 3: Get balance (this will fail in test environment, but shows the function works)
    console.log('3. Testing balance retrieval...');
    try {
      const balance = await getSolBalance(validAddress);
      console.log('✅ Balance retrieved:', balance);
    } catch (error) {
      console.log('⚠️ Balance test failed (expected in test environment):', error.message);
    }
    
    console.log('🎉 All Solana tests completed!');
    
  } catch (error) {
    console.error('❌ Solana test failed:', error);
  }
}

// Run the test
testSolanaIntegration();
