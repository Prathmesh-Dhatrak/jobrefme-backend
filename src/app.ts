import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import MongoStore from 'connect-mongo';
import { errorHandler } from './utils/errorHandler';
import { configurePassport } from './config/passport';
import referralRoutes from './routes/referralRoutes';
import authRoutes from './routes/authRoutes';
import { optionalAuthentication } from './middleware/authMiddleware';

// Initialize express app
const app = express();

// Configure security headers
app.use(helmet());

// Configure logging
app.use(morgan('dev'));

// Configure CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: 'POST,GET,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true
};
app.use(cors(corsOptions));

// Parse cookies
app.use(cookieParser());

// Parse JSON requests
app.use(express.json());

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());
configurePassport();

// Apply optional authentication to all routes
app.use(optionalAuthentication);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', referralRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    service: 'jobrefme-backend',
    supportedSites: ['hirejobs.in']
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

export default app;