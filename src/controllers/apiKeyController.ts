import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errorHandler';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isValidApiKeyFormat } from '../utils/validators';

/**
 * Set Gemini API key for the authenticated user
 */
export async function setGeminiApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { apiKey } = req.body;

    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    if (!apiKey) {
      throw new ApiError(400, 'API key is required');
    }

    if (typeof apiKey !== 'string') {
      throw new ApiError(400, 'API key must be a string');
    }

    if (!isValidApiKeyFormat(apiKey)) {
      throw new ApiError(400, 'Invalid API key format');
    }

    // Verify the API key with Gemini before saving
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Make a small test request to verify key works
      await model.generateContent('Test message to verify API key validity');
      
      logger.info(`Valid Gemini API key set for user: ${req.user.email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Gemini API key validation failed: ${errorMessage}`);
      
      if (errorMessage.includes('API key not valid')) {
        throw new ApiError(400, 'The provided Gemini API key is invalid');
      } else {
        throw new ApiError(400, 'Could not verify Gemini API key. Please check the key and try again.');
      }
    }

    // Save the API key securely
    await req.user.setGeminiApiKey(apiKey);

    res.status(200).json({
      success: true,
      message: 'Gemini API key saved successfully'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify if the Gemini API key for the authenticated user is valid
 */
export async function verifyGeminiApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const apiKey = await req.user.getGeminiApiKey();

    if (!apiKey) {
      res.status(200).json({
        success: true,
        hasKey: false,
        valid: false,
        message: 'No Gemini API key is saved for this user'
      });
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Make a small test request to verify key still works
      await model.generateContent('Test message to verify API key validity');
      
      res.status(200).json({
        success: true,
        hasKey: true,
        valid: true,
        message: 'Gemini API key is valid'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Gemini API key validation failed: ${errorMessage}`);
      
      res.status(200).json({
        success: true,
        hasKey: true,
        valid: false,
        message: 'Gemini API key is invalid or has expired'
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Delete Gemini API key for the authenticated user
 */
export async function deleteGeminiApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    // Remove the API key
    await req.user.setGeminiApiKey('');

    logger.info(`Gemini API key deleted for user: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Gemini API key deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}