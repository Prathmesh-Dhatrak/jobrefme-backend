import { logger } from './logger';
import { load } from 'cheerio';

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
 * Clean text content by removing extra whitespace and unwanted text
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Specialized parser for HireJobs HTML content
 * 
 * @param html Raw HTML content from the job posting page
 * @returns Structured job data
 */
export function parseHireJobsHTML(html: string): ParsedJobData {
  logger.info('Parsing HireJobs HTML content');
  
  const result: ParsedJobData = {
    title: 'Job Position',
    company: 'Company',
    description: '',
  };
  
  try {
    const $ = load(html);
    const hiringText = $('h1, h2, h3, div, p')
      .filter((_, el) => $(el).text().includes('is hiring for'))
      .first()
      .text()
      .trim();
    
    if (hiringText && hiringText.includes('is hiring for')) {
      const parts = hiringText.split('is hiring for');
      if (parts.length >= 2) {
        result.company = parts[0].trim();
        const titlePart = parts[1].split('|')[0].trim();
        result.title = titlePart;
        logger.info(`Parsed from hiring pattern: Company: ${result.company}, Title: ${result.title}`);
      }
    }
    
    const metaText = $('div, span, p')
      .filter((_, el) => {
        const text = $(el).text().trim();
        return text.includes('Fulltime') || 
               text.includes('Part-time') || 
               text.includes('LPA') ||
               text.includes('years');
      })
      .first()
      .text()
      .trim();
    
    if (metaText) {
      const metaParts = metaText.split('•').map(part => part.trim());
      
      metaParts.forEach(part => {
        if (part.includes('Fulltime') || part.includes('Part-time') || part.includes('Contract')) {
          result.jobType = part;
        } else if (part.includes('LPA') || part.includes('salary')) {
          result.salary = part;
        } else if (part.includes('years')) {
          // This is likely experience requirement
          if (!result.description.includes('Experience')) {
            result.description += `Experience Required: ${part}\n\n`;
          }
        }
      });
      
      logger.info(`Parsed metadata: JobType: ${result.jobType}, Salary: ${result.salary}`);
    }

    const locationText = $('div, span, p')
      .filter((_, el) => {
        const text = $(el).text().trim();
        return text.includes('India') || 
              text.includes('Remote') || 
              text.includes('Location');
      })
      .first()
      .text()
      .trim();
    
    if (locationText) {
      result.location = locationText.split('•')[0].trim();
      logger.info(`Parsed location: ${result.location}`);
    }
    
    const sections = ['Responsibilities', 'Requirements', 'Qualifications', 'About the company', 'Skills'];
    let sectionContents: {[key: string]: string} = {};
    
    sections.forEach(section => {
      $('h2, h3, h4, strong, b').filter((_, el) => {
        return $(el).text().trim().includes(section);
      }).each((_, el) => {
        let sectionContent = '';
        let nextEl = $(el).next();

        while (nextEl.length && 
               !sections.some(s => nextEl.text().includes(s)) &&
               !nextEl.is('h2') && 
               !nextEl.is('h3') && 
               !nextEl.is('h4')) {
          
          const text = nextEl.text().trim();
          if (text) {
            sectionContent += text + '\n';
          }
          nextEl = nextEl.next();
        }
        
        if (sectionContent.trim()) {
          sectionContents[section] = sectionContent.trim();
        }
      });
    });
    
    if (Object.keys(sectionContents).length > 0) {
      let descriptionParts = [];
      for (const [section, content] of Object.entries(sectionContents)) {
        descriptionParts.push(`${section}:\n${content}`);
      }
      
      result.description = descriptionParts.join('\n\n');
      logger.info(`Built description from ${Object.keys(sectionContents).length} sections`);
    }
    
    const skillsList = $('ul, ol').filter((_, el) => {
      return $(el).text().includes('Skills Required') || 
             $(el).prev().text().includes('Skills');
    }).first();
    
    if (skillsList.length) {
      const skills = skillsList.find('li').map((_, el) => $(el).text().trim()).get();
      if (skills.length > 0) {
        if (!result.description.includes('Skills')) {
          result.description += '\n\nSkills Required:\n' + skills.join('\n');
        }
      }
    }
    
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