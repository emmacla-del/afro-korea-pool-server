import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import multipart from '@fastify/multipart'; // <-- ADD THIS IMPORT
import { AppModule } from './app.module';
import { initDatabase } from './db';

async function bootstrap() {
  console.log(`${new Date().toISOString()} - Starting application bootstrap...`);
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0'; // Render requires 0.0.0.0
  const bodyLimit =
    Number(process.env.JSON_BODY_LIMIT_BYTES ?? '') || 1024 * 1024;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true, bodyLimit }),
  );

  // Security headers
  await app.register(fastifyHelmet);

  // CORS configuration
  await app.register(fastifyCors, {
    origin: (() => {
      const raw = process.env.CORS_ORIGIN?.trim();
      if (raw && raw.length > 0) {
        // Support '*' (allow all), or a comma-separated list of origins
        if (raw === '*') return true;
        return raw.split(',').map((s) => s.trim());
      }
      // Default: allow all on non-production, disable by default in production
      return process.env.NODE_ENV === 'production' ? false : true;
    })(),
    credentials: true,
  });

  // ========== ADD THIS REGISTRATION ==========
  // Register multipart plugin for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB per file
      files: 10,
    },
  });
  // ===========================================

  // Initialize database (uses Prisma via PrismaService)
  console.log(`${new Date().toISOString()} - DATABASE_URL present: ${Boolean(process.env.DATABASE_URL)}`);
  console.log(`${new Date().toISOString()} - Attempting database connection...`);
  try {
    await initDatabase();
    console.log(`${new Date().toISOString()} - Database connected successfully`);
  } catch (err: any) {
    console.error(`${new Date().toISOString()} - Database initialization error:`, err?.message ?? err);
    console.error(`${new Date().toISOString()} - Continuing startup despite DB error`);
  }

  // Listen on all interfaces for Render compatibility
  console.log(`${new Date().toISOString()} - Starting server on port ${port}...`);
  await app.listen({ port, host });
  console.log(`${new Date().toISOString()} - Server is now listening on port ${port}`);

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  console.log(`🚀 Server running at ${protocol}://0.0.0.0:${port}`);
}

void bootstrap();