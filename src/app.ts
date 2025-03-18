import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { errorHandler } from './utils/errorHandler';
import referralRoutes from './routes/referralRoutes';
import authRoutes from './routes/authRoutes';
import apiKeyRoutes from './routes/apiKeyRoutes';
import { configurePassport } from './config/passport';

const app = express();

app.use(helmet());
app.use(morgan('dev'));
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: 'POST,GET,OPTIONS,DELETE,PUT',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Configure session for passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'jobrefme-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// API routes
app.use('/api/v1', referralRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', apiKeyRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    service: 'jobrefme-backend',
    supportedSites: ['hirejobs.in'],
    authEnabled: true
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

export default app;