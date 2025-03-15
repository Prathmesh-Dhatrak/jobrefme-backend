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
  userProvidedApiKey: boolean;
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
  apiKey?: string;
}

type JobCacheEntry = SuccessfulJobCacheEntry | FailedJobCacheEntry | ProcessingJobCacheEntry;

const jobCache = new NodeCache({
  stdTTL: 3600, // 1 hour cache TTL
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
    
    const hasCustomApiKey = apiKey ? apiKey.trim().length > 0 : false;
    const cacheKey = `job:${jobId}${hasCustomApiKey ? ':custom' : ''}`;
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    if (cachedResult && cachedResult.status === 'completed') {
      logger.info(`Found completed result for job ID: ${jobId}`);
    } 
    else if (cachedResult && cachedResult.status === 'processing') {
      logger.info(`Job ID: ${jobId} is already being processed (started ${Date.now() - cachedResult.startedAt}ms ago)`);
    }
    else {
      const processingEntry: ProcessingJobCacheEntry = {
        status: 'processing',
        jobId,
        startedAt: Date.now(),
        apiKey: hasCustomApiKey ? apiKey : undefined
      };
      jobCache.set(cacheKey, processingEntry);
      
      (async () => {
        try {
          const jobData = await scrapeJobPosting(jobUrl);
          
          if (!jobData) {
            logger.error(`Could not extract job details for ${jobId}`);
            
            const errorEntry: FailedJobCacheEntry = {
              status: 'completed',
              success: false,
              jobId,
              error: 'Could not extract job details from HireJobs',
              timestamp: Date.now()
            };
            jobCache.set(cacheKey, errorEntry);
            
            return;
          }
          
          let jobTitle = jobData.title.trim();
          let companyName = jobData.company.trim();
          
          if (jobTitle.includes(' at ')) {
            const titleParts = jobTitle.split(' at ');
            jobTitle = titleParts[0].trim();
            if (!companyName || companyName === 'the company') {
              companyName = titleParts[1].trim();
            }
          }
          
          if (companyName === 'Company on') {
            companyName = 'Company';
          }
          
          const validApiKey = apiKey && apiKey.trim().length > 0 ? apiKey : undefined;
          const referralMessage = await generateReferralMessage(
            jobTitle,
            companyName,
            jobData.description,
            validApiKey
          );
          
          const successEntry: SuccessfulJobCacheEntry = {
            status: 'completed',
            success: true,
            jobId,
            jobTitle,
            companyName,
            referralMessage,
            timestamp: Date.now(),
            userProvidedApiKey: !!validApiKey
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
          jobCache.set(cacheKey, errorEntry);
        }
      })();
    }
    
    res.status(202).json({
      success: true,
      status: 'processing',
      message: 'Your request is being processed. Please wait a moment.',
      jobId,
      estimatedTime: '5-10 seconds',
      usingCustomApiKey: hasCustomApiKey
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
    
    const hasCustomApiKey = apiKey ? apiKey.trim().length > 0 : false;
    const cacheKey = `job:${jobId}${hasCustomApiKey ? ':custom' : ''}`;
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    if (!cachedResult) {
      logger.info(`No cached result found for job ID: ${jobId}`);
      throw new ApiError(404, 'Job referral not found. Please submit the job URL first.');
    }
    
    if (cachedResult.status === 'processing') {
      const elapsedTime = Date.now() - cachedResult.startedAt;
      logger.info(`Job ID: ${jobId} is still processing (running for ${elapsedTime}ms)`);
      
      res.status(202).json({
        success: true,
        status: 'processing',
        message: 'Your request is still being processed. Please try again in a moment.',
        jobId,
        processingTime: elapsedTime,
        startedAt: cachedResult.startedAt,
        usingCustomApiKey: hasCustomApiKey
      });
      return;
    }
    
    if (cachedResult.success) {
      const successResult = cachedResult as SuccessfulJobCacheEntry;
      res.status(200).json({
        success: true,
        referralMessage: successResult.referralMessage,
        jobTitle: successResult.jobTitle,
        companyName: successResult.companyName,
        jobId,
        cached: true,
        cachedAt: successResult.timestamp,
        usingCustomApiKey: successResult.userProvidedApiKey
      });
      return;
    } else {
      throw new ApiError(422, (cachedResult as FailedJobCacheEntry).error || 'Could not extract job details from HireJobs');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error retrieving referral: ${errorMessage}`);
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