import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

// Check if we're using mock mode
const USE_MOCK_AI = process.env.MOCK_AI === 'true';

// Get API key safely
const apiKey = process.env.GEMINI_API_KEY || '';

// Initialize Google Generative AI with API key if available
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
    
    // Use mock message if in mock mode or no API key
    if (USE_MOCK_AI || !genAI || !apiKey) {
      logger.info('Using mock AI response');
      return generateMockReferenceMessage(jobTitle, companyName);
    }
    
    // Create the prompt using the template
    const prompt = createPrompt(jobTitle, companyName, jobDescription);
    
    // Try different model names
    let models = [
      'gemini-1.5-flash',    // Most recent
      'gemini-1.0-pro',    // Previous version
      'gemini-pro'         // Original name
    ];
    
    let lastError: Error | null = null;
    
    // Try each model until one works
    for (const modelName of models) {
      try {
        logger.info(`Trying model: ${modelName}`);
        
        // Get the Gemini model
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 800,
          },
        });
        
        // Generate content
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        logger.info(`Successfully generated reference message using ${modelName}`);
        
        return text;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Error with model ${modelName}: ${errorMessage}`);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        // If this error is not about the model not being found, break the loop
        if (!errorMessage.includes('Not Found') && !errorMessage.includes('not found')) {
          throw error;
        }
        
        // Continue trying other models
      }
    }
    
    // If we've tried all models and failed, throw the last error
    throw lastError || new Error('All model attempts failed');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error generating reference message with AI: ${errorMessage}`);
    
    // Fall back to mock data if in development
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
1. Create a professionally-worded email to ask for a reference for this specific job position.
2. The tone should be respectful, concise, and focused on making a genuine connection.
3. Mention the specific job title and company.
4. Express genuine interest in the position and highlight 1-2 key qualifications from the job description.
5. Ask for a reference in a way that makes it easy for the recipient to say yes.
6. Keep the entire message under 200 words.
7. Do not include a subject line or greeting/closing - just the body text.
8. Do not fabricate personal information - leave placeholders like [YOUR NAME] instead.

FORMAT YOUR RESPONSE AS A DIRECT REFERENCE REQUEST MESSAGE ONLY.
  `;
}

/**
 * Generates a mock reference message for development
 */
function generateMockReferenceMessage(jobTitle: string, companyName: string): string {
  return `I hope this email finds you well. I'm reaching out because I'm applying for the ${jobTitle} position at ${companyName} and believe your recommendation would greatly strengthen my application.

The role aligns perfectly with my experience in software development and problem-solving skills that you've witnessed during our time working together. I'm particularly excited about this opportunity because it would allow me to leverage my technical expertise while contributing to innovative solutions.

Would you be willing to provide a professional reference for me? If you're comfortable doing so, the hiring team may contact you via email or phone to discuss my qualifications and work style.

Please let me know if you need any additional information from me, such as an updated resume or specific projects to highlight. I appreciate your consideration and value the professional relationship we've built.

Thank you for your time and support.

[YOUR NAME]`;
}