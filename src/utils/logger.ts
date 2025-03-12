import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'jobrefme-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let metaStr = '';
          if (Object.keys(metadata).length > 0 && !metadata.stack) {
            metaStr = JSON.stringify(metadata);
          }
          
          let stackStr = '';
          if (metadata.stack) {
            stackStr = `\n${metadata.stack}`;
          }
          
          return `${timestamp} [${level}]: ${message} ${metaStr} ${stackStr}`;
        })
      )
    }),
    ...(process.env.NODE_ENV === 'production' 
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' })
        ] 
      : [])
  ]
});