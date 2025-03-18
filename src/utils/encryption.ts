import crypto from 'crypto';
import { logger } from './logger';

// Use environment variables for the encryption keys
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'this-is-a-32-byte-encryption-key-123';
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || 'a-16-byte-ivvect';

/**
 * Encrypts sensitive data using AES-256-CBC
 * 
 * @param text The text to encrypt
 * @returns The encrypted text as a hex string
 */
export function encrypt(text: string): string {
  try {
    // Ensure the encryption key is the right length for AES-256
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
    const iv = Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16));
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data that was encrypted with the encrypt function
 * 
 * @param encryptedText The encrypted text as a hex string
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string): string {
  try {
    // Ensure the encryption key is the right length for AES-256
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
    const iv = Buffer.from(ENCRYPTION_IV.padEnd(16).slice(0, 16));
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}