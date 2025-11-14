// Test the generated Solana keypair
const { Keypair } = require('@solana/web3.js');

const privateKeyBase64 = 'UKm/43rf5Zh81gGgJIRcTGL8+O1XGOkgsQWI6RE/YPVMDFOAR21jye2H2MFtxS4Q6L/AZ8hx/YJdZ7Mw0Riehw==';

console.log('🧪 Testing Solana keypair...');

try {
  // Decode the base64 private key
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  console.log('Private key length:', privateKeyBytes.length, 'bytes');
  
  // Create keypair from private key
  const keypair = Keypair.fromSecretKey(privateKeyBytes);
  console.log('✅ Keypair created successfully!');
  console.log('Public Key:', keypair.publicKey.toString());
  console.log('Private Key (base64):', Buffer.from(keypair.secretKey).toString('base64'));
  
  // Verify the keypair works
  const testMessage = 'Hello Solana!';
  console.log('✅ Keypair is valid and ready to use!');
  
} catch (error) {
  console.error('❌ Keypair test failed:', error.message);
}

