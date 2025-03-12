import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './utils/errorHandler';
import referenceRoutes from './routes/referenceRoutes';

const app = express();

app.use(helmet());
app.use(morgan('dev'));
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: 'POST,GET,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
};
app.use(cors(corsOptions));

app.use(express.json());

app.use('/api/v1', referenceRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    service: 'jobrefme-backend',
    supportedSites: ['hirejobs.in']
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

export default app;