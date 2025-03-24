# JobRefMe Backend

A Node.js backend service that powers JobRefMe, an intelligent application that generates personalized job referral request messages based on job postings from HireJobs.in or raw job content.

[![Fly Deploy](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml/badge.svg)](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml)

## 🚀 Features

- **Job Posting Extraction**: Scrapes job details from HireJobs.in using Playwright and Crawlee
- **Raw Job Content Processing**: Process job content directly without requiring a URL
- **Smart Referral Generation**: Uses Google's Gemini AI to create tailored referral request messages
- **Google OAuth Authentication**: Secure login integration for Chrome extension users
- **Secure API Key Storage**: Store your Gemini API key securely within your account
- **Performance Optimizations**: Implements caching for faster response times and reduced API costs
- **Fault Tolerance**: Gracefully handles scraping failures with fallbacks
- **Comprehensive Error Handling**: Provides clear, actionable error messages
- **Template Management**: Customize and store referral message templates
- **API Documentation**: Well-defined API endpoints for easy integration

## 📋 API Endpoints

### Authentication Endpoints

#### Google OAuth Authentication
```
GET /api/v1/auth/google
```
Initiates the Google OAuth authentication flow.

#### Google OAuth Callback
```
GET /api/v1/auth/google/callback
```
Callback endpoint for Google OAuth authentication.

#### Get User Profile
```
GET /api/v1/auth/profile
```
Retrieves the authenticated user's profile information.

**Response:**
```json
"data": {
  "id": "user_id",
  "googleId": "google_id",
  "email": "user@example.com",
  "displayName": "User Name",
  "firstName": "User",
  "lastName": "Name",
  "profilePhoto": "https://profile-photo-url.com",
  "hasGeminiApiKey": true,
  "lastLogin": "2025-03-18T12:00:00.000Z",
  "createdAt": "2025-03-18T12:00:00.000Z"
}
```

### API Key Management

#### Set Gemini API Key
```
POST /api/v1/user/gemini-key
```
Sets the Gemini API key for the authenticated user.

**Request:**
```json
{
  "apiKey": "your-gemini-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Gemini API key saved successfully"
}
```

#### Verify Gemini API Key
```
GET /api/v1/user/gemini-key/verify
```
Verifies if the user's stored Gemini API key is valid.

**Response:**
```json
{
  "success": true,
  "hasKey": true,
  "valid": true,
  "message": "Gemini API key is valid"
}
```

#### Delete Gemini API Key
```
DELETE /api/v1/user/gemini-key
```
Deletes the user's Gemini API key.

**Response:**
```json
{
  "success": true,
  "message": "Gemini API key deleted successfully"
}
```

### Template Management

#### Get All Templates
```
GET /api/v1/user/templates
```
Retrieves all templates available to the user (personal templates and system defaults).

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "template_id_1",
      "name": "My Custom Template",
      "content": "Applying for {jobTitle} at {companyName}...",
      "isDefault": true,
      "userId": "user_id",
      "createdAt": "2025-03-18T12:00:00.000Z",
      "updatedAt": "2025-03-18T12:00:00.000Z"
    },
    {
      "_id": "template_id_2",
      "name": "System Default Template",
      "content": "Applying for {jobTitle} at {companyName}...",
      "isDefault": true,
      "createdAt": "2025-03-18T12:00:00.000Z",
      "updatedAt": "2025-03-18T12:00:00.000Z"
    }
  ]
}
```

#### Create New Template
```
POST /api/v1/user/templates
```
Creates a new template for the authenticated user.

**Request:**
```json
{
  "name": "My Custom Template",
  "content": "Applying for {jobTitle} at {companyName}...",
  "isDefault": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "template_id",
    "name": "My Custom Template",
    "content": "Applying for {jobTitle} at {companyName}...",
    "isDefault": true,
    "userId": "user_id",
    "createdAt": "2025-03-18T12:00:00.000Z",
    "updatedAt": "2025-03-18T12:00:00.000Z"
  }
}
```

#### Get Default Template
```
GET /api/v1/user/templates/default
```
Retrieves the user's default template or the system default if none is set.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "template_id",
    "name": "My Default Template",
    "content": "Applying for {jobTitle} at {companyName}...",
    "isDefault": true,
    "userId": "user_id",
    "createdAt": "2025-03-18T12:00:00.000Z",
    "updatedAt": "2025-03-18T12:00:00.000Z"
  }
}
```

#### Get Template by ID
```
GET /api/v1/user/templates/:id
```
Retrieves a specific template by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "template_id",
    "name": "My Custom Template",
    "content": "Applying for {jobTitle} at {companyName}...",
    "isDefault": false,
    "userId": "user_id",
    "createdAt": "2025-03-18T12:00:00.000Z",
    "updatedAt": "2025-03-18T12:00:00.000Z"
  }
}
```

#### Update Template
```
PUT /api/v1/user/templates/:id
```
Updates a specific template.

**Request:**
```json
{
  "name": "Updated Template Name",
  "content": "Updated template content for {jobTitle} at {companyName}...",
  "isDefault": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "template_id",
    "name": "Updated Template Name",
    "content": "Updated template content for {jobTitle} at {companyName}...",
    "isDefault": true,
    "userId": "user_id",
    "createdAt": "2025-03-18T12:00:00.000Z",
    "updatedAt": "2025-03-18T12:00:00.000Z"
  }
}
```

#### Delete Template
```
DELETE /api/v1/user/templates/:id
```
Deletes a template.

**Response:**
```json
{
  "success": true,
  "data": {}
}
```

### Referral Generation Endpoints

#### Validate Job URL
```
POST /api/v1/validate-job-url
```
Quickly checks if a job URL is valid and accessible.

**Request:**
```json
{
  "jobUrl": "https://hirejobs.in/jobs/abc123"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "message": "URL is valid and accessible",
  "cached": false,
  "authenticated": true
}
```

#### Generate Referral from URL
```
POST /api/v1/generate-referral
```
Initiates the referral message generation process for a job posting URL.

**Request:**
```json
{
  "jobUrl": "https://hirejobs.in/jobs/abc123"
}
```

**Response:**
```json
{
  "success": true,
  "status": "processing",
  "message": "Your request is being processed. Please wait a moment.",
  "jobId": "abc123",
  "estimatedTime": "5-10 seconds",
  "authenticated": true
}
```

#### Generate Referral from Content
```
POST /api/v1/generate-referral/content
```
Processes raw job posting content and generates a referral message immediately in a single request.

**Request:**
```json
{
  "jobContent": "Jisr is hiring for Frontend Engineer | India\nFulltime\n•\n25-35 LPA\n•\n1-3 years\nOverview\n\nApplication\n\nAbout the company\n\nAt Jisr, you'll enjoy a welcoming and casual environment, company retreats, and the ability to interact with and learn from a growing Startup. We work hard and care about our most prized asset - our people..."
}
```

**Response:**
```json
{
  "success": true,
  "referralMessage": "Applying for Frontend Engineer at Jisr...",
  "jobTitle": "Frontend Engineer",
  "companyName": "Jisr",
  "jobId": "content_12345678",
  "processingTime": 1250,
  "cached": false,
  "authenticated": true
}
```

If the same content has been processed before, it will return a cached result:

**Cached Response:**
```json
{
  "success": true,
  "referralMessage": "Applying for Frontend Engineer at Jisr...",
  "jobTitle": "Frontend Engineer",
  "companyName": "Jisr",
  "jobId": "content_12345678",
  "cached": true,
  "cachedAt": 1710323456789,
  "authenticated": true
}
```

#### Get Generated Referral
```
POST /api/v1/generate-referral/result
```
Retrieves the generated referral message for URL-based requests.

**Request:**
```json
{
  "jobUrl": "https://hirejobs.in/jobs/abc123"
}
```

**Response:**
```json
{
  "success": true,
  "referralMessage": "Applying for Software Engineer at Tech Innovations...",
  "jobTitle": "Software Engineer",
  "companyName": "Tech Innovations",
  "jobId": "abc123",
  "cached": true,
  "cachedAt": 1710323456789,
  "authenticated": true
}
```

#### Clear Referral Cache
```
POST /api/v1/clear-cache
```
Clears the cached referral message for a specific job URL, content, or all cached entries.

**Request (for URL-based job):**
```json
{
  "jobUrl": "https://hirejobs.in/jobs/abc123"
}
```

**Request (for content-based job):**
```json
{
  "jobId": "content_12345678"
}
```

**Request (to clear all cache):**
```json
{
  "jobUrl": "all"
}
```

**Response (for URL-based job):**
```json
{
  "success": true,
  "message": "Cache cleared for job ID: abc123",
  "jobId": "abc123",
  "authenticated": true
}
```

**Response (for content-based job):**
```json
{
  "success": true,
  "message": "Cache cleared for content ID: content_12345678",
  "jobId": "content_12345678",
  "cacheType": "content",
  "authenticated": true
}
```

**Response (for all cache):**
```json
{
  "success": true,
  "message": "All cache entries cleared (42 entries)",
  "authenticated": true
}
```

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "service": "jobrefme-backend",
  "supportedSites": ["hirejobs.in"],
  "authEnabled": true
}
```

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB Atlas
- **Authentication**: Passport.js with Google OAuth 2.0
- **Web Scraping**: Playwright, Crawlee
- **AI Integration**: Google Generative AI (Gemini)
- **Caching**: Node-Cache
- **Logging**: Winston
- **Security**: Helmet, CORS, JWT
- **Containerization**: Docker
- **Deployment**: Fly.io

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- MongoDB Atlas account
- Google Cloud Platform account (for OAuth credentials)
- Google Gemini API key (for AI-generated responses)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Prathmesh-Dhatrak/jobrefme-backend.git
   cd jobrefme-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.sample .env
   ```
   
4. Edit the `.env` file with your configuration:
   ```
   PORT=3000
   NODE_ENV=development
   GEMINI_API_KEY=your_gemini_api_key_here
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/jobrefme-db
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
   JWT_SECRET=your_jwt_secret_key_at_least_32_chars_long
   SESSION_SECRET=your_session_secret_key_at_least_32_chars_long
   ENCRYPTION_KEY=your_encryption_key_for_api_keys_at_least_32_chars
   EXTENSION_URL=chrome-extension://your_extension_id/auth-callback.html
   ```

5. Set up Google OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Navigate to "APIs & Services" > "Credentials"
   - Create OAuth client ID (Web application type)
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/v1/auth/google/callback` (for development)
     - `https://your-domain.fly.dev/api/v1/auth/google/callback` (for production)
   - Copy the Client ID and Client Secret to your `.env` file

6. Initialize the default template:
   ```bash
   npm run create-default-template
   ```

7. Build the TypeScript code:
   ```bash
   npm run build
   ```

8. Start the server:
   ```bash
   npm start
   ```

For development with hot reloading:
```bash
npm run dev
```
## 🚢 Deployment

The application is configured for deployment on Fly.io:

```bash
flyctl deploy
```

GitHub Actions is set up to automatically deploy on pushes to the main branch.

## 🔍 Troubleshooting

### Common Issues

- **MongoDB Connection**: Ensure your MongoDB connection string is correct and the IP address of your development machine is whitelisted in MongoDB Atlas.

- **Playwright Browser Installation**: If you encounter issues with Playwright browser installation, you can manually install them:
  ```bash
  npx playwright install --with-deps chromium
  ```

- **Google OAuth**: Make sure your redirect URIs are correctly configured in Google Cloud Console and match exactly with your callback URL.

- **JWT Errors**: Ensure your JWT_SECRET is set and is at least 32 characters long.

- **Chrome Extension Authentication**: Check that your extension ID is correct in the returnUrl and that your extension's manifest.json properly declares web_accessible_resources.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📊 Project Structure

```
jobrefme-backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.ts   # MongoDB connection
│   │   └── passport.ts   # Passport.js config
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Custom middleware
│   ├── models/           # MongoDB models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Helper functions
│   ├── types/            # TypeScript type definitions
│   ├── app.ts            # Express application setup
│   └── server.ts         # Server entry point
├── dist/                 # Compiled JavaScript (generated)
├── logs/                 # Application logs
├── Dockerfile            # Docker configuration
├── fly.toml              # Fly.io configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies and scripts
└── README.md             # Documentation
```