# Telegram Authentication Setup Guide

This guide explains how to set up Telegram Login authentication for the OK777 Casino platform.

## Prerequisites

1. **Telegram Bot**: You need a Telegram bot created via @BotFather
2. **Domain Configuration**: Your bot must be configured with the correct domain
3. **Environment Variables**: Bot token must be set in your environment

## Step 1: Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Choose a username: `ok777_casino_bot`
5. Save the bot token provided by BotFather

## Step 2: Configure Bot Domain

1. Send `/setdomain` to @BotFather
2. Select your bot (`ok777_casino_bot`)
3. Set the domain to your backend URL: `http://localhost:4000`

## Step 3: Environment Configuration

Add the following to your `.env` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
```

## Step 4: Backend Setup

The backend is already configured with:

- **Telegram Auth Route**: `/auth/telegram/callback`
- **Signature Verification**: HMAC SHA256 validation
- **User Creation**: Automatic user creation from Telegram data
- **JWT Generation**: Secure token creation for authenticated users

### Backend Files Created:

1. `src/auth/telegram.ts` - Telegram authentication utilities
2. `src/api/telegram.ts` - Telegram authentication routes
3. Updated `src/app.ts` - Added Telegram auth route

## Step 5: Frontend Setup

The frontend is configured with:

- **Auth Modal**: Telegram login button in authentication modal
- **Success Page**: `/auth/success` for handling authentication tokens
- **Token Management**: Automatic token storage and user state management

### Frontend Files Created:

1. `components/auth/TelegramLogin.tsx` - Telegram login component
2. `app/auth/success/page.tsx` - Authentication success page
3. Updated `components/modals/AuthModal.tsx` - Added Telegram login button

## Step 6: Testing

### Test the Backend

```bash
# Start the backend server
npm run dev

# Test the health endpoint
curl http://localhost:4000/auth/telegram/health
```

### Test the Frontend

1. Start the frontend: `npm run dev`
2. Open the authentication modal
3. Click the Telegram login button
4. Complete the Telegram authentication flow
5. Verify you're redirected to the success page

## Authentication Flow

1. **User clicks Telegram login** → Frontend redirects to Telegram OAuth
2. **User authenticates with Telegram** → Telegram redirects to backend callback
3. **Backend verifies signature** → Creates/updates user in database
4. **Backend generates JWT** → Redirects to frontend success page
5. **Frontend saves token** → User is authenticated

## Security Features

- **Signature Verification**: All Telegram data is cryptographically verified
- **Token Expiration**: JWT tokens expire after 24 hours
- **User Validation**: Telegram users are automatically verified
- **Secure Redirects**: All redirects use HTTPS in production

## Troubleshooting

### Common Issues

1. **"Invalid Telegram signature"**
   - Check that `TELEGRAM_BOT_TOKEN` is correctly set
   - Verify the bot domain is configured correctly

2. **"Authentication data is too old"**
   - Telegram auth data expires after 24 hours
   - User needs to re-authenticate

3. **"Bot domain not configured"**
   - Use `/setdomain` command with @BotFather
   - Set domain to your backend URL

### Debug Mode

Run the test script to verify your setup:

```bash
node test-telegram-auth.js
```

## Production Deployment

1. **Update Environment Variables**:
   ```env
   TELEGRAM_BOT_TOKEN=your_production_bot_token
   FRONTEND_URL=https://your-frontend-domain.com
   ```

2. **Update Bot Domain**:
   - Use `/setdomain` with @BotFather
   - Set domain to your production backend URL

3. **HTTPS Requirements**:
   - Telegram requires HTTPS for production
   - Ensure your backend has SSL certificates

## API Endpoints

- `GET /auth/telegram/callback` - Telegram authentication callback
- `GET /auth/telegram/health` - Health check endpoint

## Frontend Routes

- `/auth/success?token=<JWT>` - Authentication success page

## Support

For issues with Telegram authentication:

1. Check the browser console for errors
2. Verify environment variables are set
3. Test the backend health endpoint
4. Check Telegram bot configuration with @BotFather



