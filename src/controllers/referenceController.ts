import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferenceMessage } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';
import NodeCache from 'node-cache';

interface SuccessfulJobCacheEntry {
  status: 'completed';
  success: true;
  jobId: string;
  jobTitle: string;
  companyName: string;
  referenceMessage: string;
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
  stdTTL: 3600, // 1 hour cache TTL
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false
});

/**
 * Generates a reference message for a job posting
 * Uses a two-phase response approach to improve perceived performance:
 * 1. Immediate acknowledge response with job ID and status
 * 2. Full response with generated reference message
 */
export async function generateReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jobUrl } = req.body;
  const startTime = Date.now();
  
  try {
    logger.info(`Processing reference request for HireJobs URL: ${jobUrl}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    // Check if we already have a result for this job in the cache
    const cacheKey = `job:${jobId}`;
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    // If we have a completed result, we don't need to process again
    if (cachedResult && cachedResult.status === 'completed') {
      logger.info(`Found completed result for job ID: ${jobId}`);
    } 
    // If job is already being processed, just acknowledge that
    else if (cachedResult && cachedResult.status === 'processing') {
      logger.info(`Job ID: ${jobId} is already being processed (started ${Date.now() - cachedResult.startedAt}ms ago)`);
    }
    // If no entry or stale entry, mark as processing and start the crawler
    else {
      // Mark as processing in the cache
      const processingEntry: ProcessingJobCacheEntry = {
        status: 'processing',
        jobId,
        startedAt: Date.now()
      };
      jobCache.set(cacheKey, processingEntry);
      
      // Continue processing asynchronously
      (async () => {
        try {
          // Start crawling the job posting
          const jobData = await scrapeJobPosting(jobUrl);
          
          if (!jobData) {
            logger.error(`Could not extract job details for ${jobId}`);
            
            // Store error in cache
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
          
          // Generate reference message
          const referenceMessage = await generateReferenceMessage(
            jobTitle,
            companyName,
            jobData.description
          );
          
          // Store the result in cache
          const successEntry: SuccessfulJobCacheEntry = {
            status: 'completed',
            success: true,
            jobId,
            jobTitle,
            companyName,
            referenceMessage,
            timestamp: Date.now()
          };
          jobCache.set(cacheKey, successEntry);
          
          const processingTime = Date.now() - startTime;
          logger.info(`Reference generation for ${jobId} completed in ${processingTime}ms`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Async processing error for ${jobId}: ${errorMessage}`);
          
          // Store error in cache
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
    
    // Send immediate acknowledgment response to improve perceived performance
    // Using HTTP 202 Accepted status to indicate the request is being processed
    res.status(202).json({
      success: true,
      status: 'processing',
      message: 'Your request is being processed. Please wait a moment.',
      jobId,
      estimatedTime: '5-10 seconds'
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error starting reference generation: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Endpoint to retrieve the generated reference message
 * This allows decoupling the heavy work from the initial request
 */
export async function getGeneratedReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Retrieving reference for job ID: ${jobId}`);
    
    // Check if we have a cached result
    const cacheKey = `job:${jobId}`;
    const cachedResult = jobCache.get<JobCacheEntry>(cacheKey);
    
    // If no cached result, we haven't seen this job before
    if (!cachedResult) {
      logger.info(`No cached result found for job ID: ${jobId}`);
      throw new ApiError(404, 'Job reference not found. Please submit the job URL first.');
    }
    
    // If job is still processing, return a special response
    if (cachedResult.status === 'processing') {
      const elapsedTime = Date.now() - cachedResult.startedAt;
      logger.info(`Job ID: ${jobId} is still processing (running for ${elapsedTime}ms)`);
      
      res.status(202).json({
        success: true,
        status: 'processing',
        message: 'Your request is still being processed. Please try again in a moment.',
        jobId,
        processingTime: elapsedTime,
        startedAt: cachedResult.startedAt
      });
      return; // Add return statement here to exit the function
    }
    
    // At this point we know it's a completed job (success or failure)
    if (cachedResult.success) {
      // TypeScript now knows this is a SuccessfulJobCacheEntry
      res.status(200).json({
        success: true,
        referenceMessage: cachedResult.referenceMessage,
        jobTitle: cachedResult.jobTitle,
        companyName: cachedResult.companyName,
        jobId,
        cached: true,
        cachedAt: cachedResult.timestamp
      });
      return;
    } else {
      // TypeScript now knows this is a FailedJobCacheEntry
      throw new ApiError(422, cachedResult.error || 'Could not extract job details from HireJobs');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error retrieving reference: ${errorMessage}`);
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