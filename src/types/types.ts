/**
 * Job data extracted from a job posting
 */
export interface JobData {
    title: string;
    company: string;
    description: string;
  }
  
  /**
   * Request payload for reference generation
   */
  export interface ReferenceRequest {
    jobUrl: string;
  }
  
  /**
   * Response payload for reference generation
   */
  export interface ReferenceResponse {
    success: boolean;
    referenceMessage?: string;
    jobTitle?: string;
    companyName?: string;
    error?: string;
  }