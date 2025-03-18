import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IUser extends Document {
  googleId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  profilePhoto?: string;
  encryptedGeminiApiKey?: string;
  iv?: string;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
  setGeminiApiKey: (apiKey: string) => Promise<void>;
  getGeminiApiKey: () => Promise<string | null>;
}

const userSchema = new Schema<IUser>(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
    },
    profilePhoto: {
      type: String,
    },
    encryptedGeminiApiKey: {
      type: String,
      select: false, // Don't include in query results by default
    },
    iv: {
      type: String,
      select: false, // Don't include in query results by default
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Simpler encryption key derivation with consistent behavior
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || 'default-encryption-key-for-development-only';
  // Use a consistent hashing method to get a 32-byte key
  return crypto.createHash('sha256').update(key).digest();
}

// Method to set and encrypt Gemini API key
userSchema.methods.setGeminiApiKey = async function (apiKey: string): Promise<void> {
  if (!apiKey) {
    this.encryptedGeminiApiKey = undefined;
    this.iv = undefined;
    await this.save();
    return;
  }

  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // For AES-256-CTR (more resilient than GCM for our use case)
  const cipher = crypto.createCipheriv('aes-256-ctr', getEncryptionKey(), iv);
  
  // Encrypt the API key
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Save both the encrypted key and IV
  this.encryptedGeminiApiKey = encrypted;
  this.iv = iv.toString('hex');
  
  await this.save();
};

// Method to get and decrypt Gemini API key
userSchema.methods.getGeminiApiKey = async function (): Promise<string | null> {
  try {
    // Get the user with encryption fields
    const user = await User.findById(this._id).select('+encryptedGeminiApiKey +iv');
    
    if (!user?.encryptedGeminiApiKey || !user?.iv) {
      return null;
    }

    // Convert IV from hex string to Buffer
    const iv = Buffer.from(user.iv, 'hex');
    
    // Create decipher with the same algorithm
    const decipher = crypto.createDecipheriv('aes-256-ctr', getEncryptionKey(), iv);
    
    // Decrypt the API key
    let decrypted = decipher.update(user.encryptedGeminiApiKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;