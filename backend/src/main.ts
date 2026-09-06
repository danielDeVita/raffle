import 'dotenv/config';

// Initialize Sentry FIRST, before any other imports
import { initSentry } from './sentry';
initSentry();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService, ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

const LOCAL_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseUrlList(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

function resolveCorsOrigins(): string[] {
  const configuredOrigins = parseUrlList(process.env.CORS_ORIGIN);
  const frontendOrigins = parseUrlList(process.env.FRONTEND_URL);
  const localDevOrigins =
    process.env.NODE_ENV === 'development' ? LOCAL_DEV_CORS_ORIGINS : [];

  const origins = [
    ...configuredOrigins,
    ...frontendOrigins,
    ...localDevOrigins,
  ];

  return Array.from(
    new Set(origins.length > 0 ? origins : LOCAL_DEV_CORS_ORIGINS),
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Mercado Pago webhooks signature verification
    bufferLogs: true, // Buffer logs until Winston is ready
  });

  // Use Winston as the application logger
  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Cookie parser for OAuth httpOnly cookies
  app.use(cookieParser());

  // Security headers with Content Security Policy
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required by the current live checkout SDK
            'https://www.mercadopago.com.ar',
            'https://sdk.mercadopago.com',
            'https://http2.mlstatic.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"], // Required for styled-components/emotion
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://res.cloudinary.com',
            'https://http2.mlstatic.com',
            'https://lh3.googleusercontent.com', // Google profile pictures
          ],
          fontSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'",
            'https://www.mercadopago.com.ar',
            'https://api.mercadopago.com',
            'https://events.mercadopago.com',
            'https://api.cloudinary.com',
          ],
          frameSrc: ["'self'", 'https://www.mercadopago.com.ar'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Global validation pipe with configuration from spec
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove properties not in DTO
      forbidNonWhitelisted: true, // Throw error on extra properties
      transform: true, // Auto transform types
      transformOptions: {
        enableImplicitConversion: true, // Convert strings to numbers, etc.
      },
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'x-signature',
      'x-request-id',
    ],
    exposedHeaders: ['Set-Cookie'], // Expose Set-Cookie header to client
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Starting graceful shutdown...`);
    try {
      await app.close();
      logger.log('Application closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/graphql`);
}
void bootstrap();
