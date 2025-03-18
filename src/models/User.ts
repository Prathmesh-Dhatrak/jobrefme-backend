import mongoose, { Document, Schema, Types } from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  googleId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  apiKeys?: {
    gemini?: string;
  };
  setGeminiApiKey(apiKey: string): Promise<void>;
  getGeminiApiKey(): Promise<string | null>;
  hasGeminiApiKey(): boolean;
}

const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  firstName: String,
  lastName: String,
  profilePicture: String,
  lastLogin: Date,
  apiKeys: {
    gemini: {
      type: String,
      select: false
    }
  }
}, {
  timestamps: true
});

UserSchema.methods.setGeminiApiKey = async function(apiKey: string): Promise<void> {
  if (!apiKey) {
    throw new Error('API key cannot be empty');
  }
  
  const encryptedKey = `encrypted:${encrypt(apiKey)}`;
  
  this.apiKeys = this.apiKeys || {};
  this.apiKeys.gemini = encryptedKey;
  await this.save();
};

UserSchema.methods.getGeminiApiKey = async function(): Promise<string | null> {
  if (!this.apiKeys?.gemini) return null;
  
  if (this.apiKeys.gemini.startsWith('encrypted:')) {
    const encryptedKey = this.apiKeys.gemini.substring(10);
    try {
      return decrypt(encryptedKey);
    } catch (error) {
      return null;
    }
  }
  
  // Return as is for any non-encrypted keys (legacy support)
  return this.apiKeys.gemini;
};

// Method to check if user has a Gemini API key
UserSchema.methods.hasGeminiApiKey = function(): boolean {
  return Boolean(this.apiKeys?.gemini);
};

const User = mongoose.model<IUser>('User', UserSchema);

export default User;