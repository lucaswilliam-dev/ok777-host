# TON Wallet Authentication System

This document describes the complete TON Wallet Authentication System implemented for the OK777 Casino application using TonConnect v2.

## 🔧 Backend Implementation

### Dependencies Added
- `@noble/ed25519` - For Ed25519 signature verification
- `tweetnacl` - Alternative Ed25519 implementation
- `crypto-js` - For cryptographic operations

### Environment Variables
Add the following to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# TON Authentication Configuration
TON_API_URL=https://tonapi.io/v2
TON_CHALLENGE_EXPIRY=120000
```

### API Endpoints

#### GET `/api/v1/users/auth/challenge`
Generates a secure challenge for TON wallet authentication.

**Response:**
```json
{
  "code": 200,
  "message": "Challenge generated successfully",
  "data": {
    "challenge": "abc123def456-1640995200000-localhost",
    "expiresIn": 120
  }
}
```

#### POST `/api/v1/users/auth/verify`
Verifies TON signature and issues JWT token.

**Request:**
```json
{
  "address": "UQAbc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
  "signature": "abc123def456...",
  "message": "abc123def456-1640995200000-localhost",
  "walletStateInit": "optional_wallet_state_init"
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
      "address": "uqabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      "type": "ton",
      "publicKey": "abc123def456..."
    }
  }
}
```

#### GET `/api/v1/users/profile-ton`
Get user profile (protected route requiring JWT token).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "code": 200,
  "message": "Profile retrieved successfully",
  "data": {
    "user": {
      "address": "uqabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
      "type": "ton",
      "publicKey": "abc123def456...",
      "authenticatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### Security Features

1. **Challenge Expiration**: Challenges expire after 2 minutes to prevent replay attacks
2. **Ed25519 Verification**: Uses Ed25519 signature scheme for TON signature verification
3. **Public Key Validation**: Retrieves and validates public keys from TON API
4. **Secure Cookies**: JWT tokens are set as secure httpOnly cookies
5. **Nonce-based Challenges**: Each challenge includes nonce, timestamp, and domain

## 🎨 Frontend Implementation

### Dependencies Added
- `@tonconnect/sdk` - TonConnect SDK
- `@tonconnect/ui-react` - TonConnect UI components

### Components Created

#### `TonWalletButton`
A reusable component for TON wallet authentication.

**Props:**
- `onSuccess?: (user: any) => void` - Callback for successful authentication
- `onError?: (error: string) => void` - Callback for authentication errors
- `className?: string` - Additional CSS classes
- `children?: React.ReactNode` - Custom button content

**Usage:**
```tsx
<TonWalletButton
  onSuccess={(user) => console.log('Authenticated:', user)}
  onError={(error) => console.error('Auth error:', error)}
  className="custom-button-class"
>
  Connect TON Wallet
</TonWalletButton>
```

#### `useTonAuth` Hook
Custom hook for managing TON wallet connection state.

**Returns:**
- `isConnected: boolean` - Whether wallet is connected
- `address: string | null` - Connected wallet address
- `publicKey: string | null` - Wallet public key
- `isLoading: boolean` - Loading state
- `error: string | null` - Error message
- `connect: () => Promise<void>` - Connect to wallet
- `disconnect: () => Promise<void>` - Disconnect wallet
- `signMessage: (message: string) => Promise<SignResult | null>` - Sign message

#### `TonAuthService`
Service class for handling TON authentication API calls.

**Methods:**
- `getChallenge()` - Get authentication challenge
- `verifySignature(data)` - Verify signature and authenticate
- `getProfile(token)` - Get user profile
- `authenticateWithTon(address, signature, message, walletStateInit)` - Complete auth flow

### Integration

The TON wallet button has been integrated into the existing auth modal (`components/auth/Auth.tsx`) alongside other authentication methods.

### Manifest Configuration

A `manifest.json` file has been created in the `public` directory for TonConnect:

```json
{
  "url": "https://ok777.casino",
  "name": "OK777 Casino",
  "iconUrl": "https://ok777.casino/icons/icon-192x192.png",
  "termsOfUseUrl": "https://ok777.casino/terms",
  "privacyPolicyUrl": "https://ok777.casino/privacy"
}
```

## 🔐 Security Considerations

1. **HTTPS Required**: Always use HTTPS in production for secure cookie transmission
2. **JWT Secret**: Use a strong, unique JWT secret in production
3. **Challenge Expiry**: Challenges expire after 2 minutes to prevent replay attacks
4. **Public Key Validation**: Public keys are validated against TON API
5. **Signature Verification**: Ed25519 signatures are cryptographically verified
6. **Secure Cookies**: JWT tokens are stored in secure httpOnly cookies

## 🚀 Usage Flow

1. **User clicks "Connect TON Wallet"**
2. **TonConnect SDK opens wallet selection**
3. **User selects and connects wallet**
4. **Frontend requests challenge from backend**
5. **User signs challenge in wallet**
6. **Frontend sends signature to backend for verification**
7. **Backend verifies signature and issues JWT token**
8. **User is authenticated and can access protected routes**

## 🛠️ Development Setup

1. **Install dependencies:**
   ```bash
   # Backend
   cd casino-back-main
   npm install @noble/ed25519 tweetnacl crypto-js
   
   # Frontend
   cd ok-777-fronted
   npm install @tonconnect/sdk @tonconnect/ui-react
   ```

2. **Configure environment variables:**
   ```env
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   TON_API_URL=https://tonapi.io/v2
   TON_CHALLENGE_EXPIRY=120000
   ```

3. **Update manifest.json** with your app's details

4. **Start the applications:**
   ```bash
   # Backend
   cd casino-back-main
   npm run dev
   
   # Frontend
   cd ok-777-fronted
   npm run dev
   ```

## 📱 Supported Wallets

The TonConnect integration supports all wallets that implement the TonConnect protocol, including:
- Tonkeeper
- OpenMask
- MyTonWallet
- And many others

## 🔧 Troubleshooting

### Common Issues

1. **"Invalid TON address format"**
   - Ensure the address follows TON format (UQ/EQ/0: prefix, 48 characters)

2. **"Unable to retrieve public key"**
   - Check TON API connectivity
   - Verify address exists on TON blockchain

3. **"Invalid signature"**
   - Ensure the message was signed correctly
   - Check that the signing hash matches backend calculation

4. **"Challenge has expired"**
   - Challenges expire after 2 minutes
   - Request a new challenge if needed

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

This will provide detailed console logs for troubleshooting authentication issues.
