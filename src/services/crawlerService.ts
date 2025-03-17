import { PlaywrightCrawler } from 'crawlee';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { JobData } from '../types/types';
import { parseHireJobsHTML } from '../utils/parser';

/**
 * Specialized crawler for HireJobs.in job postings
 * 
 * @param jobUrl URL of the HireJobs job posting
 * @returns JobData object containing extracted content
 * @throws Error if job data cannot be extracted
 */
export async function scrapeJobPosting(jobUrl: string): Promise<JobData> {
  logger.info(`Starting crawler for HireJobs URL: ${jobUrl}`);
  
  if (process.env.USE_DIRECT_FETCH === 'true') {
    try {
      logger.info('Using direct fetch approach to reduce memory usage');
      const jobData = await directFetchJobData(jobUrl);
      
      validateJobData(jobData, jobUrl);
      return jobData;
    } catch (directFetchError) {
      logger.warn(`Direct fetch failed: ${directFetchError instanceof Error ? directFetchError.message : String(directFetchError)}`);
    }
  }
  
  try {
    let jobData: JobData | null = null;
    
    const crawler = new PlaywrightCrawler({
      headless: true,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      navigationTimeoutSecs: 30,
      launchContext: {
        launchOptions: {
          args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox', '--js-flags=--expose-gc'],
        }
      },
      
      async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);
        
        await page.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        });
        
        await page.waitForLoadState('domcontentloaded');
        
        try {
          await page.waitForSelector('.job-container, main, h1, article', { timeout: 5000 });
        } catch (err) {
          log.info('Timed out waiting for job content selectors, continuing anyway');
        }
        
        try {
          jobData = await extractHireJobsData(page, request.url);
          validateJobData(jobData, request.url);
          
          log.info(`Extracted job data: ${JSON.stringify({
            title: jobData.title,
            company: jobData.company,
            descriptionLength: jobData.description ? jobData.description.length : 0
          })}`);
        } catch (extractError) {
          log.error(`Error extracting job data: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
          throw extractError;
        }
      },
      
      failedRequestHandler({ request, log, error }) {
        log.error(`Request failed (${request.url}): ${error instanceof Error ? error.message : String(error)}`);
      },
    });
    
    await crawler.run([jobUrl]);
    
    if (!jobData) {
      throw new Error(`Failed to extract job data from ${jobUrl}`);
    }
    
    validateJobData(jobData, jobUrl);
    return jobData;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Crawler error: ${errorMessage}`);
    
    throw new Error(`Failed to extract job data: ${errorMessage}`);
  }
}

/**
 * Validate job data to ensure it meets minimum requirements
 * @throws Error if job data is invalid
 */
function validateJobData(jobData: JobData | null, url: string): void {
  if (!jobData) {
    throw new Error(`No job data was extracted from ${url}`);
  }
  
  if (!jobData.title || jobData.title.length < 3 || jobData.title === 'Job Position') {
    throw new Error('Could not extract valid job title');
  }
  
  if (!jobData.company || jobData.company.length < 2 || jobData.company === 'Company on') {
    throw new Error('Could not extract valid company name');
  }
  
  if (!jobData.description || jobData.description.length < 100) {
    throw new Error('Could not extract sufficient job description');
  }
}

/**
 * Simpler direct fetch approach for memory constrained environments
 * @throws Error if fetching or parsing fails
 */
async function directFetchJobData(jobUrl: string): Promise<JobData> {
  try {
    logger.info(`Using direct fetch for ${jobUrl}`);
    
    const response = await fetch(jobUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Direct fetch failed with status ${response.status}`);
    }
    
    const html = await response.text();
    const jobData = await parseHireJobsHTML(html);
    validateJobData(jobData, jobUrl);
    return jobData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Direct fetch error: ${errorMessage}`);
    throw new Error(`Failed to fetch job data: ${errorMessage}`);
  }
}

/**
 * Extract job data from HireJobs.in pages using multiple extraction methods
 * with parallel processing where possible
 */
async function extractHireJobsData(page: Page, url: string): Promise<JobData> {
  try {
    const jobId = url.split('/').pop() || '';
    logger.info(`Extracting data for HireJobs job ID: ${jobId}`);
    
    const html = await page.content();
    
    interface HiringInfo {
      title: string;
      company: string;
    }

    interface JobDetails {
      metadata: string;
      sections: Record<string, string>;
      skills: string;
    }
    
    interface ParsedJobData extends JobData {
      location?: string;
      salary?: string;
      jobType?: string;
      postedDate?: string;
    }
    
    const [
      hiringInfo,
      jobDetails,
      parsedJobData
    ] = await Promise.all([
      extractHiringInfo(page).catch(error => {
        logger.warn(`Hiring pattern extraction error: ${error instanceof Error ? error.message : String(error)}`);
        return { title: '', company: '' } as HiringInfo;
      }),
      
      extractJobDetails(page).catch(error => {
        logger.warn(`Job details extraction error: ${error instanceof Error ? error.message : String(error)}`);
        return { metadata: '', sections: {}, skills: '' } as JobDetails;
      }),
      
      parseHireJobsHTML(html).catch(error => {
        logger.warn(`HTML parser error: ${error instanceof Error ? error.message : String(error)}`);
        return { 
          title: '', 
          company: '', 
          description: '' 
        } as ParsedJobData;
      })
    ]);
    
    let jobTitle = '';
    let companyName = '';
    let jobDescription = '';
    let additionalInfo: string[] = [];
    
    if (hiringInfo.company) {
      companyName = hiringInfo.company;
    }
    
    if (hiringInfo.title) {
      jobTitle = hiringInfo.title;
    }
    
    if (jobDetails.metadata) {
      const metaParts = jobDetails.metadata.split('•').map(part => part.trim()).filter(part => part);
      additionalInfo = [...additionalInfo, ...metaParts];
    }
    
    if (jobDetails.sections && Object.keys(jobDetails.sections).length > 0) {
      const descriptionParts = [];
      
      for (const [section, content] of Object.entries(jobDetails.sections)) {
        if (content && content.trim()) {
          descriptionParts.push(`${section}:\n${content}`);
        }
      }
      
      if (descriptionParts.length > 0) {
        jobDescription = descriptionParts.join('\n\n');
      }
    }
    
    if (jobDetails.skills && !jobDescription.includes('Skills')) {
      jobDescription = (jobDescription ? jobDescription + '\n\n' : '') + jobDetails.skills;
    }
    
    if (!jobTitle || jobTitle === 'Job Position') {
      jobTitle = parsedJobData.title;
    }
    
    if (!companyName || companyName === 'Company on HireJobs' || companyName === 'Company on') {
      companyName = parsedJobData.company;
    }
    
    if (!jobDescription || jobDescription.length < 100) {
      jobDescription = parsedJobData.description;
    }
    
    const parsedJobDataWithOptionals = parsedJobData as ParsedJobData;
    
    if (parsedJobDataWithOptionals.location) {
      additionalInfo.push(`Location: ${parsedJobDataWithOptionals.location}`);
    }
    
    if (parsedJobDataWithOptionals.salary) {
      additionalInfo.push(`Salary: ${parsedJobDataWithOptionals.salary}`);
    }
    
    if (parsedJobDataWithOptionals.jobType) {
      additionalInfo.push(`Job Type: ${parsedJobDataWithOptionals.jobType}`);
    }
    
    if (jobTitle) {
      jobTitle = jobTitle
        .replace(/^RE:\s*/i, '')
        .replace(/^FWD:\s*/i, '')
        .replace(/hirejobs/gi, '')
        .replace(/^.*is\s+hiring\s+for\s*/i, '')
        .replace(/\s*\|\s*.+$/i, '')
        .replace(/^explore\s+tech\s+jobs\s+globally\s*/i, '')
        .trim();
    }
    
    if (companyName) {
      companyName = companyName
        .replace(/hirejobs/gi, '')
        .replace(/^\s*at\s+/i, '')
        .replace(/^\s*is\s+/i, '')
        .replace(/company\s+on\s*$/i, '')
        .trim();
    }
    
    if (additionalInfo.length > 0) {
      const uniqueInfo = [...new Set(additionalInfo)];
      if (!jobDescription.includes('Additional Information')) {
        jobDescription += '\n\nAdditional Information:\n' + uniqueInfo.join('\n');
      }
    }
    
    if (!jobTitle || jobTitle.length < 3) {
      throw new Error('Could not extract job title');
    }
    
    if (!companyName || companyName.length < 2) {
      throw new Error('Could not extract company name');
    }
    
    if (!jobDescription || jobDescription.length < 100) {
      throw new Error('Could not extract sufficient job description');
    }
    
    logger.info(`Final extracted data - Title: ${jobTitle}, Company: ${companyName}, Description length: ${jobDescription.length} chars`);
    
    return {
      title: jobTitle,
      company: companyName,
      description: jobDescription
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error extracting HireJobs data: ${errorMessage}`);
    throw error;
  }
}

/**
 * Extract hiring info from the page
 */
async function extractHiringInfo(page: Page): Promise<{ title: string; company: string }> {
  return page.evaluate(() => {
    const hiringElements = Array.from(document.querySelectorAll('h1, h2, h3, div'))
      .filter(el => {
        const text = el.textContent?.trim() || '';
        return text.includes('is hiring for') && text.length < 150;
      });
      
    if (hiringElements.length > 0) {
      const hiringText = hiringElements[0].textContent?.trim() || '';
      const parts = hiringText.split('is hiring for');
      
      if (parts.length >= 2) {
        let title = parts[1].split('|')[0].trim();
        let company = parts[0].trim();
        
        return { title, company };
      }
    }
    
    return { title: '', company: '' };
  });
}

/**
 * Extract job details from the page
 */
async function extractJobDetails(page: Page): Promise<{ metadata: string; sections: Record<string, string>; skills: string }> {
  return page.evaluate(() => {
    const metadataText = Array.from(document.querySelectorAll('div, span, p'))
      .filter(el => {
        const text = el.textContent?.trim() || '';
        return (text.includes('•') && 
               (text.includes('LPA') || 
                text.includes('Fulltime') || 
                text.includes('years'))) && 
               text.length < 100;
      })
      .map(el => el.textContent?.trim() || '')
      .filter(text => text.length > 0)[0] || '';
      
    const sections = ['Responsibilities', 'About the company', 'Requirements', 'Qualifications', 'Skills', 'Your competencies'];
    const extractedSections: Record<string, string> = {};
    
    for (const section of sections) {
      const sectionHeaders = Array.from(document.querySelectorAll('h2, h3, h4, strong, b'))
        .filter(el => el.textContent?.includes(section));
        
      if (sectionHeaders.length > 0) {
        let sectionContent = '';
        let currentElement = sectionHeaders[0].nextElementSibling;
        
        while (currentElement && 
              !sections.some(s => currentElement?.textContent?.includes(s)) &&
              !(currentElement.tagName === 'H2' || 
                currentElement.tagName === 'H3' || 
                currentElement.tagName === 'H4')) {
                  
          const text = currentElement.textContent?.trim();
          if (text) {
            sectionContent += text + '\n';
          }
          currentElement = currentElement.nextElementSibling;
        }
        
        if (sectionContent.trim()) {
          extractedSections[section] = sectionContent.trim();
        }
      }
    }
    
    const skillsSection = Array.from(document.querySelectorAll('div, section'))
      .filter(el => el.textContent?.includes('Skills Required') || 
                    el.textContent?.includes('Top Skills Required'))
      .map(el => el.textContent?.trim() || '')
      .filter(text => text.length > 0)[0] || '';
      
    return {
      metadata: metadataText,
      sections: extractedSections,
      skills: skillsSection
    };
  });
}