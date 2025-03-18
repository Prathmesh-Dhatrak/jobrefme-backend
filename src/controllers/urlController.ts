import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { validateUrlAccessibility } from '../utils/urlValidator';
import { ApiError } from '../utils/errorHandler';
import NodeCache from 'node-cache';

interface UrlValidationCacheEntry {
  valid: boolean;
  timestamp: number;
  userId?: string;
}

const urlValidationCache = new NodeCache({
  stdTTL: 1800,
  checkperiod: 60
});

/**
 * Validates if a job URL is accessible
 * Useful for quick checks before starting the full referral generation process
 */
export async function validateUrlStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jobUrl } = req.body;
  
  // Get user ID if authenticated
  const userId = req.user?._id?.toString();
  
  try {
    logger.info(`Validating job URL: ${jobUrl}${userId ? ` (user: ${userId})` : ''}`);
    
    // Use user ID in cache key if available
    const cacheKey = userId ? `user:${userId}:url:${jobUrl}` : `url:${jobUrl}`;
    const cachedResult = urlValidationCache.get<UrlValidationCacheEntry>(cacheKey);
    
    if (cachedResult) {
      logger.info(`Using cached URL validation result for ${jobUrl}: ${cachedResult.valid}`);
      
      res.status(200).json({
        success: true,
        valid: cachedResult.valid,
        message: cachedResult.valid 
          ? 'URL is valid and accessible' 
          : 'URL is not accessible or valid',
        cached: true,
        cachedAt: cachedResult.timestamp,
        authenticated: !!userId
      });
      
      return;
    }
    
    const isValid = await validateUrlAccessibility(jobUrl);
    
    const cacheEntry: UrlValidationCacheEntry = {
      valid: isValid,
      timestamp: Date.now(),
      userId
    };
    urlValidationCache.set(cacheKey, cacheEntry);
    
    res.status(200).json({
      success: true,
      valid: isValid,
      message: isValid 
        ? 'URL is valid and accessible' 
        : 'URL is not accessible or valid',
      cached: false,
      authenticated: !!userId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error validating URL: ${errorMessage}`);
    next(new ApiError(500, `Error validating URL: ${errorMessage}`));
  }
}