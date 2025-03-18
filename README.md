# JobRefMe Backend

A Node.js backend service that powers JobRefMe, an intelligent application that generates personalized job referral request messages based on job postings from HireJobs.in.

[![Fly Deploy](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml/badge.svg)](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml)

## 🚀 Features

- **Job Posting Extraction**: Scrapes job details from HireJobs.in using Playwright and Crawlee
- **Smart Referral Generation**: Uses Google's Gemini AI to create tailored referral request messages
- **Google OAuth Authentication**: Secure login integration for Chrome extension users
- **Secure API Key Storage**: Store your Gemini API key securely within your account
- **Performance Optimizations**: Implements caching for faster response times and reduced API costs
- **Fault Tolerance**: Gracefully handles scraping failures with fallbacks
- **Comprehensive Error Handling**: Provides clear, actionable error messages
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
{
  "success": true,
  "data": {
    "id": "user_id",
    "googleId": "google_id",
    "email": "user@example.com",
    "displayName": "User Name",
    "firstName": "User",
    "lastName": "Name",
    "profilePhoto": "https://profile-photo-url.com",
    "hasGeminiApiKey": true,
    "role": "user",
    "lastLogin": "2025-03-18T12:00:00.000Z",
    "createdAt": "2025-03-18T12:00:00.000Z"
  }
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

#### Generate Referral
```
POST /api/v1/generate-referral
```
Initiates the referral message generation process for a job posting.

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

#### Get Generated Referral
```
POST /api/v1/generate-referral/result
```
Retrieves the generated referral message.

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
Clears the cached referral message for a specific job URL.

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
  "message": "Cache cleared for job ID: abc123",
  "jobId": "abc123",
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

6. Build the TypeScript code:
   ```bash
   npm run build
   ```

7. Start the server:
   ```bash
   npm start
   ```

For development with hot reloading:
```bash
npm run dev
```

## 🔒 Chrome Extension Authentication

For Chrome Extension authentication, follow these steps:

1. Create an auth-callback.html page in your extension:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Complete</title>
  <script src="auth-callback.js"></script>
</head>
<body>
  <h1>Authentication Successful</h1>
  <p>You can close this window and return to the extension.</p>
</body>
</html>
```

2. Create auth-callback.js:
```javascript
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (token) {
    chrome.storage.local.set({ 'authToken': token }, function() {
      console.log('Token stored, authentication complete');
      setTimeout(() => window.close(), 3000);
    });
  }
});
```

3. Update your extension's manifest.json:
```json
{
  "web_accessible_resources": [{
    "resources": ["auth-callback.html"],
    "matches": ["<all_urls>"]
  }]
}
```

4. Initiate authentication:
```javascript
function startAuth() {
  const authURL = 'https://your-backend.fly.dev/api/v1/auth/google';
  const returnUrl = chrome.runtime.getURL('auth-callback.html');
  chrome.tabs.create({ 
    url: `${authURL}?returnUrl=${encodeURIComponent(returnUrl)}` 
  });
}
```

5. Make authenticated API calls:
```javascript
async function fetchWithAuth(url, options = {}) {
  const result = await chrome.storage.local.get('authToken');
  const token = result.authToken;
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
}
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