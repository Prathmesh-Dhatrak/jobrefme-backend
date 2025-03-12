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
1. Create a professionally-worded message to ask for a reference for this specific job position.
2. Format this as a DIRECT MESSAGE for social media platforms like LinkedIn, NOT as an email.
3. DO NOT mention "HireJobs" or any job board website in your message.
4. The tone should be respectful, concise, and focused on making a genuine connection.
5. Mention the specific job title and company.
6. Express genuine interest in the position and highlight 1-2 key qualifications from the job description.
7. Ask for a reference in a way that makes it easy for the recipient to say yes.
8. Keep the entire message under 150 words for easy readability on mobile devices.
9. Do not include a greeting or sign-off that would be appropriate for email but not for a direct message.
10. Do not fabricate personal information - leave placeholders like [YOUR NAME] instead.
11. DO NOT include phrases like "I hope this email finds you well" or other email-specific language.

FORMAT YOUR RESPONSE AS A DIRECT REFERENCE REQUEST MESSAGE ONLY WITHOUT MENTIONING HIREJOBS OR ANY JOB BOARD.
  `;
}

/**
 * Generates a mock reference message for development
 */
function generateMockReferenceMessage(jobTitle: string, companyName: string): string {
  return `I'm reaching out about the ${jobTitle} position at ${companyName}. I believe your recommendation would greatly strengthen my application.

This role aligns with my experience in software development and problem-solving skills that you've witnessed during our time working together. I'm particularly excited about this opportunity to leverage my technical expertise while contributing to innovative solutions.

Would you be willing to provide a professional reference for me? The hiring team may contact you to discuss my qualifications and work style.

Please let me know if you need any additional information. I value our professional relationship and appreciate your consideration.

[YOUR NAME]`;
}