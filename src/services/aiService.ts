import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

const USE_MOCK_AI = process.env.MOCK_AI === 'true';

const apiKey = process.env.GEMINI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    logger.info('Gemini API client initialized');
  } catch (error) {
    logger.error('Failed to initialize Gemini API client', error);
  }
} else {
  logger.warn('GEMINI_API_KEY is not set. AI generation will use mock data.');
}

/**
 * Generates a reference request message using Google Gemini API
 * 
 * @param jobTitle The job title
 * @param companyName The company name
 * @param jobDescription The job description
 * @returns Generated reference request message
 */
export async function generateReferenceMessage(
  jobTitle: string,
  companyName: string,
  jobDescription: string
): Promise<string> {
  try {
    logger.info(`Generating reference message for ${jobTitle} at ${companyName}`);
    
    if (USE_MOCK_AI || !genAI || !apiKey) {
      logger.info('Using mock AI response');
      return generateMockReferenceMessage(jobTitle, companyName);
    }
    
    const prompt = createPrompt(jobTitle, companyName, jobDescription);
    
    let models = [
      'gemini-1.5-flash',
      'gemini-1.0-pro',
      'gemini-pro'
    ];
    
    let lastError: Error | null = null;
    
    for (const modelName of models) {
      try {
        logger.info(`Trying model: ${modelName}`);
        
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 800,
          },
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        logger.info(`Successfully generated reference message using ${modelName}`);
        
        let cleanedText = text.replace(/HireJobs/g, '')
                            .replace(/hirejobs/gi, '')
                            .replace(/as advertised on\s*\./, '')
                            .replace(/as posted on\s*\./, '')
                            .replace(/I hope this email finds you well\./g, '')
                            .replace(/I hope this message finds you well\./g, '')
                            .replace(/\n\n\n+/g, '\n\n')
                            .trim();
        
        return cleanedText;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Error with model ${modelName}: ${errorMessage}`);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        if (!errorMessage.includes('Not Found') && !errorMessage.includes('not found')) {
          throw error;
        }
        
      }
    }
    throw lastError || new Error('All model attempts failed');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error generating reference message with AI: ${errorMessage}`);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('Falling back to mock reference message due to API error');
      return generateMockReferenceMessage(jobTitle, companyName);
    }
    
    throw new Error('Failed to generate reference message');
  }
}

/**
 * Creates the AI prompt from the template
 */
function createPrompt(
  jobTitle: string,
  companyName: string,
  jobDescription: string
): string {
  return `
You are tasked with creating a professional and personalized reference request message.

JOB POSTING DETAILS:
---
Company: ${companyName}
Job Title: ${jobTitle}
Job Description:
${jobDescription}
---

INSTRUCTIONS:
1. Analyze the job description and identify key skills or qualifications needed for this position.
2. Create a professionally-worded message in EXACTLY the following format:

Applying for ${jobTitle} at ${companyName}

Hey [RECIPIENT],

I'm Prathmesh Dhatrak, a fullstack developer with expertise in [REPLACE WITH 3 RELEVANT SKILLS FROM JOB DESCRIPTION], and I'm reaching out about the ${jobTitle} role at ${companyName} ([JOB POST LINK]). Given your connection to the company, I wanted to ask if you would consider helping me with a referral.

Work that I am most proud of:
- At Copods, I built a comprehensive Candidate Evaluation and HR dashboard
- InVideo (https://tinyurl.com/pd-ivsr): Engineered a user-friendly screen recording web app with React, TypeScript, and Rust-WASM, optimized with serverless AWS architecture

Beyond professional experience, I've created engaging personal projects (Cinemagram, Friend-Zone) which are all deployed and available to view.

My resume and portfolio provide further details:
Resume: https://tinyurl.com/pd-ivrs
Portfolio: prathmeshdhatrak.com

Your time and consideration would mean a lot to me. Would you be open to referring me for this position?

Thank you,
Prathmesh Dhatrak

3. IMPORTANT: The only part you should modify is the "[REPLACE WITH 3 RELEVANT SKILLS FROM JOB DESCRIPTION]" section, where you should list 3 key skills or technologies mentioned in the job description.
4. DO NOT change any other placeholders or text in the template.
5. DO NOT mention "HireJobs" or any job board website in your message.

FORMAT YOUR RESPONSE EXACTLY AS THE TEMPLATE ABOVE WITH ONLY THE SKILLS SECTION CUSTOMIZED.
  `;
}

/**
 * Generates a mock reference message for development
 */
function generateMockReferenceMessage(jobTitle: string, companyName: string): string {
  return `Applying for ${jobTitle} at ${companyName}

Hey [RECIPIENT],

I'm Prathmesh Dhatrak, a fullstack developer with expertise in JavaScript, TypeScript, and React, and I'm reaching out about the ${jobTitle} role at ${companyName} ([JOB POST LINK]). Given your connection to the company, I wanted to ask if you would consider helping me with a referral.

Work that I am most proud of:
- At Copods, I built a comprehensive Candidate Evaluation and HR dashboard
- InVideo (https://tinyurl.com/pd-ivsr): Engineered a user-friendly screen recording web app with React, TypeScript, and Rust-WASM, optimized with serverless AWS architecture

Beyond professional experience, I've created engaging personal projects (Cinemagram, Friend-Zone) which are all deployed and available to view.

My resume and portfolio provide further details:
Resume: https://tinyurl.com/pd-ivrs
Portfolio: prathmeshdhatrak.com

Your time and consideration would mean a lot to me. Would you be open to referring me for this position?

Thank you,
Prathmesh Dhatrak`;
}