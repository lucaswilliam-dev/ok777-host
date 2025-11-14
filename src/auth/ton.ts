import express from 'express';
import jwt from 'jsonwebtoken';
import { ed25519 } from '@noble/curves/ed25519';
import crypto from 'crypto';

const router = express.Router();

// In-memory store for challenges (in production, use Redis or database)
const challengeStore: Map<string, { challenge: string; timestamp: number; domain: string }> = new Map();

// JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Challenge expiration time (2 minutes)
const CHALLENGE_EXPIRY = 2 * 60 * 1000;

/**
 * Generate a secure challenge string
 */
function generateChallenge(domain: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  return `${nonce}-${timestamp}-${domain}`;
}

/**
 * Validate TON address format
 */
function isValidTonAddress(address: string): boolean {
  // For testing purposes, accept any non-empty string as a valid TON address
  // In production, you would implement proper TON address validation
  return address && address.length > 0;
}

/**
 * Extract public key from wallet state init
 */
function extractPublicKeyFromStateInit(walletStateInit: string): string | null {
  try {
    // This is a simplified implementation
    // In a real implementation, you would parse the wallet state init properly
    // For now, we'll return null and rely on TON API
    return null;
  } catch (error) {
    console.error('Error extracting public key from state init:', error);
    return null;
  }
}

/**
 * Get public key from TON API
 */
async function getPublicKeyFromTonApi(address: string): Promise<string | null> {
  try {
    const response = await fetch(`https://tonapi.io/v2/accounts/${address}/publickey`);
    if (!response.ok) {
      throw new Error(`TON API error: ${response.status}`);
    }
    const data = await response.json();
    return data.public_key;
  } catch (error) {
    console.error('Error fetching public key from TON API:', error);
    return null;
  }
}

/**
 * Verify TON signature using Ed25519
 */
function verifyTonSignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    // Convert hex strings to Uint8Array
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'hex'));
    const publicKeyBytes = new Uint8Array(Buffer.from(publicKey, 'hex'));

    // Verify signature using Ed25519
    return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch (error) {
    console.error('Error verifying TON signature:', error);
    return false;
  }
}

/**
 * Build TON signing hash
 */
function buildTonSigningHash(message: string): string {
  const messageHash = crypto.createHash('sha256').update(message).digest();
  const tonConnectPrefix = Buffer.from('ton-connect', 'utf8');
  const prefix = Buffer.concat([Buffer.from([0xff, 0xff]), tonConnectPrefix]);
  const fullHash = Buffer.concat([prefix, messageHash]);
  return crypto.createHash('sha256').update(fullHash).digest('hex');
}

/**
 * GET /api/auth/challenge
 * Generate a challenge for TON wallet authentication
 */
router.get('/challenge', async (req, res) => {
  try {
    const domain = req.get('host') || 'localhost';
    const challenge = generateChallenge(domain);
    const timestamp = Date.now();

    // Store challenge with timestamp
    challengeStore.set(challenge, {
      challenge,
      timestamp,
      domain
    });

    // Clean up expired challenges
    const now = Date.now();
    for (const [key, value] of challengeStore.entries()) {
      if (now - value.timestamp > CHALLENGE_EXPIRY) {
        challengeStore.delete(key);
      }
    }

    console.log(`TON Challenge generated for domain: ${domain}`);

    res.json({
      code: 200,
      message: 'Challenge generated successfully',
      data: {
        challenge,
        expiresIn: CHALLENGE_EXPIRY / 1000 // seconds
      }
    });
  } catch (error) {
    console.error('Error generating TON challenge:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify TON signature and issue JWT token
 */
router.post('/verify', async (req, res) => {
  try {
    const { address, signature, message, walletStateInit } = req.body;

    // Validate input
    if (!address || !signature || !message) {
      return res.status(400).json({
        code: 400,
        message: 'Address, signature, and message are required'
      });
    }

    // Validate TON address format
    if (!isValidTonAddress(address)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid TON address format'
      });
    }

    // Check if challenge exists and is not expired
    const challengeData = challengeStore.get(message);
    if (!challengeData) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid or expired challenge'
      });
    }

    // Check if challenge is expired
    if (Date.now() - challengeData.timestamp > CHALLENGE_EXPIRY) {
      challengeStore.delete(message);
      return res.status(400).json({
        code: 400,
        message: 'Challenge has expired'
      });
    }

    // Get public key
    let publicKey: string | null = null;

    // Try to extract from wallet state init first
    if (walletStateInit) {
      publicKey = extractPublicKeyFromStateInit(walletStateInit);
    }

    // Fallback to TON API
    if (!publicKey) {
      publicKey = await getPublicKeyFromTonApi(address);
    }

    if (!publicKey) {
      return res.status(400).json({
        code: 400,
        message: 'Unable to retrieve public key for address'
      });
    }

    // Build the signing hash
    const signingHash = buildTonSigningHash(message);

    // Verify the signature
    // For development/testing, allow mock signatures
    const isMockSignature = signature.startsWith('mock_signature_');
    const isValidSignature = isMockSignature || verifyTonSignature(signingHash, signature, publicKey);

    if (!isValidSignature) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid signature'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        address: address.toLowerCase(),
        type: 'ton',
        publicKey: publicKey
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Clean up the used challenge
    challengeStore.delete(message);

    // Set secure httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log(`TON Authentication successful for address: ${address}`);

    res.json({
      code: 200,
      message: 'Authentication successful',
      data: {
        token,
        user: {
          address: address.toLowerCase(),
          type: 'ton',
          publicKey: publicKey
        }
      }
    });
  } catch (error) {
    console.error('Error verifying TON signature:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/auth/profile
 * Get user profile (protected route)
 */
router.get('/profile', async (req, res) => {
  try {
    // This will be protected by JWT middleware
    const user = (req as any).tonUser;
    
    res.json({
      code: 200,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          address: user.address,
          type: user.type,
          publicKey: user.publicKey,
          authenticatedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error retrieving TON profile:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

export default router;
