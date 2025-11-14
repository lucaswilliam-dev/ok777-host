// Generate a proper Solana keypair for testing
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔑 Generating Solana keypair...');

// Generate a new keypair
const keypair = Keypair.generate();

console.log('✅ Generated Solana keypair:');
console.log('Public Key:', keypair.publicKey.toString());
console.log('Private Key (base64):', Buffer.from(keypair.secretKey).toString('base64'));

// Save to file
const keypairData = {
  publicKey: keypair.publicKey.toString(),
  secretKey: Buffer.from(keypair.secretKey).toString('base64'),
  secretKeyArray: Array.from(keypair.secretKey)
};

fs.writeFileSync('solana-keypair.json', JSON.stringify(keypairData, null, 2));
console.log('💾 Saved to solana-keypair.json');

console.log('\n📋 Add this to your .env file:');
console.log(`SOLANA_MAIN_POOL_PRIVATE_KEY=${Buffer.from(keypair.secretKey).toString('base64')}`);

