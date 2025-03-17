import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferralMessage } from '../services/aiService';
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
}

interface FailedJobCacheEntry {
  status: 'completed';
  success: false;
  jobId: string;
  error: string;
  timestamp: number;
}

interface ProcessingJobCacheEntry {
  status: 'processing';
  jobId: string;
  startedAt: number;
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
  const { jobUrl, apiKey } = req.body;
  const startTime = Date.now();
  
  try {
    logger.info(`Processing referral request for HireJobs URL: ${jobUrl}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    const cacheKey = apiKey ? `job:${jobId}:custom-key` : `job:${jobId}`;
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
        startedAt: Date.now()
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
            apiKey
          );
          
          const successEntry: SuccessfulJobCacheEntry = {
            status: 'completed',
            success: true,
            jobId,
            jobTitle,
            companyName,
            referralMessage,
            timestamp: Date.now()
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
            timestamp: Date.now()
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
      estimatedTime: '5-10 seconds'
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
    const { jobUrl, apiKey } = req.body;
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Retrieving referral for job ID: ${jobId}`);
    
    const cacheKey = apiKey ? `job:${jobId}:custom-key` : `job:${jobId}`;
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
        cachedAt: cachedResult.timestamp
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
 * Useful when a job posting has been updated or when forcing a refresh
 */
export async function clearReferralCache(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Clearing cache for job ID: ${jobId}`);
    
    // Clear both standard and custom API key cache entries
    const standardCacheKey = `job:${jobId}`;
    const customCacheKey = `job:${jobId}:custom-key`;
    
    const standardExists = jobCache.has(standardCacheKey);
    const customExists = jobCache.has(customCacheKey);
    
    if (standardExists) {
      jobCache.del(standardCacheKey);
    }
    
    if (customExists) {
      jobCache.del(customCacheKey);
    }
    
    const existed = standardExists || customExists;
    
    res.status(200).json({
      success: true,
      message: existed ? `Cache cleared for job ID: ${jobId}` : `No cache entry found for job ID: ${jobId}`,
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