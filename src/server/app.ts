import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { DeltaDatabase, getDatabase } from './db/database.js';
import { healthRoutes } from './routes/health.routes.js';
import { conversationRoutes } from './routes/conversation.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { WebSearchService } from './services/web-search.js';
import { config } from './config.js';

export async function buildApp(db?: DeltaDatabase, webSearchService?: any): Promise<FastifyInstance> {
  const database = db || getDatabase(config.databasePath);
  const searchService = webSearchService || new WebSearchService({ apiKey: config.tavilyApiKey });

  const app = fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    requestTimeout: 30000,
  });

  // Register CORS
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Register API Routes
  await app.register(healthRoutes, { db: database, webSearchService: searchService });
  await app.register(conversationRoutes, { db: database });
  await app.register(chatRoutes, { db: database, webSearchService: searchService });

  // Serve static assets if client build exists (in production)
  const clientDist = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'API route not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

