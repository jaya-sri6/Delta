import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types.js';
import { MessageItem } from './MessageItem.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import { Send, Square, ArrowUp, Sparkles } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  onStopGeneration: () => void;
  activeConversationTitle?: string;
  isDemo?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isStreaming,
  onSendMessage,
  onStopGeneration,
  activeConversationTitle,
  isDemo,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isStreaming) return;
    const msg = inputText.trim();
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    onSendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-screen bg-[#10110F] relative overflow-hidden">
      {/* Top Header Bar */}
      {activeConversationTitle && (
        <header className="h-12 border-b border-[#1C1D1A] px-6 flex items-center justify-between shrink-0 bg-[#10110F]/80 backdrop-blur z-10">
          <div className="flex items-center gap-2 overflow-hidden">
            <h2 className="text-xs font-medium text-[#F2F1EB] truncate">
              {activeConversationTitle}
            </h2>
            {isDemo && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C4F45D]/10 text-[#C4F45D] border border-[#C4F45D]/20 shrink-0">
                BENCHMARK DEMO FIXTURE
              </span>
            )}
          </div>
        </header>
      )}

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeScreen onSelectPrompt={(p) => onSendMessage(p)} />
        ) : (
          <div className="pb-36">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Composer (Floating Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-[#10110F] via-[#10110F]/95 to-transparent">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="relative rounded-2xl bg-[#161715] border border-[#2E302B] focus-within:border-[#C4F45D]/50 shadow-xl transition-all"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask what changed, verify a claim, or explore your history..."
              className="w-full bg-transparent text-[#F2F1EB] text-sm placeholder-[#92938C]/70 px-4 py-3.5 pr-14 resize-none focus:outline-none max-h-44 leading-relaxed"
            />

            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  title="Stop generating"
                  className="p-2 rounded-xl bg-[#232521] hover:bg-[#2E302B] text-[#F2F1EB] border border-[#3F423C] transition-colors"
                >
                  <Square className="w-4 h-4 fill-current text-[#C4F45D]" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  title="Send message"
                  className={`p-2 rounded-xl transition-all ${
                    inputText.trim()
                      ? 'bg-[#C4F45D] text-[#10110F] hover:bg-[#B5E84C] shadow-md shadow-[#C4F45D]/10'
                      : 'bg-[#1C1D1A] text-[#92938C]/40 cursor-not-allowed border border-[#242622]'
                  }`}
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </form>

          <div className="mt-2 text-center text-[11px] text-[#92938C]/70 flex items-center justify-center gap-2">
            <span>DELTA verifies claims against web evidence and remembers historical baselines.</span>
          </div>
        </div>
      </div>
    </main>
  );
};

