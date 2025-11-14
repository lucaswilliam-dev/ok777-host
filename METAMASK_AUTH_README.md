# MetaMask Authentication Implementation

This document describes the complete MetaMask authentication system implemented for the casino backend and frontend.

## 🔧 Backend Setup

### Dependencies
The following dependencies are already installed in the backend:
- `ethers` (^6.15.0) - For signature verification (using ethers v6 API)
- `jsonwebtoken` (^9.0.2) - For JWT token generation
- `express` (^4.21.2) - Web framework
- `cors` (^2.8.5) - CORS middleware

### Environment Variables
Add the following environment variable to your `.env` file:

```env
# JWT Secret (CHANGE THIS IN PRODUCTION!)
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
```

### Files Created/Modified

1. **`src/auth/metamask.ts`** - MetaMask authentication routes
2. **`src/middleware/auth.ts`** - JWT verification middleware
3. **`src/api/users.ts`** - Added MetaMask routes to users router

### API Endpoints

#### POST `/api/v1/users/auth/nonce`
Generates a random nonce for wallet authentication.

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Nonce generated successfully",
  "data": {
    "nonce": "abc123def456"
  }
}
```

#### POST `/api/v1/users/auth/verify`
Verifies wallet signature and issues JWT token.

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "signature": "0x..."
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
      "address": "0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6",
      "type": "metamask"
    }
  }
}
```

#### GET `/api/v1/users/profile-metamask`
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
      "address": "0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6",
      "type": "metamask",
      "authenticatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

## 🎨 Frontend Setup

### Dependencies
No additional dependencies required for the frontend.

### Files Created

1. **`lib/metamask.ts`** - MetaMask service for handling wallet interactions
2. **`components/auth/MetaMaskLogin.tsx`** - React component for MetaMask login
3. **`app/metamask-demo/page.tsx`** - Demo page showcasing the functionality
4. **`types/api.ts`** - Added MetaMask authentication types

### Environment Variables
Add the following environment variable to your frontend `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.ok777.io
```

## 🚀 Usage

### Backend
1. Start the backend server:
```bash
npm run dev
```

2. The MetaMask authentication endpoints will be available at:
   - `POST /api/v1/users/auth/nonce`
   - `POST /api/v1/users/auth/verify`
   - `GET /api/v1/users/profile-metamask`

### Frontend
1. Navigate to the demo page: `/metamask-demo`
2. Click "Login with MetaMask"
3. Follow the prompts to connect your wallet and sign the message
4. View the authentication results and user information

## 🔐 Security Features

1. **Nonce-based Authentication**: Each authentication request uses a unique nonce
2. **Signature Verification**: Uses ethers.js to verify wallet signatures
3. **JWT Tokens**: Secure token-based authentication with expiration
4. **Input Validation**: Validates wallet addresses and signature formats
5. **Error Handling**: Comprehensive error handling for all edge cases

## 📱 MetaMask Login Flow

1. **Check MetaMask Availability**: Verify MetaMask is installed and available
2. **Connect Wallet**: Request user's wallet address
3. **Generate Nonce**: Backend generates a random nonce for the wallet address
4. **Sign Message**: User signs a message containing the nonce
5. **Verify Signature**: Backend verifies the signature matches the wallet address
6. **Issue JWT**: Backend issues a JWT token upon successful verification
7. **Store Token**: Frontend stores the JWT token in localStorage

## 🛡️ JWT Middleware

The JWT middleware (`verifyToken`) provides:
- Token validation
- Expiration checking
- MetaMask user context injection (available as `req.metamaskUser`)
- Proper error responses

## 🔧 Customization

### Token Expiration
Modify the token expiration in `src/auth/metamask.ts`:
```typescript
const token = jwt.sign(
  { address: address.toLowerCase(), type: 'metamask' },
  JWT_SECRET,
  { expiresIn: '24h' } // Change this value
);
```

### Nonce Cleanup
Adjust the nonce cleanup timeout in `src/auth/metamask.ts`:
```typescript
setTimeout(() => {
  delete nonceStore[address.toLowerCase()];
}, 5 * 60 * 1000); // 5 minutes - change as needed
```

## 🧪 Testing

### Backend Testing
Use tools like Postman or curl to test the API endpoints:

```bash
# Get nonce
curl -X POST http://localhost:3001/api/v1/users/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"}'

# Verify signature (use actual signature from MetaMask)
curl -X POST http://localhost:3001/api/v1/users/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6", "signature": "0x..."}'
```

### Frontend Testing
1. Install MetaMask browser extension
2. Create or import a wallet
3. Navigate to `/metamask-demo`
4. Test the complete login flow

## 🚨 Production Considerations

1. **Change JWT Secret**: Use a strong, random JWT secret in production
2. **Use Redis**: Replace in-memory nonce storage with Redis for scalability
3. **Rate Limiting**: Implement rate limiting for authentication endpoints
4. **HTTPS**: Ensure all communication happens over HTTPS
5. **CORS**: Configure CORS properly for your domain
6. **Logging**: Add proper logging for security events

## 📚 Additional Resources

- [MetaMask Documentation](https://docs.metamask.io/)
- [Ethers.js Documentation](https://docs.ethers.io/)
- [JWT.io](https://jwt.io/) - For JWT token debugging
- [Web3 Authentication Best Practices](https://web3auth.io/docs/)
