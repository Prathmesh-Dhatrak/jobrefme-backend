import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferralMessage, extractJobDetailsFromContent } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';
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
 * Uses a two-phase response approach to improve perceived performance:
 * 1. Immediate acknowledge response with job ID and status
 * 2. Full response with generated referral message
 */
export async function generateReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jobUrl } = req.body;
  const startTime = Date.now();
  
  // Get user ID if authenticated
  const userId = req.user?._id?.toString();
  
  try {
    logger.info(`Processing referral request for HireJobs URL: ${jobUrl}${userId ? ` (user: ${userId})` : ''}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    // Use user ID in cache key if available
    const cacheKey = userId ? `user:${userId}:job:${jobId}` : `job:${jobId}`;
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
            userId
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
      authenticated: !!userId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error starting referral generation: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Endpoint to retrieve the generated referral message
 * This allows decoupling the heavy work from the initial request
 */
export async function getGeneratedReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    // Get user ID if authenticated
    const userId = req.user?._id?.toString();
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Retrieving referral for job ID: ${jobId}${userId ? ` (user: ${userId})` : ''}`);
    
    // Use user ID in cache key if available
    const cacheKey = userId ? `user:${userId}:job:${jobId}` : `job:${jobId}`;
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
        startedAt: cachedResult.startedAt,
        authenticated: !!userId
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
        authenticated: !!userId
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
 * Clears the cache for a specific job ID, URL, or content
 * Useful when a job posting has been updated or when forcing a refresh
 */
export async function clearReferralCache(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl, jobContent, jobId } = req.body;
    
    // Get user ID if authenticated
    const userId = req.user?._id?.toString();
    
    // Special case: clear all cache entries
    if (jobUrl === 'all' || jobContent === 'all' || jobId === 'all') {
      logger.info(`Clearing all cache entries${userId ? ` (requested by user: ${userId})` : ''}`);
      
      const keysCount = jobCache.keys().length;
      jobCache.flushAll();
      
      res.status(200).json({
        success: true,
        message: `All cache entries cleared (${keysCount} entries)`,
        authenticated: !!userId
      });
      return;
    }
    
    let requestJobId = '';
    let cacheType = 'job';
    
    if (jobId) {
      requestJobId = jobId;
      cacheType = jobId.startsWith('content_') ? 'content' : 'job';
      logger.info(`Clearing cache using provided job ID: ${requestJobId}${userId ? ` (user: ${userId})` : ''}`);
    } else if (jobUrl) {
      requestJobId = extractJobId(jobUrl);
      cacheType = 'job';
      logger.info(`Clearing cache for job URL ID: ${requestJobId}${userId ? ` (user: ${userId})` : ''}`);
    } else if (jobContent) {
      requestJobId = createHashFromContent(jobContent);
      cacheType = 'content';
      logger.info(`Clearing cache for job content hash: ${requestJobId}${userId ? ` (user: ${userId})` : ''}`);
    } else {
      throw new ApiError(400, 'Either jobUrl, jobContent, or jobId is required');
    }
    
    // Clear both authenticated and unauthenticated cache entries
    const userCacheKey = userId ? `user:${userId}:${cacheType}:${requestJobId}` : '';
    const anonymousCacheKey = `${cacheType}:${requestJobId}`;
    
    let existed = false;
    
    if (userCacheKey && jobCache.has(userCacheKey)) {
      jobCache.del(userCacheKey);
      existed = true;
    }
    
    if (jobCache.has(anonymousCacheKey)) {
      jobCache.del(anonymousCacheKey);
      existed = true;
    }
    
    res.status(200).json({
      success: true,
      message: existed ? `Cache cleared for ${cacheType} ID: ${requestJobId}` : `No cache entry found for ${cacheType} ID: ${requestJobId}`,
      jobId: requestJobId,
      cacheType,
      authenticated: !!userId
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

/**
 * Processes raw job posting content and generates a referral message
 * This endpoint allows users to submit job posting text directly rather than a URL
 * Returns the generated referral message immediately in a single request
 */
export async function processRawJobContent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jobContent } = req.body;
  const startTime = Date.now();
  
  const userId = req.user?._id?.toString();
  
  try {
    logger.info(`Processing raw job content request${userId ? ` (user: ${userId})` : ''}`);
    
    const jobContentHash = createHashFromContent(jobContent);
    logger.info(`Job content hash: ${jobContentHash}`);
    
    const cacheKey = userId ? `user:${userId}:content:${jobContentHash}` : `content:${jobContentHash}`;
    const cachedResult = jobCache.get<SuccessfulJobCacheEntry>(cacheKey);
    
    if (cachedResult && cachedResult.status === 'completed' && cachedResult.success) {
      logger.info(`Found completed result for job content hash: ${jobContentHash}`);
      
      res.status(200).json({
        success: true,
        referralMessage: cachedResult.referralMessage,
        jobTitle: cachedResult.jobTitle,
        companyName: cachedResult.companyName,
        jobId: jobContentHash,
        cached: true,
        cachedAt: cachedResult.timestamp,
        authenticated: !!userId
      });
      
      return;
    }
    
    logger.info(`No cache found for ${jobContentHash}. Processing content...`);
    
    const jobData = await extractJobDetailsFromContent(jobContent, userId);

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
      userId
    );
    
    const successEntry: SuccessfulJobCacheEntry = {
      status: 'completed',
      success: true,
      jobId: jobContentHash,
      jobTitle,
      companyName,
      referralMessage,
      timestamp: Date.now(),
      userId
    };
    jobCache.set(cacheKey, successEntry);
    
    const processingTime = Date.now() - startTime;
    logger.info(`Referral generation for content hash ${jobContentHash} completed in ${processingTime}ms`);
    
    res.status(200).json({
      success: true,
      referralMessage,
      jobTitle,
      companyName,
      jobId: jobContentHash,
      processingTime,
      cached: false,
      authenticated: !!userId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error processing job content: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Creates a hash from job content for caching purposes
 */
function createHashFromContent(content: string): string {
  try {
    let hash = 0;
    const normalizedContent = content.trim().substring(0, 1000);
    
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return `content_${Math.abs(hash)}`;
  } catch (error) {
    return `content_${Date.now()}`;
  }
}