import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { initDatabase } from './db';
import { initSentry } from './sentry.config';

async function bootstrap() {
  initSentry();

  console.log(`${new Date().toISOString()} - Starting application bootstrap...`);
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const bodyLimit = Number(process.env.JSON_BODY_LIMIT_BYTES ?? '') || 1024 * 1024;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true, bodyLimit }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  await app.register(fastifyHelmet);

  await app.register(fastifyCors, {
    origin: (() => {
      const raw = process.env.CORS_ORIGIN?.trim();
      if (raw && raw.length > 0) {
        if (raw === '*') return true;
        return raw.split(',').map((s) => s.trim());
      }
      return process.env.NODE_ENV === 'production' ? false : true;
    })(),
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 10,
    },
  });

  console.log(`${new Date().toISOString()} - DATABASE_URL present: ${Boolean(process.env.DATABASE_URL)}`);
  try {
    await initDatabase();
    console.log(`${new Date().toISOString()} - Database connected successfully`);
  } catch (err: any) {
    console.error(`${new Date().toISOString()} - Database initialization error:`, err?.message ?? err);
    console.error(`${new Date().toISOString()} - Continuing startup despite DB error`);
  }

  await app.listen({ port, host });
  console.log(`${new Date().toISOString()} - Server listening on port ${port}`);

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  console.log(`🚀 Server running at ${protocol}://0.0.0.0:${port}`);
}

void bootstrap();