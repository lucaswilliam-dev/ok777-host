// Test script for withdrawal validation with mock conversion
function mockConvert(amount, fromSymbol, toSymbol) {
  // Mock conversion rates
  const rates = {
    TRX_USDT: 0.1,
    ETH_USDT: 2000,
    SOL_USDT: 200, // SOL at $200
    USDT_USDT: 1
  };

  const toUSDT = {
    TRX: rates.TRX_USDT,
    ETH: rates.ETH_USDT,
    SOL: rates.SOL_USDT,
    USD: 1,
    USDT: 1,
    USDC: 1,
  };

  // Normalize currency symbols to uppercase
  const normalizedFromSymbol = fromSymbol.toUpperCase();
  const normalizedToSymbol = toSymbol.toUpperCase();

  const amountInUSDT = amount * toUSDT[normalizedFromSymbol];
  const result = amountInUSDT / toUSDT[normalizedToSymbol];

  console.log("Mock conversion:", {
    amount,
    fromSymbol,
    toSymbol,
    normalizedFromSymbol,
    normalizedToSymbol,
    amountInUSDT,
    fromRate: toUSDT[normalizedFromSymbol],
    toRate: toUSDT[normalizedToSymbol],
    result
  });

  return result;
}

async function testWithdrawalFlow() {
  try {
    console.log('🧪 Testing withdrawal flow with mock conversion...');
    
    // Simulate the exact API call parameters
    const amountUsd = 100;
    const currency = 'Sol'; // This should be normalized to 'SOL'
    
    console.log(`1. Converting ${amountUsd} USD to ${currency}...`);
    
    // This is what the API does
    const amount = mockConvert(amountUsd, 'USD', currency);
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
    
    // Test the reverse conversion
    console.log(`\n3. Testing reverse conversion...`);
    const amountUsdBack = mockConvert(amount, currency, 'USD');
    console.log(`${amount} ${currency} = ${amountUsdBack} USD`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testWithdrawalFlow();
