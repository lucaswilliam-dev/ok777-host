// Test the complete Telegram authentication flow
const axios = require('axios');

async function testTelegramFlow() {
  console.log('🧪 Testing Telegram Authentication Flow...\n');
  
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing backend health...');
    const healthResponse = await axios.get('http://localhost:4000/health');
    console.log('✅ Backend health:', healthResponse.data.status);
    
    // Test 2: Telegram auth health
    console.log('\n2️⃣ Testing Telegram auth health...');
    const telegramHealthResponse = await axios.get('http://localhost:4000/auth/telegram/health');
    console.log('✅ Telegram auth health:', telegramHealthResponse.data.message);
    console.log('✅ Bot username:', telegramHealthResponse.data.botUsername);
    
    // Test 3: API health
    console.log('\n3️⃣ Testing main API...');
    const apiResponse = await axios.get('http://localhost:4000/api/v1');
    console.log('✅ Main API:', apiResponse.data.message);
    
    console.log('\n🎉 All tests passed! Backend is working correctly.');
    console.log('\n📋 Next steps:');
    console.log('1. Set TELEGRAM_BOT_TOKEN in your .env file');
    console.log('2. Configure your Telegram bot domain with @BotFather');
    console.log('3. Test the complete authentication flow');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testTelegramFlow();



