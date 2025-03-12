import { PlaywrightCrawler } from 'crawlee';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { JobData } from '../types/types';
import { parseHireJobsHTML } from '../utils/parser';

const USE_MOCK_CRAWLER = process.env.MOCK_CRAWLER === 'true';

/**
 * Specialized crawler for HireJobs.in job postings
 * 
 * @param jobUrl URL of the HireJobs job posting
 * @returns JobData object containing extracted content
 */
export async function scrapeJobPosting(jobUrl: string): Promise<JobData | null> {
  logger.info(`Starting crawler for HireJobs URL: ${jobUrl}`);
  
  if (USE_MOCK_CRAWLER) {
    logger.info('Using mock crawler data (MOCK_CRAWLER=true)');
    return getMockJobData(jobUrl);
  }
  
  let jobData: JobData | null = null;
  
  try {
    const crawler = new PlaywrightCrawler({
      headless: true,
      navigationTimeoutSecs: 60,
      
      async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);
        
        await page.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        });
        
        await page.waitForLoadState('domcontentloaded');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          await page.waitForSelector('.job-container, main, h1, article', { timeout: 5000 });
        } catch (err) {
          log.info('Timed out waiting for job content selectors, continuing anyway');
        }
        
        if (process.env.NODE_ENV === 'development') {
          try {
            await page.screenshot({ path: `screenshots/job-${new Date().getTime()}.png`, fullPage: true });
            log.info('Screenshot saved to screenshots directory');
          } catch (screenshotError) {
            logger.error('Failed to take screenshot', 
              screenshotError instanceof Error ? screenshotError : String(screenshotError));
          }
        }
        
        jobData = await extractHireJobsData(page, request.url);
        
        log.info(`Extracted job data: ${JSON.stringify({
          title: jobData.title,
          company: jobData.company,
          descriptionLength: jobData.description ? jobData.description.length : 0
        })}`);
      },
      
      failedRequestHandler({ request, log, error }) {
        log.error(`Request failed (${request.url}): ${error instanceof Error ? error.message : String(error)}`);
      },
    });
    
    await crawler.run([jobUrl]);
    
    return jobData;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Crawler error: ${errorMessage}`);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('Falling back to mock data due to crawler error');
      return getMockJobData(jobUrl);
    }
    
    throw error;
  }
}

/**
 * Extract job data from HireJobs.in pages using multiple extraction methods
 */
async function extractHireJobsData(page: Page, url: string): Promise<JobData> {
  try {
    const jobId = url.split('/').pop() || '';
    logger.info(`Extracting data for HireJobs job ID: ${jobId}`);
    
    let jobTitle = '';
    let companyName = '';
    let jobDescription = '';
    let additionalInfo: string[] = [];
    
    try {
      const hiringInfo = await page.evaluate(() => {
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
      
      if (hiringInfo.company) {
        companyName = hiringInfo.company;
        logger.info(`Found company name from hiring pattern: ${companyName}`);
      }
      
      if (hiringInfo.title) {
        jobTitle = hiringInfo.title;
        logger.info(`Found job title from hiring pattern: ${jobTitle}`);
      }
    } catch (patternError) {
      logger.warn(`Hiring pattern extraction error: ${patternError instanceof Error ? patternError.message : String(patternError)}`);
    }
    
    try {
      const jobDetails = await page.evaluate(() => {
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
        const extractedSections: {[key: string]: string} = {};
        
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
    } catch (detailsError) {
      logger.warn(`Job details extraction error: ${detailsError instanceof Error ? detailsError.message : String(detailsError)}`);
    }
    

    try {
      const html = await page.content();
      const parsedJobData = parseHireJobsHTML(html);
      
      if (!jobTitle || jobTitle === 'Job Position') {
        jobTitle = parsedJobData.title;
      }
      
      if (!companyName || companyName === 'Company on HireJobs' || companyName === 'Company on') {
        companyName = parsedJobData.company;
      }
      
      if (!jobDescription || jobDescription.length < 100) {
        jobDescription = parsedJobData.description;
      }
      
      if (parsedJobData.location) {
        additionalInfo.push(`Location: ${parsedJobData.location}`);
      }
      
      if (parsedJobData.salary) {
        additionalInfo.push(`Salary: ${parsedJobData.salary}`);
      }
      
      if (parsedJobData.jobType) {
        additionalInfo.push(`Job Type: ${parsedJobData.jobType}`);
      }
    } catch (parserError) {
      logger.warn(`HTML parser error: ${parserError instanceof Error ? parserError.message : String(parserError)}`);
    }
    
    if (jobTitle) {
      jobTitle = jobTitle
        .replace(/^RE:\s*/i, '')
        .replace(/^FWD:\s*/i, '')
        .replace(/hirejobs/gi, '')
        .replace(/^.*is\s+hiring\s+for\s*/i, '')
        .replace(/\s*\|\s*.+$/i, '')  // Remove everything after a pipe symbol
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
    
    if (!jobTitle || jobTitle.length < 3 || jobTitle === 'Job Position') {
      jobTitle = `Position (ID: ${jobId})`;
    }
    
    if (!companyName || companyName.length < 2 || companyName === 'Company on') {
      companyName = `Company (ID: ${jobId})`;
    }
    
    if (!jobDescription || jobDescription.length < 100) {
      if (process.env.NODE_ENV === 'development') {
        const mockData = getMockJobData(url);
        jobDescription = mockData.description;
      } else {
        jobDescription = `This is a job posting for ${jobTitle} at ${companyName}. Unfortunately, detailed job description could not be extracted.`;
      }
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
    
    if (process.env.NODE_ENV === 'development') {
      return getMockJobData(url);
    }
    
    return {
      title: 'Job Position',
      company: 'Company',
      description: 'Failed to extract job description. Please check the original posting.'
    };
  }
}

/**
 * Generate realistic mock job data for development
 */
function getMockJobData(_url: string): JobData {
  
  return {
    title: `Software Engineer`,
    company: 'Tech Innovations',
    description: `We are looking for a talented Software Engineer to join our team at Tech Innovations.

Responsibilities:
• Developing and maintaining web applications using modern JavaScript frameworks
• Writing clean, efficient, and well-documented code
• Collaborating with cross-functional teams including designers, product managers, and other developers
• Implementing responsive design and ensuring cross-browser compatibility
• Participating in code reviews and mentoring junior developers

Requirements:
• 3+ years of experience in software development
• Proficiency in JavaScript/TypeScript, HTML, CSS
• Experience with React, Node.js, and Express
• Familiarity with RESTful APIs and GraphQL
• Knowledge of version control systems (Git)
• Strong problem-solving skills and attention to detail
• Excellent communication skills

Benefits:
• Competitive salary
• Flexible work hours
• Remote work options
• Health insurance
• Professional development opportunities
• Collaborative and innovative work environment`
  };
}