import { logger } from './logger';
import { load } from 'cheerio';

type CheerioAPI = ReturnType<typeof load>;

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
 * Clean HTML content by removing tags and normalizing whitespace
 * Optimized version with regex caching for better performance
 */
function cleanHtmlContent(html: string): string {
  const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  const styleRegex = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
  const tagRegex = /<[^>]*>/g;
  const whitespaceRegex = /\s+/g;
  
  return html
    .replace(scriptRegex, '')
    .replace(styleRegex, '')
    .replace(tagRegex, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(whitespaceRegex, ' ')
    .trim();
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
 * Specialized parser for HireJobs HTML content with parallel processing
 * 
 * @param html Raw HTML content from the job posting page
 * @returns Structured job data
 * @throws Error if parsing fails or insufficient data is extracted
 */
export async function parseHireJobsHTML(html: string): Promise<ParsedJobData> {
  logger.info('Parsing HireJobs HTML content');
  
  if (!html || html.trim().length === 0) {
    throw new Error('Empty HTML content provided for parsing');
  }
  
  // Check if the page is a 404 or error page
  if (html.includes('Page not found') || html.includes('Error 404') || 
      html.toLowerCase().includes('page you were looking for doesn\'t exist')) {
    throw new Error('Page not found or invalid job posting URL');
  }
  
  try {
    const $ = load(html);
    
    const [
      hiringPattern,
      metaData,
      sectionData,
      titleData,
      companyData,
      descriptionData,
      locationData,
      structuredData
    ] = await Promise.all([
      parseHiringPattern($),
      parseMetaData($),
      parseSections($),
      parseJobTitle($, html),
      parseCompanyName($, html),
      parseDescription($, html),
      parseLocationAndDetails($, html),
      parseStructuredData(html)
    ]);
    
    let title = '';
    let company = '';
    let description = '';
    
    // Build title from available sources
    if (hiringPattern.title && hiringPattern.title.length > 3) {
      title = hiringPattern.title;
    } else if (titleData.titleFromMeta && titleData.titleFromMeta.length > 3) {
      title = titleData.titleFromMeta;
    } else if (titleData.titleFromHeader && titleData.titleFromHeader.length > 3) {
      title = titleData.titleFromHeader;
    } else if (structuredData?.title && structuredData.title.length > 3) {
      title = structuredData.title;
    }
    
    // Build company from available sources
    if (hiringPattern.company && hiringPattern.company.length > 2) {
      company = hiringPattern.company;
    } else if (companyData.companyFromMeta && companyData.companyFromMeta.length > 2) {
      company = companyData.companyFromMeta;
    } else if (companyData.companyFromDOM && companyData.companyFromDOM.length > 2) {
      company = companyData.companyFromDOM;
    } else if (structuredData?.company && structuredData.company.length > 2) {
      company = structuredData.company;
    }
    
    // Build description from various sources
    let descriptionParts = [];
    
    if (metaData.experienceInfo) {
      descriptionParts.push(`Experience Required: ${metaData.experienceInfo}`);
    }
    
    if (sectionData.sections && Object.keys(sectionData.sections).length > 0) {
      for (const [section, content] of Object.entries(sectionData.sections)) {
        descriptionParts.push(`${section}:\n${content}`);
      }
    }
    
    if (sectionData.skills && sectionData.skills.length > 0) {
      descriptionParts.push(`Skills Required:\n${sectionData.skills.join('\n')}`);
    }
    
    if (descriptionParts.length > 0) {
      description = descriptionParts.join('\n\n');
    } else if (descriptionData.description && descriptionData.description.length > 50) {
      description = descriptionData.description;
    } else if (structuredData?.description && structuredData.description.length > 50) {
      description = structuredData.description;
    }
    
    // Clean up the extracted data
    if (title) {
      title = title
        .replace(/hirejobs/gi, '')
        .replace(/^RE:\s*/i, '')
        .replace(/^FWD:\s*/i, '')
        .replace(/job details/i, '')
        .replace(/\s*\|\s*.+$/i, '')
        .trim();
    }
    
    if (company) {
      company = company
        .replace(/hirejobs/gi, '')
        .replace(/^\s*at\s+/i, '')
        .replace(/company\s+on\s*$/i, '')
        .trim();
    }
    
    // Additional information
    const additionalInfo = [];
    
    if (locationData.location) {
      additionalInfo.push(`Location: ${locationData.location}`);
    }
    
    if (metaData.salary || locationData.salary) {
      additionalInfo.push(`Salary: ${metaData.salary || locationData.salary}`);
    }
    
    if (metaData.jobType || locationData.jobType) {
      additionalInfo.push(`Job Type: ${metaData.jobType || locationData.jobType}`);
    }
    
    if (structuredData?.postedDate) {
      additionalInfo.push(`Posted Date: ${structuredData.postedDate}`);
    }
    
    if (additionalInfo.length > 0 && !description.includes('Additional Information')) {
      description += '\n\nAdditional Information:\n' + additionalInfo.join('\n');
    }
    
    // Validate the extracted data
    if (!title || title.length < 3) {
      throw new Error('Could not extract valid job title');
    }
    
    if (!company || company.length < 2) {
      throw new Error('Could not extract valid company name');
    }
    
    if (!description || description.length < 100) {
      throw new Error('Could not extract sufficient job description');
    }
    
    const result: ParsedJobData = {
      title,
      company,
      description
    };
    
    // Add optional fields if available
    if (locationData.location) {
      result.location = locationData.location;
    }
    
    if (metaData.salary || locationData.salary) {
      result.salary = metaData.salary || locationData.salary;
    }
    
    if (metaData.jobType || locationData.jobType) {
      result.jobType = metaData.jobType || locationData.jobType;
    }
    
    if (structuredData?.postedDate) {
      result.postedDate = structuredData.postedDate;
    }
    
    logger.info(`Parsed job data: ${result.title} at ${result.company}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error parsing HireJobs HTML: ${errorMessage}`);
    throw new Error(`Failed to parse job details: ${errorMessage}`);
  }
}

/**
 * Parse hiring pattern from text
 */
async function parseHiringPattern($: CheerioAPI): Promise<{ company: string; title: string }> {
  const hiringText = $('h1, h2, h3, div, p')
    .filter((_: any, el: any) => $(el).text().includes('is hiring for'))
    .first()
    .text()
    .trim();
  
  if (hiringText && hiringText.includes('is hiring for')) {
    const parts = hiringText.split('is hiring for');
    if (parts.length >= 2) {
      const company = parts[0].trim();
      const title = parts[1].split('|')[0].trim();
      return { company, title };
    }
  }
  
  return { company: '', title: '' };
}

/**
 * Parse metadata like job type, salary
 */
async function parseMetaData($: CheerioAPI): Promise<{ jobType: string; salary: string; experienceInfo: string }> {
  const metaText = $('div, span, p')
    .filter((_: any, el: any) => {
      const text = $(el).text().trim();
      return text.includes('Fulltime') || 
             text.includes('Part-time') || 
             text.includes('LPA') ||
             text.includes('years');
    })
    .first()
    .text()
    .trim();
  
  let jobType = '';
  let salary = '';
  let experienceInfo = '';
  
  if (metaText) {
    const metaParts = metaText.split('•').map((part: string) => part.trim());
    
    metaParts.forEach((part: string) => {
      if (part.includes('Fulltime') || part.includes('Part-time') || part.includes('Contract')) {
        jobType = part;
      } else if (part.includes('LPA') || part.includes('salary')) {
        salary = part;
      } else if (part.includes('years')) {
        experienceInfo = part;
      }
    });
  }
  
  return { jobType, salary, experienceInfo };
}

/**
 * Parse content sections
 */
async function parseSections($: CheerioAPI): Promise<{ sections: {[key: string]: string}; skills: string[] | null }> {
  const sections = ['Responsibilities', 'Requirements', 'Qualifications', 'About the company', 'Skills'];
  let sectionContents: {[key: string]: string} = {};
  
  // Parse regular sections
  sections.forEach(section => {
    $('h2, h3, h4, strong, b').filter((_: any, el: any) => {
      return $(el).text().trim().includes(section);
    }).each((_: any, el: any) => {
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
  
  const skillsList = $('ul, ol').filter((_: any, el: any) => {
    return $(el).text().includes('Skills Required') || 
           $(el).prev().text().includes('Skills');
  }).first();
  
  let skills: string[] = [];
  if (skillsList.length) {
    skills = skillsList.find('li').map((_: any, el: any) => $(el).text().trim()).get();
  }
  
  return { sections: sectionContents, skills: skills.length > 0 ? skills : null };
}

/**
 * Parse job title from various sources
 */
async function parseJobTitle(_$: CheerioAPI, html: string): Promise<{ titleFromMeta: string; titleFromHeader: string }> {
  let titleFromMeta = '';
  let titleFromHeader = '';
  
  const titleMatch = html.match(/<title>(.*?)\s*\|\s*HireJobs<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const titleParts = titleMatch[1].split(' at ');
    if (titleParts.length > 1) {
      titleFromMeta = titleParts[0].trim();
    } else {
      titleFromMeta = titleMatch[1].trim();
    }
  }
  
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const ogTitle = ogTitleMatch[1].trim();
    if (ogTitle.toLowerCase() !== 'hirejobs' && !ogTitle.toLowerCase().includes('404')) {
      if (ogTitle.includes(' at ')) {
        const parts = ogTitle.split(' at ');
        titleFromMeta = parts[0].trim();
      } else {
        titleFromMeta = ogTitle;
      }
    }
  }
  
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi);
  if (h1Matches) {
    for (const h1Tag of h1Matches) {
      const content = cleanHtmlContent(h1Tag);
      if (content && content.length > 3 && content.length < 100 && 
          !content.toLowerCase().includes('hirejobs') && 
          !content.toLowerCase().includes('404')) {
        titleFromHeader = content;
        break;
      }
    }
  }
  
  if (!titleFromHeader) {
    const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi);
    if (h2Matches) {
      for (const h2Tag of h2Matches) {
        const content = cleanHtmlContent(h2Tag);
        if (content && content.length > 3 && content.length < 100 && 
            !content.toLowerCase().includes('hirejobs') && 
            !content.toLowerCase().includes('404')) {
          titleFromHeader = content;
          break;
        }
      }
    }
  }
  
  return { titleFromMeta, titleFromHeader };
}

/**
 * Parse company name from various sources
 */
async function parseCompanyName(_$: CheerioAPI, html: string): Promise<{ companyFromMeta: string; companyFromDOM: string }> {
  let companyFromMeta = '';
  let companyFromDOM = '';
  
  const titleMatch = html.match(/<title>(.*?)\s*\|\s*HireJobs<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const titleParts = titleMatch[1].split(' at ');
    if (titleParts.length > 1) {
      companyFromMeta = titleParts[1].trim();
    }
  }
  
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const ogTitle = ogTitleMatch[1].trim();
    if (ogTitle.includes(' at ')) {
      const parts = ogTitle.split(' at ');
      if (parts.length > 1) {
        companyFromMeta = parts[1].trim();
      }
    }
  }
  
  const companyMatches = [
    html.match(/<div[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<span[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<h2[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/h2>/i),
    html.match(/<div[^>]*class="[^"]*employer[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<div[^>]*class="[^"]*organization[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  ];
  
  for (const match of companyMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      companyFromDOM = cleanHtmlContent(match[1]);
      if (companyFromDOM && companyFromDOM.length > 2) break;
    }
  }
  
  return { companyFromMeta, companyFromDOM };
}

/**
 * Parse location, salary and job type from various sources
 */
async function parseLocationAndDetails($: CheerioAPI, html: string): Promise<{ location: string; salary: string; jobType: string }> {
  let location = '';
  let salary = '';
  let jobType = '';
  
  const locationText = $('div, span, p')
    .filter((_: any, el: any) => {
      const text = $(el).text().trim();
      return text.includes('India') || 
            text.includes('Remote') || 
            text.includes('Location');
    })
    .first()
    .text()
    .trim();
  
  if (locationText) {
    location = locationText.split('•')[0].trim();
  }
  
  if (!location) {
    const locationMatches = [
      html.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      html.match(/<div[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
      html.match(/<p[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    ];
    
    for (const match of locationMatches) {
      if (match && match[1] && match[1].trim().length > 0) {
        location = cleanHtmlContent(match[1]);
        break;
      }
    }
  }
  
  const salaryMatches = [
    html.match(/<span[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<div[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<p[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
  ];
  
  for (const match of salaryMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      salary = cleanHtmlContent(match[1]);
      break;
    }
  }
  
  const typeMatches = [
    html.match(/<span[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<div[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<p[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/p>/i),
    html.match(/<span[^>]*class="[^"]*employment-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  ];
  
  for (const match of typeMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      jobType = cleanHtmlContent(match[1]);
      break;
    }
  }
  
  return { location, salary, jobType };
}

/**
 * Parse job description from various sources
 */
async function parseDescription(_$: CheerioAPI, html: string): Promise<{ description: string }> {
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
  
  if (!longestDescription) {
    const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainContentMatch && mainContentMatch[1]) {
      longestDescription = cleanHtmlContent(mainContentMatch[1]);
    }
  }
  
  return { description: longestDescription };
}

/**
 * Parse structured data from JSON-LD scripts
 */
async function parseStructuredData(html: string): Promise<{
  title: string;
  company: string;
  description: string;
  location: string;
  salary: string;
  jobType: string;
  postedDate: string;
} | null> {
  const structuredDataMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/ig);
  if (!structuredDataMatches) {
    return null;
  }
  
  for (const jsonLdString of structuredDataMatches) {
    try {
      const jsonContent = jsonLdString.replace(/<script\s+type="application\/ld\+json">/i, '')
                                     .replace(/<\/script>/i, '');
      const structuredData = JSON.parse(jsonContent);
      
      if (structuredData && structuredData['@type'] === 'JobPosting') {

        const title = structuredData.title || '';
        
        let company = '';
        if (structuredData.hiringOrganization) {
          company = typeof structuredData.hiringOrganization === 'string' 
            ? structuredData.hiringOrganization 
            : structuredData.hiringOrganization.name || '';
        }
        
        const description = typeof structuredData.description === 'string'
          ? structuredData.description
          : JSON.stringify(structuredData.description);
        
        let location = '';
        if (structuredData.jobLocation) {
          location = typeof structuredData.jobLocation === 'string'
            ? structuredData.jobLocation
            : structuredData.jobLocation.address
              ? (structuredData.jobLocation.address.addressLocality || 
                 structuredData.jobLocation.address.addressRegion || 
                 structuredData.jobLocation.address.addressCountry)
              : '';
        }
        
        let salary = '';
        if (structuredData.baseSalary) {
          salary = typeof structuredData.baseSalary === 'string'
            ? structuredData.baseSalary
            : structuredData.baseSalary.value
              ? `${structuredData.baseSalary.value.value || ''} ${structuredData.baseSalary.value.unitText || ''}`
              : '';
        }
        
        const jobType = structuredData.employmentType || '';
        const postedDate = structuredData.datePosted || '';
        
        return {
          title,
          company,
          description,
          location,
          salary,
          jobType,
          postedDate
        };
      }
    } catch (jsonError) {
      logger.warn('Failed to parse JSON-LD structured data');
    }
  }
  
  return null;
}