import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { initDatabase } from './db';

async function bootstrap() {
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
    origin:
      process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim().length > 0
        ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
        : process.env.NODE_ENV === 'production'
          ? false
          : true,
    credentials: true,
  });

  // Initialize database (uses Prisma via PrismaService)
  await initDatabase();

  // Listen on all interfaces for Render compatibility
  await app.listen({ port, host });

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  console.log(`🚀 Server running at ${protocol}://0.0.0.0:${port}`);

}

void bootstrap();