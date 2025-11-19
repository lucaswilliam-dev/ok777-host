# OK777 Backend API Endpoints Documentation

## Base URL
All API endpoints are prefixed with `/api/v1` unless otherwise specified.

Example: `http://localhost:4000/api/v1/users/signup`

---

## 📋 Table of Contents

1. [User Management APIs](#user-management-apis)
2. [Wallet APIs](#wallet-apis)
3. [Game APIs](#game-apis)
4. [Admin APIs](#admin-apis)
5. [Deposit APIs](#deposit-apis)
6. [Operator/Seamless APIs](#operatorseamless-apis)
7. [Telegram Authentication](#telegram-authentication)
8. [Authentication Methods](#authentication-methods)

---

## 🔐 Authentication Methods

### JWT Token Authentication
Most endpoints require JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### Admin Authentication
Admin endpoints require admin JWT token with `role: "admin"`.

---

## 👤 User Management APIs

**Base Path:** `/api/v1/users`

### Authentication Endpoints

#### `POST /signup`
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "referralCode": "REF123" // optional
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Ok"
}
```

---

#### `POST /signin`
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### `GET /profile`
Get user profile (Protected - requires JWT).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "telegram": "@username",
    "avatar": "/uploads/img_123.jpg",
    "hasPassword": true,
    "email_verified": true
  }
}
```

---

#### `GET /referal-info`
Get referral information (Protected).

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": {
    "referralCode": "ABC123",
    "totalReferrals": 5,
    "totalBonusEarned": 100
  }
}
```

---

#### `GET /referral-bonuses`
Get user's referral bonuses (Protected).

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": [
    {
      "id": 1,
      "amount": 10,
      "currency": "USD",
      "status": "pending",
      "triggerType": "deposit",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Profile Management

#### `POST /set-telegram`
Set Telegram username (Protected).

**Request Body:**
```json
{
  "telegram": "@username"
}
```

---

#### `POST /set-withdrawal-password`
Set withdrawal password (Protected).

**Request Body:**
```json
{
  "password": "withdrawal123",
  "loginPassword": "current_login_password"
}
```

**Security:** Requires login password for verification.

---

#### `POST /set-avatar`
Upload user avatar (Protected).

**Request Body:**
```json
{
  "imageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": {
    "path": "/uploads/img_1234567890.png",
    "url": "http://localhost:4000/uploads/img_1234567890.png"
  }
}
```

---

#### `POST /set-name`
Set user name (Protected).

**Request Body:**
```json
{
  "username": "John Doe"
}
```

---

#### `POST /set-phone`
Set phone number (Protected).

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

---

### Email Verification

#### `POST /verify-email`
Send email verification code (Protected).

**Response:**
```json
{
  "success": true,
  "message": "Verification code sent"
}
```

---

#### `POST /confirm-email-code`
Verify email with code (Protected).

**Request Body:**
```json
{
  "code": "123456"
}
```

---

### Password Management

#### `POST /change-password`
Change password (Protected).

**Request Body:**
```json
{
  "password": "old_password",
  "newPassword": "new_password"
}
```

---

#### `POST /set-password`
Set password (for OAuth users without password) (Protected).

**Request Body:**
```json
{
  "newPassword": "new_password"
}
```

---

### OAuth Authentication

#### `GET /auth/google`
Initiate Google OAuth login.

**Query Parameters:**
- `referralCode` (optional): Referral code

**Response:** Redirects to Google OAuth.

---

#### `GET /auth/google/callback`
Google OAuth callback.

**Response:** 
- Redirects to frontend with token: `/auth/google/callback?token=<jwt_token>`
- Or returns JSON with token

---

### Wallet Authentication

#### `POST /auth/challenge`
Generate authentication challenge for MetaMask/TON (Public).

**Response:**
```json
{
  "code": 200,
  "message": "Challenge generated successfully",
  "data": {
    "challenge": "abc123-1640995200000-localhost",
    "expiresIn": 120
  }
}
```

---

#### `POST /auth/verify`
Verify wallet signature and authenticate (Public).

**Request Body (MetaMask):**
```json
{
  "address": "0x...",
  "signature": "0x...",
  "message": "challenge_string"
}
```

**Request Body (TON):**
```json
{
  "address": "UQAbc123...",
  "signature": "abc123...",
  "message": "challenge_string",
  "walletStateInit": "optional"
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Authentication successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "address": "0x...",
      "type": "metamask" // or "ton"
    }
  }
}
```

---

#### `GET /profile-metamask`
Get MetaMask user profile (Protected - MetaMask JWT).

---

#### `GET /profile-ton`
Get TON user profile (Protected - TON JWT).

---

## 💰 Wallet APIs

**Base Path:** `/api/v1/wallets`

### Wallet Information

#### `GET /info`
Get wallet information including balances and addresses (Protected).

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": {
    "balances": [
      {
        "currency": "USD",
        "amount": 1000.50,
        "lock": 0
      }
    ],
    "addresses": [
      {
        "blockchain": "Tron",
        "network": "mainnet",
        "publicKey": "TXYZ...",
        "currency": "USDT"
      }
    ]
  }
}
```

---

#### `GET /transactions`
Get transaction history (Protected).

**Query Parameters:**
- `currency`: Currency filter (required)

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": [
    {
      "id": 1,
      "type": "deposit",
      "currency": "USDT",
      "amount": 100,
      "txId": "0x...",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### `GET /bets`
Get user betting history (Protected).

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": [
    {
      "id": 1,
      "game": "BigSmall",
      "amount": 10,
      "currency": "USD",
      "status": "win",
      "payout": 20,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Withdrawal

#### `POST /withdraw`
Create withdrawal request (Protected).

**Request Body:**
```json
{
  "blockchain": "Tron",
  "currency": "USDT",
  "to": "TXYZ...",
  "amount": 100, // or "amountUsd": 100
  "withdrawalPassword": "withdrawal_password"
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Ok"
}
```

**Security:** Requires withdrawal password.

---

#### `GET /withdraw-rates`
Get withdrawal exchange rates (Protected).

**Response:**
```json
{
  "code": 200,
  "message": "Ok",
  "data": {
    "USDT": {
      "rate": 1.0,
      "min": 10,
      "max": 10000
    }
  }
}
```

---

### Balance Exchange

#### `POST /exchange`
Exchange balance between currencies (Protected).

**Request Body:**
```json
{
  "fromCurrency": "USD",
  "toCurrency": "USDT",
  "amount": 100
}
```

---

### Betting (Wallet)

#### `POST /bet`
Place a bet using wallet balance (Protected).

**Request Body:**
```json
{
  "game": 1, // 1=BigSmall, 2=Lucky, 3=NiuNiu, 4=BankerPlayer, 5=OddEven
  "currency": "USD",
  "amount": 10
}
```

---

#### `POST /claim-reward`
Claim referral bonus reward (Public).

**Request Body:**
```json
{
  "userId": 1,
  "amount": 10,
  "currency": "USD"
}
```

---

### Blockchain Status

#### `GET /solana/status`
Get Solana pool status (Public).

**Response:**
```json
{
  "code": 200,
  "data": {
    "solBalance": 1000,
    "usdcBalance": 5000,
    "fees": {
      "sol": 0.001,
      "usdc": 1
    },
    "minimums": {
      "sol": 0.1,
      "usdc": 10
    }
  }
}
```

---

## 🎮 Game APIs

**Base Path:** `/api/v1/games`

### Game Listing

#### `GET /products`
Get all game products (Public).

**Response:**
```json
{
  "code": 200,
  "message": "All products fetched successfully",
  "data": [
    {
      "id": 1,
      "code": 1020,
      "name": "Provider Name",
      "provider": "Provider",
      "status": "active"
    }
  ]
}
```

---

#### `GET /list`
Get games by category with pagination (Public).

**Query Parameters:**
- `category`: Category ID (optional)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

#### `GET /games-categories`
Get all game categories (Public).

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Slots"
    }
  ]
}
```

---

### Betting

#### `POST /bet`
Place a bet on hash games (Protected).

**Request Body:**
```json
{
  "game": 1, // 1=BigSmall, 2=Lucky, 3=NiuNiu, 4=BankerPlayer, 5=OddEven
  "amount": 10
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Ok"
}
```

---

### Hash Games Configuration

#### `GET /hash-games-addresses`
Get hash game wallet addresses (Public).

**Response:**
```json
{
  "code": 200,
  "data": [
    {
      "type": "instant",
      "bigSmallHouseAddress": "TXYZ...",
      "luckyHouseAddress": "TXYZ...",
      "niuNiuHouseAddress": "TXYZ...",
      "bankerPlayerHouseAddress": "TXYZ...",
      "oddEvenHouseAddress": "TXYZ..."
    }
  ]
}
```

---

## 👨‍💼 Admin APIs

**Base Path:** `/api/v1/admin`

**All endpoints require Admin JWT authentication.**

### Admin Management

#### `POST /create`
Create new admin account (Admin only).

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "password123",
  "role": "admin",
  "status": "active"
}
```

---

#### `POST /signin`
Admin login.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

---

#### `POST /change-password`
Change admin password (Admin only).

---

### Statistics

#### `GET /stats`
Get platform statistics (Admin only).

**Response:**
```json
{
  "code": 200,
  "data": {
    "totalUsers": 1000,
    "totalDeposits": 50000,
    "totalWithdrawals": 30000,
    "activeUsers": 500
  }
}
```

---

#### `GET /transactions`
Get all transactions with filtering (Admin only).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `search`: Search term
- `type`: Transaction type
- `currency`: Currency filter

---

### User Management

#### `GET /users`
Get all users with pagination (Admin only).

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

---

#### `GET /users/:id`
Get user basic information (Admin only).

---

#### `GET /users/:id/addresses`
Get user wallet addresses (Admin only).

---

#### `GET /users/:id/games`
Get user game records (Admin only).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page

---

#### `GET /users/:id/transactions`
Get user transactions (Admin only).

---

#### `POST /users/:id/suspend`
Suspend user account (Admin only).

---

#### `PUT /users/:id`
Update user information (Admin only).

---

#### `POST /users/:id/topup`
Top up user balance (Admin only).

**Request Body:**
```json
{
  "currency": "USD",
  "amount": 100,
  "description": "Bonus"
}
```

---

### Logs

#### `GET /logs`
Get system logs (Admin only).

**Query Parameters:**
- `page`: Page number
- `pageSize`: Items per page
- `userId`: Filter by user ID
- `adminId`: Filter by admin ID

---

### Hash Games Configuration

#### `GET /hash-games-configs`
Get hash game configurations (Admin only).

---

#### `POST /hash-games-configs/update/:id`
Update hash game configuration (Admin only).

---

### Game Settings

#### `GET /game-settings`
Get game settings (odds, limits) (Admin only).

---

#### `POST /update-game-settings`
Update game settings (Admin only).

---

### Product Management

#### `GET /products`
Get all products with pagination (Admin only).

---

#### `POST /products`
Create new product (Admin only).

---

#### `PUT /products/:id`
Update product (Admin only).

---

#### `DELETE /products/:id`
Delete product (Admin only).

---

#### `POST /products/:code/toggle`
Toggle product status (Admin only).

---

### Game Management

#### `GET /provider-games`
Get provider games with filters (Public).

**Query Parameters:**
- `categoryId`: Category ID
- `providerId`: Provider ID
- `page`: Page number
- `limit`: Items per page
- `enabled`: Filter by enabled status
- `search`: Search term

---

#### `PUT /provider-games/:id/update`
Update game (Public).

---

#### `POST /provider-games/:id/toggle`
Toggle game enabled status (Public).

---

#### `POST /provider-games/:id/category`
Update game category (Public).

---

#### `GET /games-in-manager`
Get games in manager with filters (Admin only).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `search`: Search term
- `categoryId`: Category ID
- `providerId`: Provider ID
- `status`: Status filter
- `startDate`: Start date
- `endDate`: End date

---

#### `POST /games/add`
Add new game (Admin only).

---

#### `POST /provider-games/backfill-providers`
Backfill game providers (Admin only).

---

#### `POST /provider-games/:id/in-manager`
Update game inManager field (Admin only).

---

### Category Management

#### `GET /game-categories`
Get all game categories (Public).

---

#### `POST /game-categories/add`
Create new category (Admin only).

**Request Body:**
```json
{
  "name": "New Category"
}
```

---

#### `PUT /game-categories/:id/update`
Update category (Admin only).

---

#### `DELETE /game-categories/:id/delete`
Delete category (Admin only).

---

### Withdrawal Management

#### `GET /withdrawals`
Get withdrawal requests with filters (Public).

**Query Parameters:**
- `page`: Page number
- `pageSize`: Items per page
- `status`: Status filter
- `currency`: Currency filter
- `search`: Search term

---

#### `POST /withdrawals/:id/process`
Process withdrawal request (Admin only).

---

### Payout Management

#### `GET /payouts`
Get payouts with filters (Public).

---

#### `POST /payouts/:id/process`
Process payout (Admin only).

---

### Referral Management

#### `GET /referral-config`
Get referral configuration (Admin only).

---

#### `POST /referral-config`
Update referral configuration (Admin only).

**Request Body:**
```json
{
  "depositBonusPercent": 5,
  "betBonusPercent": 2,
  "firstDepositBonus": 10,
  "firstBetBonus": 5,
  "signupBonus": 5,
  "maxBonusPerUser": 1000,
  "bonusExpiryDays": 30,
  "enabled": true
}
```

---

#### `GET /users/:id/referral-bonuses`
Get user's referral bonuses (Admin only).

---

#### `GET /referral-bonuses`
Get all referral bonuses with pagination (Admin only).

---

#### `POST /referral-bonuses/expire`
Expire old referral bonuses (Admin only).

---

#### `GET /referral-stats`
Get referral statistics (Admin only).

---

## 💳 Deposit APIs

**Base Path:** `/api/v1/deposits`

### User Endpoints

#### `GET /history`
Get deposit history (Protected - Wallet JWT).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `currency`: Currency filter
- `network`: Network filter
- `status`: Status filter (pending, confirmed, failed)
- `type`: Type filter (crypto, fiat)
- `startDate`: Start date
- `endDate`: End date
- `orderId`: Order ID search
- `txHash`: Transaction hash search

---

#### `GET /stats`
Get deposit statistics (Protected - Wallet JWT).

---

#### `GET /:id`
Get single deposit details (Protected - Wallet JWT).

---

### Admin Endpoints

#### `GET /admin/history`
Get all deposits with filters (Public - no auth required for admin).

**Query Parameters:** Same as user history endpoint, plus:
- `userId`: Filter by user ID

---

#### `GET /admin/stats`
Get deposit monitoring statistics (Public).

---

#### `GET /admin/status`
Get monitoring service status (Public).

---

#### `POST /admin/monitoring/:action`
Control monitoring service (Public).

**Actions:** `start`, `stop`, `run-once`

---

#### `PATCH /admin/:id/status`
Update deposit status (Public).

**Request Body:**
```json
{
  "status": "confirmed" // pending, confirmed, failed
}
```

---

### Debug Endpoints

#### `GET /admin/debug/tron-addresses`
Get all Tron addresses in database (Public).

---

#### `POST /admin/debug/check-tron-deposits`
Manually check Tron deposits for address (Public).

**Request Body:**
```json
{
  "address": "TXYZ..."
}
```

---

## 🎰 Operator/Seamless APIs

**Base Path:** `/v1/api/seamless`

These endpoints are used for seamless game integration with third-party providers.

### Balance Management

#### `POST /balance`
Get user balances in batch (Public - signature required).

**Request Body:**
```json
{
  "operator_code": "OPERATOR_CODE",
  "sign": "signature",
  "request_time": 1640995200,
  "batch_requests": [
    {
      "member_account": "123",
      "product_code": 1020
    }
  ],
  "currency": "USD"
}
```

---

#### `POST /withdraw`
Process withdrawal for seamless games (Public - signature required).

**Request Body:**
```json
{
  "operator_code": "OPERATOR_CODE",
  "sign": "signature",
  "request_time": 1640995200,
  "batch_requests": [
    {
      "member_account": "123",
      "product_code": 1020,
      "transactions": [
        {
          "action": "WITHDRAW",
          "amount": 100
        }
      ]
    }
  ],
  "currency": "USD"
}
```

---

#### `POST /deposit`
Process deposit for seamless games (Public - signature required).

---

#### `POST /pushbetdata`
Push bet data from provider (Public - signature required).

---

#### `GET /get-games`
Get provider games (Public).

---

## 🔗 Operators APIs

**Base Path:** `/api/v1/operators`

### Game Management

#### `GET /available-products`
Fetch and save available products from provider (Public).

---

#### `GET /provided-games`
Get games from database with filters (Public).

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `code`: Product code
- `search`: Search term
- `category`: Category name
- `provider`: Provider name
- `status`: Status filter (Active, DeActive, All)

**Response includes ping status for each game.**

---

#### `GET /provider-games`
Fetch games from provider and save to database (Public).

**Query Parameters:**
- `code`: Product code (optional)

---

#### `POST /launch-game`
Launch a game for user (Protected).

**Request Body:**
```json
{
  "product_code": 1020,
  "game_type": "SLOT",
  "game_code": "game123",
  "currency": "IDR",
  "language_code": 0
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://game-provider.com/launch?token=...",
  "message": "Game launched successfully",
  "code": 200
}
```

---

#### `GET /wagers`
Get wagers list (Public - signature required).

**Query Parameters:**
- `operator_code`: Operator code
- `sign`: Signature
- `request_time`: Request timestamp
- `page`: Page number
- `size`: Page size
- `start`: Start timestamp
- `end`: End timestamp

---

#### `GET /wagers/:key`
Get single wager details (Public - signature required).

---

#### `POST /check-games`
Check and save new games from provider (Admin only).

---

#### `GET /temp-games`
Get temporary games (Admin only).

---

## 📱 Telegram Authentication

**Base Path:** `/auth/telegram`

### `GET /callback`
Telegram authentication callback.

**Query Parameters:**
- Telegram authentication data (id, first_name, username, auth_date, hash)

**Response:** Redirects to frontend with JWT token.

---

### `GET /health`
Health check for Telegram auth service.

---

## 🔒 Authentication Middleware

### `isAuthenticated`
JWT middleware for user authentication.

### `isAdmin`
JWT middleware for admin authentication.

### `verifyToken`
Middleware for wallet authentication (MetaMask/TON).

---

## 📝 Response Format

### Success Response
```json
{
  "code": 200,
  "message": "Success message",
  "data": { ... }
}
```

### Error Response
```json
{
  "code": 400,
  "message": "Error message"
}
```

---

## 🔐 Security Notes

1. **JWT Tokens**: Most endpoints require JWT authentication
2. **Withdrawal Password**: Required for all withdrawals
3. **Signature Verification**: Seamless APIs require MD5 signature verification
4. **Admin Only**: Admin endpoints require admin role in JWT
5. **Rate Limiting**: Consider implementing rate limiting for production

---

## 🌐 Environment Variables

Required environment variables:
- `JWT_SECRET` or `JWTPRIVATEKEY`: JWT signing key
- `DATABASE_URL`: PostgreSQL connection string
- `OPERATOR_CODE`: Seamless operator code
- `SECRET_KEY`: Seamless API secret key
- `FRONTEND_URL`: Frontend URL for redirects
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- Blockchain RPC URLs and keys

---

## 📊 Status Codes

- `200`: Success
- `400`: Bad Request / Validation Error
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error
- `504`: Gateway Timeout

---

## 🚀 Rate Limits

Currently no rate limiting implemented. Consider adding:
- Per-IP rate limiting
- Per-user rate limiting
- Endpoint-specific limits

---

*Last Updated: 2024*
*API Version: v1*

