import express from 'express';
import { 
  verifyTelegramData, 
  createOrGetTelegramUser, 
  generateTelegramJWT,
  parseTelegramCallbackData 
} from '../auth/telegram';

const router = express.Router();

// Telegram authentication callback endpoint
router.get('/callback', async (req, res) => {
  try {
    console.log('Telegram callback received:', req.query);
    
    // Parse Telegram data from query parameters
    const telegramData = parseTelegramCallbackData(req.query);
    
    if (!telegramData) {
      console.error('Invalid Telegram callback data');
      return res.status(400).json({
        code: 400,
        message: 'Invalid Telegram authentication data'
      });
    }

    // Verify Telegram signature
    const isValid = verifyTelegramData(telegramData);
    
    if (!isValid) {
      console.error('Invalid Telegram signature');
      return res.status(401).json({
        code: 401,
        message: 'Invalid Telegram signature'
      });
    }

    // Check if auth_date is not too old (within 24 hours)
    const currentTime = Math.floor(Date.now() / 1000);
    const authDate = telegramData.auth_date;
    const maxAge = 24 * 60 * 60; // 24 hours in seconds
    
    if (currentTime - authDate > maxAge) {
      console.error('Telegram auth data is too old');
      return res.status(401).json({
        code: 401,
        message: 'Authentication data is too old'
      });
    }

    // Create or get user
    const user = await createOrGetTelegramUser(telegramData);
    
    // Generate JWT token
    const token = generateTelegramJWT(user);
    
    console.log(`Telegram authentication successful for user ${user.id}`);
    
    // Redirect to frontend success page with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/success?token=${encodeURIComponent(token)}`;
    
    console.log(`Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Telegram authentication error:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error during Telegram authentication'
    });
  }
});

// Health check endpoint for Telegram auth
router.get('/health', (req, res) => {
  res.json({
    code: 200,
    message: 'Telegram authentication service is running',
    botUsername: 'ok777_casino_bot'
  });
});

export default router;

