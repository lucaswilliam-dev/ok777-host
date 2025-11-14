import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma';

// Telegram user data interface
export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Verify Telegram data signature
export function verifyTelegramData(data: TelegramUserData): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
    return false;
  }

  // Create secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  
  // Extract hash from data
  const { hash, ...userData } = data;
  
  // Create data check string
  const dataCheckString = Object.keys(userData)
    .sort()
    .map(key => `${key}=${userData[key as keyof typeof userData]}`)
    .join('\n');
  
  // Create HMAC hash
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(dataCheckString);
  const calculatedHash = hmac.digest('hex');
  
  // Compare hashes
  return calculatedHash === hash;
}

// Create or get user from Telegram data
export async function createOrGetTelegramUser(telegramData: TelegramUserData): Promise<any> {
  const { id, first_name, last_name, username, photo_url } = telegramData;
  
  // Check if user already exists by telegram username
  let user = await prisma.user.findFirst({
    where: {
      telegram: username
    }
  });

  if (user) {
    // Update user with latest Telegram info
    user = await prisma.user.update({
      where: { id: user.id },
      data: { 
        name: `${first_name} ${last_name || ''}`.trim(),
        avatar: photo_url,
        telegram: username
      }
    });
    return user;
  }

  // Check if user exists by name (fallback)
  user = await prisma.user.findFirst({
    where: {
      name: `${first_name} ${last_name || ''}`.trim()
    }
  });

  if (user) {
    // Update existing user with Telegram info
    user = await prisma.user.update({
      where: { id: user.id },
      data: { 
        telegram: username,
        avatar: photo_url
      }
    });
    return user;
  }

  // Create new user
  const email = username ? `${username}@telegram.local` : `telegram_${id}@telegram.local`;
  
  user = await prisma.user.create({
    data: {
      email,
      password: crypto.randomBytes(32).toString('hex'), // Random password for Telegram users
      role: 'user',
      status: 'active',
      name: `${first_name} ${last_name || ''}`.trim(),
      telegram: username,
      avatar: photo_url,
      email_verified: true // Telegram users are considered verified
    }
  });

  return user;
}

// Generate JWT token for Telegram user
export function generateTelegramJWT(user: any): string {
  const jwtSecret = process.env.JWTPRIVATEKEY;
  
  if (!jwtSecret) {
    throw new Error('JWTPRIVATEKEY not found in environment variables');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      provider: 'telegram'
    },
    jwtSecret,
    { expiresIn: '24h' }
  );
}

// Parse Telegram callback data from query parameters
export function parseTelegramCallbackData(query: any): TelegramUserData | null {
  try {
    const {
      id,
      first_name,
      last_name,
      username,
      photo_url,
      auth_date,
      hash
    } = query;

    if (!id || !first_name || !auth_date || !hash) {
      console.error('Missing required Telegram data fields');
      return null;
    }

    return {
      id: parseInt(id),
      first_name,
      last_name: last_name || undefined,
      username: username || undefined,
      photo_url: photo_url || undefined,
      auth_date: parseInt(auth_date),
      hash
    };
  } catch (error) {
    console.error('Error parsing Telegram callback data:', error);
    return null;
  }
}
