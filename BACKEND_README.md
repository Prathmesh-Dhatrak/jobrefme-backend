# JobRefMe Backend

A Node.js backend service that powers JobRefMe, an intelligent application that generates personalized job referral request messages based on job postings from HireJobs.in.

[![Fly Deploy](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml/badge.svg)](https://github.com/Prathmesh-Dhatrak/jobrefme-backend/actions/workflows/fly-deploy.yml)

## 🚀 Features

- **Job Posting Extraction**: Scrapes job details from HireJobs.in using Playwright and Crawlee
- **Smart Referral Generation**: Uses Google's Gemini AI to create tailored referral request messages
- **User Authentication**: Google OAuth integration for secure user authentication
- **API Key Management**: Securely store and retrieve API keys with AES-256 encryption
- **Performance Optimizations**: Implements caching for faster response times and reduced API costs
- **Fault Tolerance**: Gracefully handles scraping failures with fallbacks
- **Comprehensive Error Handling**: Provides clear, actionable error messages
- **API Documentation**: Well-defined API endpoints for easy integration

## 📋 API Endpoints

### Authentication

#### Google OAuth Login
```
GET /api/v1/auth/google
```
Initiates Google OAuth authentication flow.

#### Google OAuth Callback
```
GET /api/v1/auth/google/callback
```
Callback URL for Google OAuth. Redirects to the frontend with a JWT token.

#### Get Current User
```
GET /api/v1/auth/me
```
Retrieves the authenticated user's profile.

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "6432ab1c2d3e4f567890abcd",
    "email": "user@example.com",
    "displayName": "John Doe",
    "profilePicture": "https://...",
    "hasApiKey": true
  }
}
```

### API Key Management

#### Store API Key
```
POST /api/v1/auth/api-key
```
Stores a Gemini API key for the authenticated user.

**Request:**
```json
{
  "geminiApiKey": "your-gemini-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key stored successfully"
}
```

#### Check API Key
```
GET /api/v1/auth/api-key
```
Checks if the authenticated user has a stored API key.

**Response:**
```json
{
  "success": true,
  "hasApiKey": true
}
```

#### Delete API Key
```
DELETE /api/v1/auth/api-key
```
Deletes the authenticated user's stored API key.

**Response:**
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

### Job Referral Generation

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
  "isAuthenticated": true,
  "usingStoredApiKey": true
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
  "isAuthenticated": true,
  "usingStoredApiKey": true
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
  "isAuthenticated": true,
  "usingStoredApiKey": true
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
  "supportedSites": ["hirejobs.in"]
}
```

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Authentication**: Passport.js with Google OAuth 2.0
- **Database**: MongoDB Atlas
- **Web Scraping**: Playwright, Crawlee
- **AI Integration**: Google Generative AI (Gemini)
- **Caching**: Node-Cache
- **Logging**: Winston
- **Security**: Helmet, CORS, JWT, AES-256 Encryption
- **Containerization**: Docker
- **Deployment**: Fly.io

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- MongoDB Atlas account
- Google OAuth credentials
- Google Gemini API key (for AI-generated responses)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/jobrefme-backend.git
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
   FRONTEND_URL=http://localhost:5173
   
   # Database
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>
   
   # Authentication
   JWT_SECRET=your_jwt_secret_key_here
   SESSION_SECRET=your_session_secret_key_here
   
   # Google OAuth
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   
   # API Keys
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Encryption keys
   ENCRYPTION_KEY=generate_a_secure_32_byte_encryption_key
   ENCRYPTION_IV=16_byte_iv_value
   
   # Other settings
   MOCK_CRAWLER=false
   MOCK_AI=false
   ```

5. Set up Google OAuth:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Configure the OAuth consent screen
   - Create OAuth client ID credentials
   - Add authorized redirect URIs (e.g., `http://localhost:3000/api/v1/auth/google/callback` for development)

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

## 🚢 Deployment

The application is configured for deployment on Fly.io:

```bash
flyctl deploy
```

For production deployment, make sure to set the following secrets:
```bash
fly secrets set MONGODB_URI=mongodb+srv://...
fly secrets set GOOGLE_CLIENT_ID=...
fly secrets set GOOGLE_CLIENT_SECRET=...
fly secrets set JWT_SECRET=...
fly secrets set SESSION_SECRET=...
fly secrets set GEMINI_API_KEY=...
fly secrets set ENCRYPTION_KEY=...
fly secrets set ENCRYPTION_IV=...
```

GitHub Actions is set up to automatically deploy on pushes to the main branch.

## 🔍 Troubleshooting

### Common Issues

- **Playwright Browser Installation**: If you encounter issues with Playwright browser installation, you can manually install them:
  ```bash
  npx playwright install --with-deps chromium
  ```

- **Memory Issues**: If you encounter memory issues during crawling, adjust the `CRAWLER_PARALLEL_JOBS` environment variable to a lower value.

- **MongoDB Connection Issues**: Ensure your MongoDB connection string is correct and that your IP address is whitelisted in MongoDB Atlas.

- **Authentication Issues**: Verify that your Google OAuth credentials are correctly set up and that the redirect URIs match your application's domain.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📊 Project Structure

```
jobrefme-backend/
├── src/
│   ├── config/           # Application configuration
│   │   ├── database.ts   # MongoDB connection
│   │   └── passport.ts   # Authentication strategies
│   ├── controllers/      # Request handlers
│   ├── models/           # Database models
│   ├── middleware/       # Express middleware
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