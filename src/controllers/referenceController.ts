import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferenceMessage } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';

export async function generateReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    logger.info(`Processing reference request for HireJobs URL: ${jobUrl}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    const jobData = await scrapeJobPosting(jobUrl);
    
    if (!jobData) {
      throw new ApiError(422, 'Could not extract job details from HireJobs');
    }
    
    const enhancedJobData = {
      title: jobData.title && jobData.title !== 'Job Position' 
             ? jobData.title 
             : `Position at ${jobData.company !== 'Company on HireJobs' ? jobData.company : 'the company'}`,
      company: jobData.company && jobData.company !== 'Company on HireJobs' 
               ? jobData.company 
               : 'the company',
      description: jobData.description
    };
    
    logger.info(`Enhanced job data: ${enhancedJobData.title} at ${enhancedJobData.company}`);
    
    const referenceMessage = await generateReferenceMessage(
      enhancedJobData.title,
      enhancedJobData.company,
      enhancedJobData.description
    );
    
    res.status(200).json({
      success: true,
      referenceMessage,
      jobTitle: enhancedJobData.title,
      companyName: enhancedJobData.company,
      jobId: jobId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error generating HireJobs reference: ${errorMessage}`);
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