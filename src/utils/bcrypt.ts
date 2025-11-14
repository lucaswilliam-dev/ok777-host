import 'dotenv/config';
import crypto from 'crypto';
const bcrypt = require('bcrypt');


export const hashPassword = async (password: string) => {
    return bcrypt.hash(password, 10);
};

// Get encryption key from environment or use default for development
const getEncryptionKey = (): Buffer => {
    const key = process.env.ENCRYPTION_KEY;
    
    // Check if key is missing, empty, or is a placeholder value
    const isPlaceholder = key && (
        key.includes('your_') || 
        key.includes('here') || 
        key.length !== 64 ||
        !/^[0-9a-fA-F]+$/.test(key) // Check if it's valid hex
    );
    
    if (!key || isPlaceholder) {
        // Use a consistent default key for development (DO NOT use in production!)
        // In production, you MUST set ENCRYPTION_KEY in your .env file
        console.warn('⚠️  ENCRYPTION_KEY not set or invalid. Using default development key. Set ENCRYPTION_KEY in production!');
        // Default development key (64 hex characters = 32 bytes)
        const defaultKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        return Buffer.from(defaultKey, 'hex');
    }
    
    // Validate the key is exactly 64 hex characters
    if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
        throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');
    }
    
    return Buffer.from(key, 'hex');
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

export const encryptPrivateKey = (privateKey: string) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

export function decryptPrivateKey(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}