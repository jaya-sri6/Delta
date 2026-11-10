import React, { useState } from 'react';
import { ConversationItem } from '../types.js';
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Settings,
  Sparkles,
  Database,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string, e: React.MouseEvent) => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onSeedDemo: () => void;
  isSeeding?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onSearch,
  onOpenSettings,
  onSeedDemo,
  isSeeding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    onSearch(q);
  };

  // Group conversations by date
  const groupConversations = (items: ConversationItem[]) => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const sevenDaysAgo = Date.now() - 7 * 86400000;

    const groups: { [key: string]: ConversationItem[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    items.forEach((conv) => {
      const d = new Date(conv.updated_at);
      const ds = d.toDateString();
      if (ds === today) {
        groups.Today.push(conv);
      } else if (ds === yesterday) {
        groups.Yesterday.push(conv);
      } else if (d.getTime() >= sevenDaysAgo) {
        groups['Previous 7 Days'].push(conv);
      } else {
        groups.Older.push(conv);
      }
    });

    return groups;
  };

  const grouped = groupConversations(conversations);

  return (
    <aside className="w-72 md:w-80 h-screen bg-[#141513] border-r border-[#242622] flex flex-col select-none shrink-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#242622] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C4F45D]/10 border border-[#C4F45D]/30 flex items-center justify-center text-[#C4F45D] font-mono font-bold text-lg">
            Δ
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#F2F1EB] tracking-wide text-sm">DELTA</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#C4F45D]/10 text-[#C4F45D] border border-[#C4F45D]/20">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-[#92938C] leading-tight">An AI that knows what changed.</p>
          </div>
        </div>

        <button
          onClick={onNewConversation}
          title="New Conversation"
          className="p-2 rounded-lg bg-[#1C1D1A] hover:bg-[#232521] text-[#F2F1EB] border border-[#2E302B] hover:border-[#C4F45D]/40 transition-colors"
        >
          <Plus className="w-4 h-4 text-[#C4F45D]" />
        </button>
      </div>

      {/* Search Input */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#92938C]" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search conversations & memory..."
            className="w-full bg-[#1C1D1A] border border-[#2E302B] text-xs text-[#F2F1EB] placeholder-[#92938C]/60 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-[#C4F45D]/60 transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {conversations.length === 0 ? (
          <div className="text-center py-10 px-4 text-[#92938C]">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#92938C]" />
            <p className="text-xs">No conversations found.</p>
            <button
              onClick={onSeedDemo}
              className="mt-3 text-xs text-[#C4F45D] hover:underline inline-flex items-center gap-1"
            >
              <Database className="w-3 h-3" /> Load hiring challenge scenarios
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([label, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={label} className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-medium tracking-wider text-[#92938C] uppercase">
                  {label}
                </div>
                {items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isDemo = conv.is_demo === 1;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => onSelectConversation(conv.id)}
                      className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-all ${
                        isActive
                          ? 'bg-[#1C1D1A] text-[#F2F1EB] border border-[#C4F45D]/30 shadow-sm'
                          : 'text-[#C8C7BF] hover:bg-[#1A1B18] hover:text-[#F2F1EB] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden mr-1">
                        <MessageSquare
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-[#C4F45D]' : 'text-[#92938C]'
                          }`}
                        />
                        <div className="truncate flex flex-col">
                          <span className="truncate">{conv.title}</span>
                          {isDemo && (
                            <span className="text-[10px] text-[#C4F45D]/80 font-mono mt-0.5">
                              [DEMO FIXTURE]
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={(e) => onDeleteConversation(conv.id, e)}
                        title="Delete conversation"
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-[#92938C] transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Actions Bar */}
      <div className="p-3 border-t border-[#242622] space-y-2 bg-[#121311]">
        <button
          onClick={onSeedDemo}
          disabled={isSeeding}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1C1D1A] hover:bg-[#232521] text-xs text-[#C8C7BF] hover:text-[#F2F1EB] border border-[#2E302B] transition-colors"
        >
          <span className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-[#C4F45D]" />
            <span>{isSeeding ? 'Seeding Scenarios...' : 'Load Benchmark Scenarios'}</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[#92938C]" />
        </button>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#1C1D1A] text-xs text-[#92938C] hover:text-[#F2F1EB] transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            <span>Settings & Environment</span>
          </span>
          <span className="text-[10px] font-mono text-[#92938C]">IST</span>
        </button>
      </div>
    </aside>
  );
};

