import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferralMessage } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';
import { IUser } from '../models/User';
import User from '../models/User';
import NodeCache from 'node-cache';

interface SuccessfulJobCacheEntry {
  status: 'completed';
  success: true;
  jobId: string;
  jobTitle: string;
  companyName: string;
  referralMessage: string;
  timestamp: number;
  userId?: string;
}

interface FailedJobCacheEntry {
  status: 'completed';
  success: false;
  jobId: string;
  error: string;
  timestamp: number;
  userId?: string;
}

interface ProcessingJobCacheEntry {
  status: 'processing';
  jobId: string;
  startedAt: number;
  userId?: string;
}

type JobCacheEntry = SuccessfulJobCacheEntry | FailedJobCacheEntry | ProcessingJobCacheEntry;

const jobCache = new NodeCache({
  stdTTL: 3600, // 1 hour cache TTL for successful entries
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false
});

/**
 * Generates a referral message for a job posting
 */
export async function generateReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jobUrl, apiKey: requestApiKey } = req.body;
  const startTime = Date.now();
  
  try {
    logger.info(`Processing referral request for HireJobs URL: ${jobUrl}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    // Get API key based on priority:
    // 1. API key from request body (for backward compatibility or non-logged in users)
    // 2. User's stored API key (if authenticated)
    // 3. Default server API key
    let userApiKey: string | undefined = requestApiKey;
    let userId: string | undefined;
    
    // If user is authenticated and has not provided an API key in the request
    if (req.user && !requestApiKey) {
      const user = req.user as IUser;
      userId = user._id.toString();
      
      // Get user's stored API key
      const userWithApiKey = await User.findById(userId).select('+apiKeys.gemini');
      if (userWithApiKey) {
        const retrievedApiKey = await userWithApiKey.getGeminiApiKey();
        if (retrievedApiKey) {
          userApiKey = retrievedApiKey;
          logger.info(`Using API key from authenticated user: ${userId}`);
        }
      }
    }
    
    // Create cache key based on job ID and API key source
    const cacheKey = userId 
      ? `job:${jobId}:${userId}`
      : userApiKey 
        ? `job:${jobId}:custom-key`
        : `job:${jobId}`;
    
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    if (cachedResult && cachedResult.status === 'completed') {
      logger.info(`Found completed result for job ID: ${jobId}`);
      
      if (!cachedResult.success) {
        return next(new ApiError(422, cachedResult.error || 'Failed to process job data'));
      }
    } 
    else if (cachedResult && cachedResult.status === 'processing') {
      logger.info(`Job ID: ${jobId} is already being processed (started ${Date.now() - cachedResult.startedAt}ms ago)`);
      if (Date.now() - cachedResult.startedAt > 120000) {
        logger.warn(`Processing for job ID: ${jobId} appears stalled (${Date.now() - cachedResult.startedAt}ms)`);
        jobCache.del(cacheKey);
      }
    }
    else {
      const processingEntry: ProcessingJobCacheEntry = {
        status: 'processing',
        jobId,
        startedAt: Date.now(),
        userId
      };
      jobCache.set(cacheKey, processingEntry);
      
      (async () => {
        try {
          const jobData = await scrapeJobPosting(jobUrl);
          
          let jobTitle = jobData.title.trim();
          let companyName = jobData.company.trim();
          
          if (jobTitle.includes(' at ')) {
            const titleParts = jobTitle.split(' at ');
            jobTitle = titleParts[0].trim();
            if (!companyName || companyName === 'the company') {
              companyName = titleParts[1].trim();
            }
          }
          
          const referralMessage = await generateReferralMessage(
            jobTitle,
            companyName,
            jobData.description,
            userApiKey
          );
          
          const successEntry: SuccessfulJobCacheEntry = {
            status: 'completed',
            success: true,
            jobId,
            jobTitle,
            companyName,
            referralMessage,
            timestamp: Date.now(),
            userId
          };
          jobCache.set(cacheKey, successEntry);
          
          const processingTime = Date.now() - startTime;
          logger.info(`Referral generation for ${jobId} completed in ${processingTime}ms`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Async processing error for ${jobId}: ${errorMessage}`);
          
          const errorEntry: FailedJobCacheEntry = {
            status: 'completed',
            success: false,
            jobId,
            error: errorMessage,
            timestamp: Date.now(),
            userId
          };
          jobCache.set(cacheKey, errorEntry, 300);
        }
      })();
    }
    
    res.status(202).json({
      success: true,
      status: 'processing',
      message: 'Your request is being processed. Please wait a moment.',
      jobId,
      estimatedTime: '5-10 seconds',
      isAuthenticated: Boolean(userId),
      usingStoredApiKey: Boolean(userId && userApiKey && !requestApiKey),
      usingCustomApiKey: Boolean(requestApiKey)
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error starting referral generation: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Endpoint to retrieve the generated referral message
 */
export async function getGeneratedReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl, apiKey: requestApiKey } = req.body;
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Retrieving referral for job ID: ${jobId}`);
    
    let userId: string | undefined;
    let usingStoredApiKey = false;
    
    // If user is authenticated
    if (req.user) {
      const user = req.user as IUser;
      userId = user._id.toString();
      
      // Check if we're using a stored API key
      if (!requestApiKey) {
        const userWithApiKey = await User.findById(userId).select('+apiKeys.gemini');
        usingStoredApiKey = Boolean(userWithApiKey?.apiKeys?.gemini);
      }
    }
    
    // Determine which cache key to use
    const cacheKey = userId 
      ? `job:${jobId}:${userId}`
      : requestApiKey 
        ? `job:${jobId}:custom-key`
        : `job:${jobId}`;
    
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    if (!cachedResult) {
      logger.info(`No cached result found for job ID: ${jobId}`);
      throw new ApiError(404, 'Job referral not found. Please submit the job URL first.');
    }
    
    if (cachedResult.status === 'processing') {
      const elapsedTime = Date.now() - cachedResult.startedAt;
      logger.info(`Job ID: ${jobId} is still processing (running for ${elapsedTime}ms)`);
      
      if (elapsedTime > 120000) {
        logger.warn(`Processing for job ID: ${jobId} appears stalled (${elapsedTime}ms)`);
        jobCache.del(cacheKey);
        throw new ApiError(500, 'Processing is taking too long. Please try again.');
      }
      
      res.status(202).json({
        success: true,
        status: 'processing',
        message: 'Your request is still being processed. Please try again in a moment.',
        jobId,
        processingTime: elapsedTime,
        startedAt: cachedResult.startedAt
      });
      return;
    }
    
    if (cachedResult.success) {
      res.status(200).json({
        success: true,
        referralMessage: cachedResult.referralMessage,
        jobTitle: cachedResult.jobTitle,
        companyName: cachedResult.companyName,
        jobId,
        cached: true,
        cachedAt: cachedResult.timestamp,
        isAuthenticated: Boolean(userId),
        usingStoredApiKey,
        usingCustomApiKey: Boolean(requestApiKey)
      });
      return;
    } else {
      throw new ApiError(422, cachedResult.error || 'Could not extract job details from HireJobs');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error retrieving referral: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Clears the cache for a specific job ID
 */
export async function clearReferralCache(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Clearing cache for job ID: ${jobId}`);
    
    let userId: string | undefined;
    
    // If user is authenticated
    if (req.user) {
      const user = req.user as IUser;
      userId = user._id.toString();
    }
    
    // Clear cache entries (default, custom-key, and user-specific)
    const cacheKeys = [
      `job:${jobId}`,                  // Default API key
      `job:${jobId}:custom-key`,       // Custom API key (from request)
      userId ? `job:${jobId}:${userId}` : undefined  // User-specific API key
    ].filter(Boolean) as string[];
    
    let clearedCount = 0;
    
    for (const key of cacheKeys) {
      if (jobCache.has(key)) {
        jobCache.del(key);
        clearedCount++;
      }
    }
    
    res.status(200).json({
      success: true,
      message: clearedCount > 0 
        ? `Cleared ${clearedCount} cache entries for job ID: ${jobId}` 
        : `No cache entries found for job ID: ${jobId}`,
      jobId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error clearing cache: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Extract job ID from HireJobs URL
 */
function extractJobId(url: string): string {
  try {
    return url.split('/').pop() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}