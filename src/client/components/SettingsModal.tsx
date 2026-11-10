import React from 'react';
import { X, ShieldCheck, Database, Clock, Key, Server } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeedDemo: () => void;
  isSeeding?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSeedDemo,
  isSeeding,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141513] border border-[#2E302B] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#242622] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#C4F45D]/10 border border-[#C4F45D]/30 flex items-center justify-center text-[#C4F45D] font-mono text-xs font-bold">
              Δ
            </div>
            <h2 className="text-sm font-semibold text-[#F2F1EB]">DELTA System Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#92938C] hover:text-[#F2F1EB] hover:bg-[#1C1D1A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs text-[#C8C7BF]">
          {/* Timezone Configuration */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#181916] border border-[#242622]">
            <Clock className="w-4 h-4 text-[#C4F45D] mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[#F2F1EB] mb-0.5">Configured Timezone</div>
              <p className="text-[#92938C] text-[11px] leading-relaxed">
                Default: <span className="font-mono text-[#F2F1EB]">Asia/Kolkata (IST)</span>. All relative temporal references ("Monday", "today", "last week") resolve against this injected timezone.
              </p>
            </div>
          </div>

          {/* Architecture Status */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#181916] border border-[#242622]">
            <Server className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[#F2F1EB] mb-0.5">Modular Monolith</div>
              <p className="text-[#92938C] text-[11px] leading-relaxed">
                SQLite with native FTS5 full-text indexing, deterministic temporal resolution, and claim-level knowledge storage.
              </p>
            </div>
          </div>

          {/* Seed Scenarios Action */}
          <div className="p-3.5 rounded-xl bg-[#181916] border border-[#2E302B] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F2F1EB] flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#C4F45D]" /> Hiring Challenge Data
              </span>
              <span className="text-[10px] font-mono text-[#92938C]">Acceptance Fixtures</span>
            </div>
            <p className="text-[#92938C] text-[11px] leading-relaxed">
              Resets and seeds the three test scenarios (Scenario A: CRM Shortlist, Scenario B: 3 Nov PITR Answer, Scenario C: Postgres Hosting Pricing).
            </p>
            <button
              onClick={onSeedDemo}
              disabled={isSeeding}
              className="w-full mt-2 py-2 px-3 rounded-lg bg-[#C4F45D] hover:bg-[#B5E84C] text-[#10110F] font-semibold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isSeeding ? 'Seeding Benchmarks...' : 'Reset & Seed Benchmark Scenarios'}</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#242622] bg-[#10110F] flex items-center justify-between text-[11px] text-[#92938C]">
          <span>Minimi Software Engineering Intern Challenge</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-[#1C1D1A] hover:bg-[#232521] text-[#F2F1EB] border border-[#2E302B]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

