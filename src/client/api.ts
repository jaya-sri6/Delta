import { ConversationItem, ChatMessage, ActivityStep, InlineCitation, ComparisonResult, ResearchActivitySummary } from './types.js';

export async function fetchConversations(query?: string): Promise<ConversationItem[]> {
  const url = query ? `/api/conversations?q=${encodeURIComponent(query)}` : '/api/conversations';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load conversations');
  const data = await res.json();
  return data.conversations;
}

export async function fetchConversation(id: string): Promise<{ conversation: ConversationItem; messages: ChatMessage[] }> {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to load conversation messages');
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function seedDemoConversations(): Promise<any> {
  const res = await fetch('/api/conversations/seed', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to seed demo data');
  return res.json();
}

export interface StreamEventHandlers {
  onMessageStarted?: (data: { message_id: string; conversation_id: string }) => void;
  onActivity?: (step: ActivityStep) => void;
  onToken?: (text: string) => void;
  onCitation?: (citation: InlineCitation) => void;
  onComparison?: (data: { comparisons: ComparisonResult[] }) => void;
  onMessageCompleted?: (data: { message_id: string; activity_log: ActivityStep[]; citations: InlineCitation[]; activity_summary: ResearchActivitySummary }) => void;
  onError?: (err: { message: string }) => void;
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  handlers: StreamEventHandlers,
  signal?: AbortSignal
): Promise<string | undefined> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_id: conversationId || undefined,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat stream failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let returnedConversationId: string | undefined = conversationId || undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const chunk of lines) {
      if (!chunk.trim()) continue;
      const eventMatch = chunk.match(/^event:\s*(\w+)/m);
      const dataMatch = chunk.match(/^data:\s*(.+)$/m);

      if (eventMatch && dataMatch) {
        const eventType = eventMatch[1];
        try {
          const payload = JSON.parse(dataMatch[1]);
          if (payload.conversation_id && !returnedConversationId) {
            returnedConversationId = payload.conversation_id;
          }

          switch (eventType) {
            case 'message_started':
              handlers.onMessageStarted?.(payload);
              break;
            case 'activity':
              handlers.onActivity?.(payload);
              break;
            case 'token':
              handlers.onToken?.(payload.text);
              break;
            case 'citation':
              handlers.onCitation?.(payload);
              break;
            case 'comparison':
              handlers.onComparison?.(payload);
              break;
            case 'message_completed':
              handlers.onMessageCompleted?.(payload);
              break;
            case 'error':
              handlers.onError?.(payload);
              break;
          }
        } catch (e) {
          console.warn('[Stream] Parse error:', e);
        }
      }
    }
  }

  return returnedConversationId;
}

