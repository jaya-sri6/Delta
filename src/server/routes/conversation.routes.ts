import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DeltaDatabase } from '../db/database.js';
import { ConversationRepo, MessageRepo } from '../db/repositories/conversation.repo.js';
import { seedDemoData } from '../db/seed.js';
import { randomUUID } from 'crypto';

const CreateConversationSchema = z.object({
  title: z.string().optional(),
  user_id: z.string().default('demo_user_1'),
});

export async function conversationRoutes(app: FastifyInstance, opts: { db: DeltaDatabase }) {
  const convRepo = new ConversationRepo(opts.db);
  const msgRepo = new MessageRepo(opts.db);

  // List all conversations for user, optionally filtered by search
  app.get('/api/conversations', async (request, reply) => {
    const query = (request.query as any)?.q;
    const userId = (request.query as any)?.user_id || 'demo_user_1';

    if (query && typeof query === 'string' && query.trim()) {
      const results = convRepo.search(query.trim(), userId);
      return reply.send({ conversations: results });
    }

    const conversations = convRepo.listByUser(userId);
    return reply.send({ conversations });
  });

  // Create new conversation
  app.post('/api/conversations', async (request, reply) => {
    const body = CreateConversationSchema.parse(request.body || {});
    const now = new Date().toISOString();
    const newConv = convRepo.create({
      id: randomUUID(),
      user_id: body.user_id,
      title: body.title || 'New conversation',
      created_at: now,
      updated_at: now,
      is_demo: 0,
    });

    return reply.status(201).send({ conversation: newConv });
  });

  // Get conversation by ID with all its messages
  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const conv = convRepo.getById(request.params.id);
    if (!conv) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const messages = msgRepo.getByConversation(request.params.id);
    return reply.send({
      conversation: conv,
      messages,
    });
  });

  // Delete conversation
  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const conv = convRepo.getById(request.params.id);
    if (!conv) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    convRepo.delete(request.params.id);
    return reply.send({ success: true });
  });

  // Trigger demo seed data
  app.post('/api/conversations/seed', async (request, reply) => {
    const userId = (request.body as any)?.user_id || 'demo_user_1';
    const seeded = seedDemoData(opts.db, userId);
    return reply.send({
      success: true,
      message: 'Demo benchmark conversations seeded with explicit demo indicators',
      seeded,
    });
  });
}

