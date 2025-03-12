# JobRefMe Backend

A Node.js backend service that powers JobRefMe, an intelligent application that generates personalized job reference request messages based on job postings from HireJobs.in.

[![Fly Deploy](https://github.com/yourusername/jobrefme-backend/actions/workflows/fly-deploy.yml/badge.svg)](https://github.com/yourusername/jobrefme-backend/actions/workflows/fly-deploy.yml)

## 🚀 Features

- **Job Posting Extraction**: Scrapes job details from HireJobs.in using Playwright and Crawlee
- **Smart Reference Generation**: Uses Google's Gemini AI to create tailored reference request messages
- **Performance Optimizations**: Implements caching for faster response times and reduced API costs
- **Fault Tolerance**: Gracefully handles scraping failures with fallbacks
- **Comprehensive Error Handling**: Provides clear, actionable error messages
- **API Documentation**: Well-defined API endpoints for easy integration

## 📋 API Endpoints

### Validate URL
```
POST /api/v1/url/validate
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
  "cached": false
}
```

### Generate Reference
```
POST /api/v1/reference
```
Initiates the reference generation process for a job posting.

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
  "estimatedTime": "5-10 seconds"
}
```

### Get Generated Reference
```
POST /api/v1/reference/result
```
Retrieves the generated reference message.

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
  "referenceMessage": "Applying for Software Engineer at Tech Innovations...",
  "jobTitle": "Software Engineer",
  "companyName": "Tech Innovations",
  "jobId": "abc123",
  "cached": true,
  "cachedAt": 1710323456789
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
- **Web Scraping**: Playwright, Crawlee
- **AI Integration**: Google Generative AI (Gemini)
- **Caching**: Node-Cache
- **Logging**: Winston
- **Security**: Helmet, CORS
- **Containerization**: Docker
- **Deployment**: Fly.io

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
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
   GEMINI_API_KEY=your_gemini_api_key_here
   MOCK_CRAWLER=false
   MOCK_AI=false
   ```

5. Build the TypeScript code:
   ```bash
   npm run build
   ```

6. Start the server:
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

- **Playwright Browser Installation**: If you encounter issues with Playwright browser installation, you can manually install them:
  ```bash
  npx playwright install --with-deps chromium
  ```

- **Memory Issues**: If you encounter memory issues during crawling, adjust the `CRAWLER_PARALLEL_JOBS` environment variable to a lower value.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📊 Project Structure

```
jobrefme-backend/
├── src/
│   ├── controllers/      # Request handlers
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
