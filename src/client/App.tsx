import React, { useState, useEffect, useRef } from 'react';
import { ConversationItem, ChatMessage, ActivityStep, InlineCitation, ComparisonResult, ResearchActivitySummary } from './types.js';
import { fetchConversations, fetchConversation, deleteConversation, seedDemoConversations, streamChat } from './api.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatArea } from './components/ChatArea.js';
import { SettingsModal } from './components/SettingsModal.js';

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConversations = async (searchQuery?: string) => {
    try {
      const list = await fetchConversations(searchQuery);
      setConversations(list);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const handleSelectConversation = async (id: string) => {
    if (isStreaming) {
      handleStopGeneration();
    }
    setActiveConversationId(id);
    try {
      const data = await fetchConversation(id);
      setMessages(data.messages);
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const handleNewConversation = () => {
    if (isStreaming) {
      handleStopGeneration();
    }
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      if (activeConversationId === id) {
        handleNewConversation();
      }
      await loadConversations();
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      const result = await seedDemoConversations();
      await loadConversations();
      if (result.seeded?.conversationAId) {
        handleSelectConversation(result.seeded.conversationAId);
      }
    } catch (err) {
      console.error('Error seeding demo data:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessageId = `temp-user-${Date.now()}`;
    const assistantMessageId = `temp-assistant-${Date.now()}`;
    const now = new Date().toISOString();

    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      created_at: now,
    };

    const initialAssistantMsg: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      created_at: now,
      activity_log: [],
      citations: [],
      comparisons: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const activitySteps: ActivityStep[] = [];
    const citations: InlineCitation[] = [];
    let comparisons: ComparisonResult[] = [];
    let currentContent = '';

    try {
      const convId = await streamChat(
        text,
        activeConversationId,
        {
          onMessageStarted: (data) => {
            if (!activeConversationId && data.conversation_id) {
              setActiveConversationId(data.conversation_id);
            }
          },
          onActivity: (act) => {
            activitySteps.push(act);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, activity_log: [...activitySteps] }
                  : m
              )
            );
          },
          onToken: (tok) => {
            currentContent += tok;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: currentContent }
                  : m
              )
            );
          },
          onCitation: (cit) => {
            if (!citations.some((c) => c.url === cit.url)) {
              citations.push(cit);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, citations: [...citations] }
                    : m
                )
              );
            }
          },
          onComparison: (data) => {
            comparisons = data.comparisons;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, comparisons }
                  : m
              )
            );
          },
          onMessageCompleted: (data) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      id: data.message_id,
                      isStreaming: false,
                      activity_log: data.activity_log,
                      citations: data.citations,
                      activity_summary: data.activity_summary,
                    }
                  : m
              )
            );
            loadConversations();
          },
          onError: (err) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: currentContent + `\n\n*(Error: ${err.message})*`,
                      isStreaming: false,
                    }
                  : m
              )
            );
          },
        },
        abortController.signal
      );

      if (convId && !activeConversationId) {
        setActiveConversationId(convId);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Chat error:', err);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      loadConversations();
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="flex h-screen bg-[#10110F] text-[#F2F1EB] overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onSearch={(q) => loadConversations(q)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSeedDemo={handleSeedDemo}
        isSeeding={isSeeding}
      />

      <ChatArea
        messages={messages}
        isStreaming={isStreaming}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        activeConversationTitle={activeConv?.title}
        isDemo={activeConv?.is_demo === 1}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSeedDemo={handleSeedDemo}
        isSeeding={isSeeding}
      />
    </div>
  );
};

