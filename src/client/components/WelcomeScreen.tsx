import React from 'react';
import { Sparkles, Calendar, CheckSquare, Search, GitCompare, ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectPrompt }) => {
  const benchmarkPrompts = [
    {
      badge: 'Benchmark Scenario A',
      title: 'CRM Shortlist & Product Releases',
      prompt: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      icon: <GitCompare className="w-4 h-4 text-[#C4F45D]" />,
    },
    {
      badge: 'Benchmark Scenario B',
      title: 'Previous Answer Claim Verification',
      prompt: 'What did I ask you on 3 November? Is your answer still correct today?',
      icon: <CheckSquare className="w-4 h-4 text-emerald-400" />,
    },
    {
      badge: 'Benchmark Scenario C',
      title: 'Postgres Hosting Pricing Changes',
      prompt: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      icon: <Search className="w-4 h-4 text-blue-400" />,
    },
    {
      badge: 'Historical Memory',
      title: 'Decision & Requirements Recall',
      prompt: 'What requirements and constraints did we agree on for our sales team workflow?',
      icon: <Calendar className="w-4 h-4 text-amber-400" />,
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 max-w-3xl mx-auto text-center select-none">
      {/* Brand Icon */}
      <div className="w-12 h-12 rounded-2xl bg-[#C4F45D]/10 border border-[#C4F45D]/30 flex items-center justify-center text-[#C4F45D] font-mono text-2xl font-bold mb-6 shadow-lg shadow-[#C4F45D]/5">
        Δ
      </div>

      {/* Main Headline */}
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F2F1EB] mb-3">
        Things change. Your context shouldn't disappear.
      </h1>

      {/* Description */}
      <p className="text-[#92938C] text-sm md:text-base max-w-lg mb-8 leading-relaxed">
        DELTA maintains structured memories of conversations, decisions, entities, and historical claims.
        When you ask whether something changed, DELTA verifies the difference.
      </p>

      {/* Benchmark Scenario Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
        {benchmarkPrompts.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(item.prompt)}
            className="group p-4 rounded-xl bg-[#141513] hover:bg-[#1A1B18] border border-[#242622] hover:border-[#C4F45D]/40 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#92938C] px-2 py-0.5 rounded bg-[#1C1D1A] border border-[#2E302B]">
                  {item.badge}
                </span>
                {item.icon}
              </div>
              <h3 className="text-xs font-semibold text-[#F2F1EB] group-hover:text-[#C4F45D] transition-colors mb-1">
                {item.title}
              </h3>
              <p className="text-[11px] text-[#92938C] line-clamp-2 leading-relaxed">
                "{item.prompt}"
              </p>
            </div>

            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-[#C4F45D] opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Run scenario</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

