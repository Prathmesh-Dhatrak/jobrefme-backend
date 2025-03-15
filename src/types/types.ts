/**
 * Job data extracted from a job posting
 */
export interface JobData {
    title: string;
    company: string;
    description: string;
  }
  
  /**
   * Request payload for referral generation
   */
  export interface ReferralRequest {
    jobUrl: string;
  }
  
  /**
   * Response payload for referral generation
   */
  export interface ReferralResponse {
    success: boolean;
    referralMessage?: string;
    jobTitle?: string;
    companyName?: string;
    error?: string;
  }