import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../types.js';
import { ResearchActivityPanel } from './ResearchActivityPanel.js';
import { Copy, Check, Bot, User, Sparkles } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`py-6 px-4 md:px-8 border-b border-[#1C1D1A] ${
        isAssistant ? 'bg-[#10110F]' : 'bg-[#141513]/40'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-4">
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          {isAssistant ? (
            <div className="w-7 h-7 rounded-lg bg-[#C4F45D]/10 border border-[#C4F45D]/30 flex items-center justify-center text-[#C4F45D] font-mono text-xs font-bold shadow-sm">
              Δ
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-[#232521] border border-[#2E302B] flex items-center justify-center text-[#92938C]">
              <User className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Message Body */}
        <div className="flex-1 overflow-hidden space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#F2F1EB]">
                {isAssistant ? 'DELTA' : 'You'}
              </span>
              <span className="text-[10px] font-mono text-[#92938C]">
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {isAssistant && (
              <button
                onClick={handleCopy}
                title="Copy response"
                className="flex items-center gap-1 text-[11px] text-[#92938C] hover:text-[#F2F1EB] px-2 py-0.5 rounded hover:bg-[#1C1D1A] transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-[#C4F45D]" />
                    <span className="text-[#C4F45D]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Research Activity Panel for Assistant Messages */}
          {isAssistant && (message.activity_log || message.activity_summary) && (
            <ResearchActivityPanel
              activityLog={message.activity_log}
              activitySummary={message.activity_summary}
              citations={message.citations}
              isStreaming={message.isStreaming}
            />
          )}

          {/* Markdown Content */}
          <div className="markdown-body text-[#F2F1EB] text-sm leading-relaxed overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>

            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-[#C4F45D] animate-pulse align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

