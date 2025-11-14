# OK777 Email Verification Service

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp env.example .env
   # Add your Resend API key to .env
   ```

3. **Start server:**
   ```bash
   npm start
   ```

## API Usage

### Send Verification Code
```bash
curl -X POST http://localhost:3000/send-verification \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### Verify Code
```bash
curl -X POST http://localhost:3000/verify-code \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "code": "123456"}'
```

## Features
- ✅ 6-digit verification codes
- ✅ 5-minute expiration
- ✅ Rate limiting (3 attempts)
- ✅ Professional email templates
- ✅ Input validation
- ✅ Error handling

## Deployment
See `RENDER_DEPLOYMENT.md` for Render.com setup instructions.
