# OK777 Casino Backend - Complete Project Study

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [API Structure](#api-structure)
6. [Authentication Systems](#authentication-systems)
7. [Blockchain Integrations](#blockchain-integrations)
8. [Game System](#game-system)
9. [Referral System](#referral-system)
10. [Seamless API Integration](#seamless-api-integration)
11. [Key Features](#key-features)
12. [Deployment](#deployment)

---

## 🎯 Project Overview

**OK777** is a comprehensive casino backend platform built with TypeScript/Express.js that supports:
- Multi-blockchain cryptocurrency deposits/withdrawals (Ethereum, Solana, Tron, TON)
- Multiple authentication methods (Email/Password, Telegram, MetaMask, TON Wallet, Google OAuth)
- Real-time blockchain transaction monitoring
- Casino game integration (Big Small, Lucky, Niu Niu, Banker Player, Odd Even)
- Referral bonus system
- Seamless game provider API integration
- Admin management system

**Project Type**: Casino/Gaming Platform Backend  
**Language**: TypeScript  
**Framework**: Express.js  
**Database**: PostgreSQL (via Prisma ORM)  
**Version**: 1.2.0

---

## 🛠️ Technology Stack

### Core Technologies
- **Runtime**: Node.js
- **Language**: TypeScript (compiled to ES2020)
- **Framework**: Express.js 4.21.2
- **Database**: PostgreSQL
- **ORM**: Prisma 6.17.1
- **Real-time**: Socket.IO 4.8.1

### Blockchain Libraries
- **Ethereum**: ethers.js 6.15.0
- **Solana**: @solana/web3.js 1.98.4, @solana/spl-token 0.4.14
- **Tron**: tronweb 6.0.4
- **TON**: @tonconnect/sdk 3.3.1
- **Crypto**: @noble/ed25519, tweetnacl, crypto-js, bs58

### Authentication & Security
- **JWT**: jsonwebtoken 9.0.2
- **Password Hashing**: bcrypt 5.1.1
- **OAuth**: passport, passport-google-oauth20, passport-github2, passport-discord
- **SIWE**: siwe 3.0.0 (Sign-In with Ethereum)

### Utilities
- **Email**: @sendgrid/mail, nodemailer, resend
- **HTTP Client**: axios 1.7.9
- **Validation**: Custom validation middleware
- **Logging**: morgan 1.10.0

### Development Tools
- **Build**: TypeScript 5.9.2
- **Dev Server**: nodemon 3.1.7
- **Testing**: Jest 29.7.0, supertest 7.0.0
- **Linting**: ESLint with TypeScript support

---

## 🏗️ Architecture

### Project Structure
```
ok777-backend/
├── src/                    # TypeScript source code
│   ├── api/               # API route handlers
│   │   ├── admin.ts      # Admin endpoints
│   │   ├── deposits.ts   # Deposit management
│   │   ├── games.ts      # Game endpoints
│   │   ├── operators.ts  # Operator management
│   │   ├── seamless.ts  # Seamless API integration
│   │   ├── telegram.ts   # Telegram auth
│   │   ├── users.ts      # User management
│   │   └── wallets.ts    # Wallet operations
│   ├── auth/             # Authentication modules
│   │   ├── metamask.ts   # MetaMask wallet auth
│   │   ├── passport.ts   # OAuth strategies
│   │   ├── telegram.ts   # Telegram auth logic
│   │   └── ton.ts        # TON wallet auth
│   ├── blockchain/       # Blockchain integrations
│   │   ├── depositListeners/  # Deposit monitoring
│   │   │   ├── ethereum.ts
│   │   │   ├── solana.ts
│   │   │   └── tron.ts
│   │   ├── ether.ts      # Ethereum utilities
│   │   ├── ethereum-deposits.ts
│   │   ├── solana.ts     # Solana utilities
│   │   ├── solana-deposits.ts
│   │   └── tron.ts       # Tron utilities
│   ├── db/               # Database operations
│   │   ├── admin.ts
│   │   ├── bonus.ts      # Referral bonuses
│   │   ├── deposits.ts
│   │   ├── games.ts
│   │   ├── operators.ts
│   │   ├── prisma.ts     # Prisma client
│   │   ├── users.ts
│   │   └── wallets.ts
│   ├── games/            # Game logic
│   │   ├── bankerPlayer.ts
│   │   ├── bigSmall.ts
│   │   ├── games.ts      # Game orchestrator
│   │   ├── lucky.ts
│   │   ├── niuniu.ts
│   │   └── oddEven.ts
│   ├── middleware/      # Express middleware
│   │   └── auth.ts       # JWT verification
│   ├── middlewares/     # Additional middleware
│   │   └── validation.ts
│   ├── services/        # Background services
│   │   └── deposit-monitor.ts
│   ├── utils/           # Utility functions
│   │   ├── bcrypt.ts
│   │   ├── constants.ts
│   │   ├── email.ts
│   │   ├── exchange.ts
│   │   ├── jwt.ts
│   │   ├── referralScheduler.ts
│   │   └── validation.ts
│   ├── app.ts           # Express app setup
│   └── index.ts         # Entry point
├── prisma/              # Database schema
│   ├── schema.prisma   # Prisma schema
│   └── supabase_schema.sql
├── dist/               # Compiled JavaScript
└── email-verification-service/  # Separate email service
```

### Application Flow

1. **Entry Point** (`src/index.ts`)
   - Starts Express server
   - Attaches Socket.IO
   - Initializes on port 4000 (configurable)

2. **App Setup** (`src/app.ts`)
   - Configures Express middleware (CORS, JSON parsing, static files)
   - Sets up API routes
   - Conditionally starts blockchain watchers (based on env flags)
   - Starts deposit monitoring service
   - Initializes game system
   - Starts referral bonus scheduler

3. **API Routing** (`src/api/index.ts`)
   - Main API router at `/api/v1`
   - Routes to sub-modules: users, wallets, admin, operators, games, deposits

---

## 🗄️ Database Schema

### Core Models

#### **User Model**
```prisma
model User {
  id                    Int       @id @default(autoincrement())
  email                 String    @unique
  password              String
  role                  String
  status                String
  telegram              String?
  avatar                String?
  withdrawal_password  String?
  name                  String?
  phone                 String?
  email_verified        Boolean   @default(false)
  
  // Relations
  balances              Balance[]
  wallets               Wallet[]
  transactions          Transaction[]
  deposits              Deposit[]
  wagers                Wager[]
  
  // Referral System
  referralCode          String?   @unique
  referredById          Int?
  referredBy            User?     @relation("UserReferrals")
  referrals             User[]    @relation("UserReferrals")
  referralBonuses       ReferralBonus[] @relation("BonusToUser")
  bonusesGiven          ReferralBonus[] @relation("BonusFromUser")
}
```

#### **Wallet Model**
- Multi-blockchain wallet support
- Encrypted private key storage
- Unique constraint per user/blockchain/network

#### **Deposit Model**
- Tracks all cryptocurrency deposits
- Supports multiple blockchains (Ethereum, Solana, Tron)
- Tracks transaction hash, block number, confirmations
- Status: pending, confirmed, failed

#### **Balance Model**
- Multi-currency balances per user
- Lock mechanism for pending transactions
- Decimal precision (18,4)

#### **Wager Model**
- Records all game bets
- Tracks bet amounts, prizes, tips
- Links to games and users
- Supports JSON payload for flexible data

#### **Referral System Models**
- **ReferralBonus**: Tracks bonuses earned through referrals
- **ReferralConfig**: Configurable bonus rates and limits

#### **Game Models**
- **Game**: Provider games catalog
- **HashGameConfig**: Blockchain game configuration
- **GameSettings**: Odds and fee configuration

---

## 🔌 API Structure

### Main API Routes (`/api/v1`)

#### **Users** (`/api/v1/users`)
- `POST /signup` - User registration
- `POST /login` - Email/password login
- `GET /profile` - Get user profile
- `GET /referral-bonuses` - Get referral bonuses
- `GET /referal-info` - Referral team info
- OAuth routes: `/auth/google`, `/auth/github`, `/auth/discord`

#### **Wallets** (`/api/v1/wallets`)
- `POST /create` - Create blockchain wallets
- `GET /list` - List user wallets
- `POST /top-balance` - Deposit funds
- `POST /withdraw` - Withdraw funds

#### **Deposits** (`/api/v1/deposits`)
- `GET /list` - List user deposits
- `GET /:id` - Get deposit details

#### **Games** (`/api/v1/games`)
- `GET /list` - List available games
- `POST /launch-game` - Launch game session
- Game-specific endpoints

#### **Admin** (`/api/v1/admin`)
- User management
- Game management
- Referral configuration
- Bonus management
- Analytics and statistics

#### **Operators** (`/api/v1/operators`)
- Provider game management
- Game synchronization
- Launch game endpoints

### Authentication Routes

#### **Telegram Auth** (`/auth/telegram`)
- `GET /` - Telegram authentication callback

#### **MetaMask Auth** (`/api/v1/users/auth/metamask`)
- `GET /nonce` - Get authentication nonce
- `POST /verify` - Verify signature and get JWT

#### **TON Auth** (`/api/v1/users/auth/ton`)
- `GET /challenge` - Get authentication challenge
- `POST /verify` - Verify signature and get JWT
- `GET /profile-ton` - Get TON user profile

### Seamless API (`/v1/api/seamless`)
- `POST /balance` - Get user balances (bulk)
- `POST /deposit` - Process deposits
- `POST /withdraw` - Process withdrawals
- `POST /pushbetdata` - Push bet data
- `GET /get-games` - Get provider games

---

## 🔐 Authentication Systems

### 1. **Email/Password Authentication**
- Standard JWT-based authentication
- Password hashing with bcrypt
- Email verification support

### 2. **Telegram Authentication**
- Uses Telegram Web App authentication
- Verifies Telegram data signature
- Creates or retrieves user account
- JWT token generation

**Flow:**
1. User clicks "Login with Telegram" in Telegram Web App
2. Telegram sends user data with hash
3. Backend verifies hash using bot token
4. Creates/updates user account
5. Returns JWT token

### 3. **MetaMask Authentication (SIWE)**
- Sign-In with Ethereum (SIWE) standard
- Nonce-based challenge system
- Signature verification using ethers.js

**Flow:**
1. Client requests nonce from `/api/v1/users/auth/metamask/nonce`
2. User signs message with MetaMask
3. Client sends signature to `/api/v1/users/auth/metamask/verify`
4. Backend verifies signature
5. Returns JWT token

### 4. **TON Wallet Authentication**
- TON Connect v2 integration
- Challenge-response authentication
- Ed25519 signature verification
- Public key extraction from wallet state

**Flow:**
1. Client requests challenge from `/api/v1/users/auth/ton/challenge`
2. User signs challenge with TON wallet
3. Client sends signature to `/api/v1/users/auth/ton/verify`
4. Backend verifies Ed25519 signature
5. Returns JWT token

### 5. **OAuth Providers**
- Google OAuth 2.0
- GitHub OAuth
- Discord OAuth
- Passport.js strategies

### Authentication Middleware
- `verifyToken`: JWT verification middleware
- Supports multiple token types (metamask, ton, standard)
- Attaches user info to request object

---

## ⛓️ Blockchain Integrations

### Supported Blockchains

#### **1. Ethereum**
- **Library**: ethers.js
- **Supported Assets**: ETH, ERC20 tokens (USDT)
- **Features**:
  - Real-time transaction monitoring
  - Deposit detection
  - Balance checking
  - Gas fee management

**Configuration:**
```env
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
ENABLE_ETH_WATCHERS=true
```

#### **2. Solana**
- **Library**: @solana/web3.js
- **Supported Assets**: SOL, SPL tokens (USDC)
- **Features**:
  - Keypair generation
  - Transaction monitoring
  - Rent-exempt balance handling
  - Deposit confirmation

**Configuration:**
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_MAIN_POOL_PRIVATE_KEY=...
SOLANA_USDC_MINT=...
ENABLE_SOL_WATCHERS=true
```

#### **3. Tron**
- **Library**: tronweb
- **Supported Assets**: TRX, TRC20 tokens (USDT)
- **Features**:
  - Block monitoring
  - Smart contract interaction
  - Automatic balance sweeping
  - Main pool management

**Configuration:**
```env
TRON_RPC_URL=https://api.shasta.trongrid.io
TRON_MAIN_POOL_ADDRESS=...
TRON_MAIN_POOL_PK=...
TRON_USDT_CONTRACT=...
ENABLE_TRON_WATCHERS=true
```

#### **4. TON (The Open Network)**
- **Library**: @tonconnect/sdk
- **Features**:
  - Wallet authentication
  - Address validation
  - Signature verification

### Deposit Monitoring System

**Unified Deposit Monitoring Service** (`src/blockchain/depositListeners/index.ts`)
- Centralized service managing all blockchain monitors
- Individual monitors for each blockchain
- Automatic start/stop functionality
- Statistics tracking

**Features:**
- Real-time transaction detection
- Automatic deposit processing
- Balance updates
- Transaction confirmation tracking
- Duplicate detection

**Monitoring Flow:**
1. Service starts monitoring all enabled blockchains
2. Polls for new blocks/transactions
3. Detects deposits to user wallets
4. Creates deposit records in database
5. Updates user balances
6. Marks deposits as confirmed

---

## 🎮 Game System

### Game Types

#### **1. Big Small Game**
- Bet on number ranges (Big/Small)
- Multiple timing options (instant, 1min, 3min)

#### **2. Lucky Game**
- Number prediction game
- Multiple rounds

#### **3. Niu Niu Game**
- Card game variant
- Instant and timed modes

#### **4. Banker Player Game**
- Two-sided betting (Banker/Player)
- Multiple timing options

#### **5. Odd Even Game**
- Simple odd/even betting
- Multiple timing options

### Game Timing Modes
- **Instant**: Immediate results
- **1 Minute**: Time-based rounds (1 minute intervals)
- **3 Minutes**: Longer rounds (3 minute intervals)

### Game Integration with Blockchain

**Transaction Processing Flow:**
1. User sends TRX/USDT to game wallet address
2. Tron observer detects transaction
3. Game system processes bet
4. Game logic determines result
5. Payout processed (if win)
6. Socket.IO emits result to clients

**Game Configuration:**
- House addresses for each game type
- Min/max bet limits (TRX and USDT)
- Odds configuration
- Fee settings

**Game Settings Model:**
- `oddsNumerator` / `oddsDenominator`: Payout odds
- `feeNumerator` / `feeDenominator`: House fee
- `trxMin` / `trxMax`: TRX bet limits
- `usdtMin` / `usdtMax`: USDT bet limits

---

## 🎁 Referral System

### Overview
Comprehensive referral bonus system that rewards users for inviting others.

### Bonus Triggers

#### **1. Signup Bonus**
- Triggered when someone signs up with referral code
- Default: $5 fixed bonus
- Configurable via admin panel

#### **2. Deposit Bonuses**
- **Regular Deposit**: 5% of deposit amount (configurable)
- **First Deposit**: $10 fixed bonus (configurable)

#### **3. Bet Bonuses**
- **Regular Bet**: 2% of bet amount (configurable)
- **First Bet**: $5 fixed bonus (configurable)

### Configuration System
- **ReferralConfig Model**: Centralized configuration
- Admin can adjust all bonus rates
- Maximum bonus limits per user
- Bonus expiration settings

### Features
- Automatic bonus calculation
- Bonus expiration (default: 30 days)
- Maximum bonus limits (default: $1000 per user)
- Status tracking (pending, paid, expired)
- Comprehensive analytics

### Scheduler
- Background job runs every hour
- Automatically expires old bonuses
- Non-blocking operation

### Admin Endpoints
- Get/update referral configuration
- List all referral bonuses
- Get referral statistics
- Manual bonus expiration

---

## 🔗 Seamless API Integration

### Purpose
Integration with game provider APIs (GSC/Seamless) for third-party games.

### Endpoints

#### **Balance Check** (`POST /v1/api/seamless/balance`)
- Bulk balance retrieval
- Signature verification
- Returns balances for multiple users

#### **Deposit** (`POST /v1/api/seamless/deposit`)
- Process deposits from provider
- Batch processing support
- Balance updates

#### **Withdraw** (`POST /v1/api/seamless/withdraw`)
- Process withdrawals to provider
- Balance verification
- Transaction processing

#### **Push Bet Data** (`POST /v1/api/seamless/pushbetdata`)
- Receive bet data from provider
- Wager recording
- Balance updates

#### **Get Games** (`GET /v1/api/seamless/get-games`)
- Fetch game list from provider
- Game synchronization
- Database updates

### Security
- MD5 signature verification
- Request time validation
- Operator code verification

---

## ✨ Key Features

### 1. **Multi-Blockchain Support**
- Unified interface for different blockchains
- Automatic blockchain detection
- Cross-chain compatibility

### 2. **Real-Time Processing**
- Instant transaction detection
- Live game integration
- Real-time balance updates
- Socket.IO for live updates

### 3. **Security Features**
- Encrypted private key storage
- JWT authentication
- Signature verification
- Secure transaction processing
- Withdrawal password protection

### 4. **Scalable Architecture**
- Modular blockchain support
- Easy addition of new blockchains
- Configurable feature flags
- Background job processing

### 5. **Admin Management**
- User management
- Game configuration
- Referral system management
- Analytics and reporting
- Bonus management

### 6. **Email System**
- Email verification
- Transaction notifications
- Separate email verification service

### 7. **Wallet Management**
- Multi-blockchain wallet creation
- Encrypted key storage
- Automatic address generation
- Balance tracking

---

## 🚀 Deployment

### Environment Variables

**Required:**
```env
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=64_character_hex_string
JWT_SECRET=your_jwt_secret
PORT=4000
NODE_ENV=production
```

**Blockchain Configuration:**
```env
TRON_RPC_URL=...
TRON_MAIN_POOL_ADDRESS=...
TRON_MAIN_POOL_PK=...
TRON_USDT_CONTRACT=...

SOLANA_RPC_URL=...
SOLANA_MAIN_POOL_PRIVATE_KEY=...
SOLANA_USDC_MINT=...

ETHEREUM_RPC_URL=...
```

**Feature Flags:**
```env
ENABLE_TRON_WATCHERS=false
ENABLE_ETH_WATCHERS=false
ENABLE_SOL_WATCHERS=false
ENABLE_GAMES=false
ENABLE_DEPOSIT_MONITORING=true
```

**Email Configuration:**
```env
RESEND_API_KEY=...
RESEND_FROM=OK777 <no-reply@ok777.io>
```

**OAuth Configuration:**
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=...
FRONTEND_URL=...
```

**Seamless API:**
```env
OPERATOR_CODE=...
SECRET_KEY=...
```

**Telegram:**
```env
TELEGRAM_BOT_TOKEN=...
```

**TON:**
```env
TON_API_URL=https://tonapi.io/v2
TON_CHALLENGE_EXPIRY=120000
```

### Build Process
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npx prisma generate  # Generate Prisma client
npx prisma db push   # Apply database schema
npm start            # Start production server
```

### Development
```bash
npm run dev          # Start with nodemon
npm run lint         # Run ESLint
npm test             # Run tests
```

### Deployment Platforms
- **Render.com**: Configured with `render.yaml`
- **Health Check**: `/health` endpoint
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### Database Migration
1. Update Prisma schema
2. Run `npx prisma db push` or `npx prisma migrate deploy`
3. Verify schema changes

---

## 📊 Project Statistics

- **Total Models**: 20+ database models
- **API Endpoints**: 50+ endpoints
- **Blockchain Support**: 4 blockchains
- **Authentication Methods**: 5+ methods
- **Game Types**: 5 game types
- **Supported Currencies**: ETH, SOL, TRX, USDT, USDC

---

## 🔮 Future Enhancements

### Potential Improvements
1. **Additional Blockchains**: Polygon, Avalanche, BNB Chain full support
2. **Cross-Chain Swaps**: Direct blockchain transfers
3. **Advanced Security**: Hardware wallet integration, 2FA
4. **Analytics**: Enhanced transaction pattern analysis
5. **Mobile Support**: Enhanced mobile wallet integration
6. **Multi-level Referrals**: Deeper referral chains
7. **Bonus Tiers**: User level-based bonus rates
8. **Real-time Notifications**: WebSocket notifications for all events

---

## 📝 Documentation Files

The project includes comprehensive documentation:
- `README.md` - Basic setup instructions
- `DEPLOYMENT.md` - Deployment guide
- `BLOCKCHAIN_ANALYSIS.md` - Blockchain implementation details
- `REFERRAL_SYSTEM_IMPLEMENTATION.md` - Referral system documentation
- `METAMASK_AUTH_README.md` - MetaMask authentication guide
- `TON_AUTH_README.md` - TON authentication guide
- `TELEGRAM_AUTH_SETUP.md` - Telegram authentication setup
- `SOLANA_INTEGRATION.md` - Solana integration details
- `VALIDATION_IMPLEMENTATION.md` - Validation system docs

---

## ✅ Production Readiness  

### Current Status
- ✅ Multi-blockchain support implemented
- ✅ Real-time monitoring active
- ✅ Security measures in place
- ✅ Game integration working
- ✅ Referral system complete
- ✅ Admin management system
- ✅ Error handling comprehensive
- ✅ Documentation complete

### Production Checklist
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] RPC endpoints verified
- [ ] Main pool wallets funded
- [ ] SSL/TLS certificates configured
- [ ] Monitoring and logging setup
- [ ] Backup systems configured
- [ ] Security audit completed

---

## 🎯 Conclusion

The OK777 Casino Backend is a **production-ready**, comprehensive platform that provides:

1. **Multi-blockchain cryptocurrency support** with real-time monitoring
2. **Multiple authentication methods** for flexible user onboarding
3. **Complete game integration** with blockchain-based betting
4. **Comprehensive referral system** for user acquisition
5. **Admin management system** for platform control
6. **Seamless API integration** for third-party games
7. **Scalable architecture** for future growth

The codebase is well-structured, documented, and follows best practices for security, performance, and maintainability.

---

*Last Updated: Based on codebase analysis*  
*Version: 1.2.0*

