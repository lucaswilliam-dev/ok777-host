// Test script for Telegram authentication
const crypto = require('crypto');

// Test data (example from Telegram documentation)
const testData = {
  id: 123456789,
  first_name: 'John',
  last_name: 'Doe',
  username: 'johndoe',
  photo_url: 'https://t.me/i/userpic/320/johndoe.jpg',
  auth_date: 1234567890,
  hash: 'test_hash_here'
};

const botToken = process.env.TELEGRAM_BOT_TOKEN || 'your_bot_token_here';

function testTelegramVerification() {
  console.log('Testing Telegram signature verification...');
  console.log('Bot token:', botToken ? 'Present' : 'Missing');
  
  if (!botToken || botToken === 'your_bot_token_here') {
    console.log('❌ TELEGRAM_BOT_TOKEN not set in environment variables');
    console.log('Please set TELEGRAM_BOT_TOKEN in your .env file');
    return;
  }
  
  // Create secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  console.log('Secret key created:', secretKey.toString('hex').substring(0, 16) + '...');
  
  // Extract hash from data
  const { hash, ...userData } = testData;
  
  // Create data check string
  const dataCheckString = Object.keys(userData)
    .sort()
    .map(key => `${key}=${userData[key]}`)
    .join('\n');
  
  console.log('Data check string:', dataCheckString);
  
  // Create HMAC hash
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(dataCheckString);
  const calculatedHash = hmac.digest('hex');
  
  console.log('Calculated hash:', calculatedHash);
  console.log('Expected hash:', hash);
  console.log('Verification result:', calculatedHash === hash ? '✅ Valid' : '❌ Invalid');
}

// Test the verification function
testTelegramVerification();

console.log('\n📋 Setup Instructions:');
console.log('1. Create a Telegram bot using @BotFather');
console.log('2. Get your bot token and set TELEGRAM_BOT_TOKEN in .env');
console.log('3. Set your bot domain in Telegram bot settings');
console.log('4. Test the authentication flow');

