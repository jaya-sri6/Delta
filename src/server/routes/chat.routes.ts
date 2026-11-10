import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentOrchestrator } from '../services/agent-orchestrator.js';
import { ConversationRepo } from '../db/repositories/conversation.repo.js';
import { DeltaDatabase } from '../db/database.js';
import { config } from '../config.js';
import { randomUUID } from 'crypto';

const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  conversation_id: z.string().optional(),
  user_id: z.string().default('demo_user_1'),
});

export async function chatRoutes(app: FastifyInstance, opts: { db: DeltaDatabase; webSearchService?: any }) {
  const orchestrator = new AgentOrchestrator(
    opts.db,
    config.openaiApiKey,
    config.openaiModel,
    config.tavilyApiKey,
    config.userTimezone,
    opts.webSearchService
  );
  const convRepo = new ConversationRepo(opts.db);

  // Synchronous Chat Endpoint
  app.post('/api/chat', async (request, reply) => {
    const body = ChatRequestSchema.parse(request.body);

    let conversationId = body.conversation_id;
    if (!conversationId) {
      const now = new Date().toISOString();
      const newConv = convRepo.create({
        id: randomUUID(),
        user_id: body.user_id,
        title: body.message.substring(0, 45) + (body.message.length > 45 ? '...' : ''),
        created_at: now,
        updated_at: now,
        is_demo: 0,
      });
      conversationId = newConv.id;
    }

    try {
      const result = await orchestrator.process({
        userId: body.user_id,
        conversationId,
        userMessage: body.message,
      });

      return reply.send({
        conversation_id: conversationId,
        message: result.message,
        activity_log: result.activity_log,
        citations: result.citations,
        comparisons: result.comparisons,
        activity_summary: result.activity_summary,
        latencies: result.latencies,
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Failed to process chat message',
        details: err.message,
      });
    }
  });

  // Streaming Chat Endpoint via Server-Sent Events (SSE)
  app.post('/api/chat/stream', async (request, reply) => {
    const body = ChatRequestSchema.parse(request.body);

    let conversationId = body.conversation_id;
    if (!conversationId) {
      const now = new Date().toISOString();
      const newConv = convRepo.create({
        id: randomUUID(),
        user_id: body.user_id,
        title: body.message.substring(0, 45) + (body.message.length > 45 ? '...' : ''),
        created_at: now,
        updated_at: now,
        is_demo: 0,
      });
      conversationId = newConv.id;
    }

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const abortController = new AbortController();

    // Listen for client disconnect on the HTTP response stream (not the incoming request stream).
    // In Node.js / Fastify, request.raw emits 'close' as soon as the POST request body is received,
    // which would cause premature abortion. The client disconnect must be tracked on reply.raw.
    const handleClientClose = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    };
    reply.raw.on('close', handleClientClose);

    try {
      await orchestrator.process({
        userId: body.user_id,
        conversationId,
        userMessage: body.message,
        signal: abortController.signal,
        onStream: (event, data) => {
          sendEvent(event, { ...data, conversation_id: conversationId });
        },
      });

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    } catch (err: any) {
      if (!reply.raw.writableEnded) {
        sendEvent('error', {
          message: err.message || 'Stream processing error',
          code: 'ORCHESTRATION_ERROR',
        });
        reply.raw.end();
      }
    } finally {
      reply.raw.removeListener('close', handleClientClose);
    }
  });
}

