# Referral System Implementation

## Overview
This document describes the comprehensive referral system implementation for the casino project. The system allows users to invite others and earn bonuses when their referrals engage with the platform.

## Features Implemented

### 1. Database Schema Enhancements

#### New Models Added:
- **ReferralConfig**: Configuration table for referral bonus settings
- **Enhanced ReferralBonus**: Added trigger types and expiration dates

#### Key Fields:
- `triggerType`: Type of action that triggered the bonus (deposit, bet, first_deposit, first_bet)
- `expiresAt`: Optional expiration date for bonuses
- `depositBonusPercent`: Percentage bonus for deposits (default: 5%)
- `betBonusPercent`: Percentage bonus for bets (default: 2%)
- `firstDepositBonus`: Fixed bonus for first deposit (default: $10)
- `firstBetBonus`: Fixed bonus for first bet (default: $5)
- `maxBonusPerUser`: Maximum total bonus per user (default: $1000)
- `bonusExpiryDays`: Days until bonus expires (default: 30)

### 2. Referral Bonus Triggers

#### Signup Triggers:
- **Signup Bonus**: $5 fixed bonus when someone signs up with referral code (configurable)

#### Deposit Triggers:
- **Regular Deposit Bonus**: 5% of deposit amount (configurable)
- **First Deposit Bonus**: $10 fixed bonus for first deposit (configurable)

#### Bet Triggers:
- **Regular Bet Bonus**: 2% of bet amount (configurable)
- **First Bet Bonus**: $5 fixed bonus for first bet (configurable)

#### Implementation Locations:
- `src/db/users.ts` - `register()` function (signup bonus)
- `src/db/wallets.ts` - `topBalance()` function (deposit bonuses)
- `src/games/bigSmall.ts` - `BetBigSmall()` function (bet bonuses)
- `src/games/lucky.ts` - `BetLucky()` function (bet bonuses)

### 3. Configuration System

#### Functions in `src/db/bonus.ts`:
- `getReferralConfig()`: Get current configuration
- `updateReferralConfig()`: Update configuration settings
- `checkMaxBonusLimit()`: Verify user hasn't exceeded bonus limits

#### Default Configuration:
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

### 4. Admin Management Endpoints

#### Configuration Management:
- `GET /admin/referral-config` - Get current configuration
- `POST /admin/referral-config` - Update configuration

#### Bonus Management:
- `GET /admin/referral-bonuses` - List all bonuses with pagination
- `GET /admin/users/:id/referral-bonuses` - Get user's bonuses
- `POST /admin/referral-bonuses/expire` - Manually expire old bonuses

#### Analytics:
- `GET /admin/referral-stats` - Get comprehensive statistics
  - Total bonuses and amounts
  - Status breakdown (pending, paid, expired)
  - Top referrers leaderboard

### 5. User Endpoints

#### Enhanced User API:
- `GET /users/referral-bonuses` - Get user's own referral bonuses
- `GET /users/referal-info` - Get team information (existing)

### 6. Automatic Bonus Expiration

#### Scheduler Implementation:
- **File**: `src/utils/referralScheduler.ts`
- **Frequency**: Runs every hour
- **Function**: Automatically expires bonuses past their expiration date
- **Manual Trigger**: Available for testing via `triggerBonusExpiration()`

#### Integration:
- Started automatically in `src/app.ts`
- Runs in background without affecting main application

### 7. Enhanced Bonus Logic

#### Smart Bonus Calculation:
- Checks if referral system is enabled
- Validates user hasn't exceeded maximum bonus limits
- Prevents duplicate bonuses for same trigger type
- Handles bonus expiration automatically

#### Bonus Status Management:
- `pending`: Newly created bonus
- `paid`: Bonus converted to payout
- `expired`: Bonus past expiration date

## API Usage Examples

### User Registration with Referral Code
```javascript
POST /users/signup
{
  "email": "user@example.com",
  "password": "password123",
  "referralCode": "ABC123"
}
```

### Get User's Referral Bonuses
```javascript
GET /users/referral-bonuses
Authorization: Bearer <token>
```

### Admin: Update Referral Configuration
```javascript
POST /admin/referral-config
Authorization: Bearer <admin_token>
{
  "depositBonusPercent": 10,
  "betBonusPercent": 3,
  "firstDepositBonus": 20,
  "enabled": true
}
```

### Admin: Get Referral Statistics
```javascript
GET /admin/referral-stats
Authorization: Bearer <admin_token>
```

## Database Migration

### Prisma Schema Changes:
1. Added `triggerType` and `expiresAt` fields to `ReferralBonus` model
2. Created new `ReferralConfig` model
3. Updated SQL schema in `prisma/supabase_schema.sql`

### Migration Steps:
1. Run `npx prisma db push` to apply schema changes
2. Default configuration will be created automatically on first access

## Security Features

### Bonus Limit Protection:
- Maximum bonus per user prevents abuse
- Configurable limits via admin panel
- Automatic validation on each bonus creation

### Expiration System:
- Bonuses automatically expire after configured days
- Prevents indefinite accumulation
- Manual expiration available for admins

### Admin Controls:
- All admin endpoints require admin authentication
- Configuration changes are logged
- Manual bonus management available

## Monitoring and Analytics

### Key Metrics Available:
- Total referral bonuses created
- Total bonus amounts distributed
- Status breakdown (pending/paid/expired)
- Top referrers by bonus amount
- User-specific bonus history

### Admin Dashboard Data:
- Real-time bonus statistics
- User bonus breakdowns
- Configuration management
- Manual bonus operations

## Performance Considerations

### Optimizations:
- Efficient database queries with proper indexing
- Background job for bonus expiration
- Non-blocking bonus triggers (errors don't break main flow)
- Pagination for large bonus lists

### Scalability:
- Configurable bonus limits prevent runaway costs
- Automatic expiration prevents database bloat
- Efficient aggregation queries for statistics

## Testing

### Manual Testing:
- Use admin endpoints to test configuration changes
- Trigger manual bonus expiration for testing
- Test referral flow with different user scenarios

### Integration Points:
- Deposit flow triggers referral bonuses
- Betting flow triggers referral bonuses
- User registration links referral relationships
- Admin panel provides full management capabilities

## Future Enhancements

### Potential Improvements:
1. **Multi-level Referrals**: Support for deeper referral chains
2. **Bonus Tiers**: Different bonus rates based on user level
3. **Time-based Bonuses**: Special bonuses during promotions
4. **Referral Analytics**: More detailed reporting and insights
5. **Bonus Notifications**: Real-time notifications for new bonuses

### Configuration Extensions:
- Per-currency bonus rates
- Time-based bonus multipliers
- User tier-based bonus rates
- Promotional bonus campaigns

## Recent Fix: Signup Referral Bonus

### Issue Identified:
Users were not receiving referral bonuses when someone signed up with their referral code. The system was only awarding bonuses for deposits and bets, but not for the initial signup.

### Solution Implemented:
1. **Added Signup Bonus Trigger**: Created `triggerSignupReferralBonus()` function
2. **Updated Configuration**: Added `signupBonus` field to ReferralConfig (default: $5)
3. **Modified Registration Process**: Added bonus trigger to `register()` function in `src/db/users.ts`
4. **Updated Admin Interface**: Added signupBonus to configuration management

### How It Works Now:
1. User A has referral code "ABC123"
2. User B signs up with referral code "ABC123"
3. System automatically awards User A a $5 signup bonus
4. Bonus appears in User A's referral bonuses with triggerType: "signup"

### Testing:
Use the provided test script `test-signup-bonus.js` or follow the manual testing instructions to verify the fix.

## Conclusion

The referral system is now fully implemented with:
- ✅ Automatic bonus triggers for signups, deposits and bets
- ✅ Configurable bonus rates and limits
- ✅ Admin management interface
- ✅ User bonus tracking
- ✅ Automatic expiration system
- ✅ Comprehensive analytics
- ✅ Security and performance optimizations

The system is production-ready and provides a solid foundation for user acquisition and retention through referral incentives.
