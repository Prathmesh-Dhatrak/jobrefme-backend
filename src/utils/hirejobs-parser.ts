import { logger } from './logger';

interface ParsedJobData {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  jobType?: string;
  postedDate?: string;
}

/**
 * Specialized parser for HireJobs HTML content
 * This extracts job data from the HireJobs HTML structure
 */
export function parseHireJobsHTML(html: string): ParsedJobData {
  logger.info('Parsing HireJobs HTML content');
  
  const result: ParsedJobData = {
    title: 'Job Position',
    company: 'Company on HireJobs',
    description: '',
  };
  
  try {
    const titleMatch = html.match(/<title>(.*?)\s*\|\s*HireJobs<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const titleParts = titleMatch[1].split(' at ');
      if (titleParts.length > 1) {
        result.title = titleParts[0].trim();
        result.company = titleParts[1].trim();
      } else {
        result.title = titleMatch[1].trim();
      }
    }
    
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      const ogTitle = ogTitleMatch[1].trim();
      if (ogTitle.toLowerCase() !== 'hirejobs' && !ogTitle.toLowerCase().includes('404')) {
        if (ogTitle.includes(' at ')) {
          const parts = ogTitle.split(' at ');
          if (!result.title || result.title === 'Job Position') {
            result.title = parts[0].trim();
          }
          if (!result.company || result.company === 'Company on HireJobs') {
            result.company = parts[1].trim();
          }
        } else if (!result.title || result.title === 'Job Position') {
          result.title = ogTitle;
        }
      }
    }
    
    let structuredDataMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/ig);
    if (structuredDataMatches) {
      for (const jsonLdString of structuredDataMatches) {
        try {
          const jsonContent = jsonLdString.replace(/<script\s+type="application\/ld\+json">/i, '')
                                         .replace(/<\/script>/i, '');
          const structuredData = JSON.parse(jsonContent);
          
          if (structuredData && structuredData['@type'] === 'JobPosting') {
            if (structuredData.title && (!result.title || result.title === 'Job Position')) {
              result.title = structuredData.title;
            }
            
            if (structuredData.hiringOrganization) {
              const orgName = typeof structuredData.hiringOrganization === 'string' 
                ? structuredData.hiringOrganization 
                : structuredData.hiringOrganization.name;
                
              if (orgName && (!result.company || result.company === 'Company on HireJobs')) {
                result.company = orgName;
              }
            }
            
            if (structuredData.description && !result.description) {
              result.description = typeof structuredData.description === 'string'
                ? structuredData.description
                : JSON.stringify(structuredData.description);
            }
            
            if (structuredData.jobLocation) {
              const location = typeof structuredData.jobLocation === 'string'
                ? structuredData.jobLocation
                : structuredData.jobLocation.address
                  ? (structuredData.jobLocation.address.addressLocality || 
                     structuredData.jobLocation.address.addressRegion || 
                     structuredData.jobLocation.address.addressCountry)
                  : null;
              
              if (location) result.location = location;
            }
            
            if (structuredData.baseSalary) {
              const salary = typeof structuredData.baseSalary === 'string'
                ? structuredData.baseSalary
                : structuredData.baseSalary.value
                  ? `${structuredData.baseSalary.value.value || ''} ${structuredData.baseSalary.value.unitText || ''}`
                  : null;
              
              if (salary) result.salary = salary;
            }
            
            if (structuredData.employmentType) {
              result.jobType = structuredData.employmentType;
            }
            
            if (structuredData.datePosted) {
              result.postedDate = structuredData.datePosted;
            }
          }
        } catch (jsonError) {
          logger.warn('Failed to parse JSON-LD structured data');
        }
      }
    }

    if (!result.title || result.title === 'Job Position') {
      const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi);
      if (h1Matches) {
        for (const h1Tag of h1Matches) {
          const content = cleanHtmlContent(h1Tag);
          if (content && content.length > 3 && content.length < 100 && 
              !content.toLowerCase().includes('hirejobs') && 
              !content.toLowerCase().includes('404')) {
            result.title = content;
            break;
          }
        }
      }
      
      if (result.title === 'Job Position') {
        const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi);
        if (h2Matches) {
          for (const h2Tag of h2Matches) {
            const content = cleanHtmlContent(h2Tag);
            if (content && content.length > 3 && content.length < 100 && 
                !content.toLowerCase().includes('hirejobs') && 
                !content.toLowerCase().includes('404')) {
              result.title = content;
              break;
            }
          }
        }
      }
    }
    
    if (!result.company || result.company === 'Company on HireJobs') {
      const companyMatches = [
        html.match(/<div[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<span[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
        html.match(/<h2[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/h2>/i),
        html.match(/<div[^>]*class="[^"]*employer[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<div[^>]*class="[^"]*organization[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      ];
      
      for (const match of companyMatches) {
        if (match && match[1] && match[1].trim().length > 0) {
          result.company = cleanHtmlContent(match[1]);
          if (result.company && result.company.length > 2) break;
        }
      }
    }
    
    if (!result.description) {
      const descriptionMatches = [
        html.match(/<div[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<div[^>]*class="[^"]*description-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<div[^>]*id="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<section[^>]*class="[^"]*job-details[^"]*"[^>]*>([\s\S]*?)<\/section>/i),
        html.match(/<div[^>]*class="[^"]*details[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ];
      
      let longestDescription = '';
      for (const match of descriptionMatches) {
        if (match && match[1] && match[1].trim().length > 50) {
          const cleanDesc = cleanHtmlContent(match[1]);
          if (cleanDesc.length > longestDescription.length) {
            longestDescription = cleanDesc;
          }
        }
      }
      
      if (longestDescription) {
        result.description = longestDescription;
      } else {
        const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (mainContentMatch && mainContentMatch[1]) {
          result.description = cleanHtmlContent(mainContentMatch[1]);
        }
      }
    }
    
    if (!result.location) {
      const locationMatches = [
        html.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
        html.match(/<div[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<p[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      ];
      
      for (const match of locationMatches) {
        if (match && match[1] && match[1].trim().length > 0) {
          result.location = cleanHtmlContent(match[1]);
          break;
        }
      }
    }
    
    if (!result.salary) {
      const salaryMatches = [
        html.match(/<span[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
        html.match(/<div[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<p[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      ];
      
      for (const match of salaryMatches) {
        if (match && match[1] && match[1].trim().length > 0) {
          result.salary = cleanHtmlContent(match[1]);
          break;
        }
      }
    }
    
    if (!result.jobType) {
      const typeMatches = [
        html.match(/<span[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
        html.match(/<div[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
        html.match(/<p[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/p>/i),
        html.match(/<span[^>]*class="[^"]*employment-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      ];
      
      for (const match of typeMatches) {
        if (match && match[1] && match[1].trim().length > 0) {
          result.jobType = cleanHtmlContent(match[1]);
          break;
        }
      }
    }
    
    if (result.title) {
      result.title = result.title.replace(/hirejobs/gi, '').trim();
      if (result.title === '' || result.title.toLowerCase() === 'job details') {
        result.title = 'Job Position';
      }
    }
    
    if (result.company) {
      result.company = result.company.replace(/hirejobs/gi, '').trim();
      if (result.company === '' || result.company === 'Company on') {
        result.company = 'Company on HireJobs';
      }
    }
    
    if (result.description && result.description.length < 50) {
      result.description = '';
    }
    
    logger.info(`Parsed job data: ${result.title} at ${result.company}`);
    return result;
  } catch (error) {
    logger.error('Error parsing HireJobs HTML:', error);
    return result;
  }
}

/**
 * Clean HTML content by removing tags and normalizing whitespace
 */
function cleanHtmlContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}