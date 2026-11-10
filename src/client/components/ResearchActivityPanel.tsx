import React, { useState } from 'react';
import { ActivityStep, ResearchActivitySummary, InlineCitation } from '../types.js';
import {
  Activity,
  History,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  Tag,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface ResearchActivityPanelProps {
  activityLog?: ActivityStep[];
  activitySummary?: ResearchActivitySummary;
  citations?: InlineCitation[];
  isStreaming?: boolean;
}

export const ResearchActivityPanel: React.FC<ResearchActivityPanelProps> = ({
  activityLog = [],
  activitySummary,
  citations = [],
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (activityLog.length === 0 && !activitySummary) return null;

  const lastStep = activityLog[activityLog.length - 1];

  const plannedCount = activitySummary?.planned_queries_count ?? activitySummary?.search_queries_performed.length ?? 0;
  const executedCount = activitySummary?.executed_queries_count ?? activitySummary?.queries?.length ?? activitySummary?.search_queries_performed.length ?? 0;
  const successfulCount = activitySummary?.successful_queries_count ?? activitySummary?.queries?.filter(q => q.status === 'SUCCESS').length ?? 0;
  const failedCount = activitySummary?.failed_queries_count ?? activitySummary?.queries?.filter(q => q.status === 'FAILED' || q.status === 'NO_API_KEY').length ?? 0;

  return (
    <div className="mb-4 rounded-xl border border-[#242622] bg-[#141513] overflow-hidden text-xs transition-all">
      {/* Collapsed Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-[#181916] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#C4F45D] font-mono font-medium">
            <Activity className={`w-3.5 h-3.5 ${isStreaming ? 'animate-pulse' : ''}`} />
            <span>Research Activity</span>
          </div>

          {/* Quick Stat Badges */}
          {activitySummary && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#92938C]">
              {activitySummary.historical_events_retrieved > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#1C1D1A] border border-[#2E302B] flex items-center gap-1">
                  <History className="w-3 h-3 text-[#C4F45D]" />
                  {activitySummary.historical_events_retrieved} memories
                </span>
              )}
              {plannedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#1C1D1A] border border-[#2E302B] flex items-center gap-1">
                  <Search className="w-3 h-3 text-blue-400" />
                  {executedCount}/{plannedCount} queries
                </span>
              )}
              {activitySummary.sources_collected > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-[#1C1D1A] border border-[#2E302B] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  {activitySummary.sources_collected} sources
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-[#1C1D1A] border border-[#2E302B] flex items-center gap-1 text-amber-400">
                  <AlertCircle className="w-3 h-3" />
                  0 sources
                </span>
              )}
              {activitySummary.changes_detected > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#1C1D1A] border border-[#2E302B] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  {activitySummary.changes_detected} changes
                </span>
              )}
            </div>
          )}

          {isStreaming && lastStep && (
            <span className="text-[11px] text-[#C8C7BF] truncate max-w-[200px] sm:max-w-xs animate-pulse">
              {lastStep.step}...
            </span>
          )}
        </div>

        <button className="text-[#92938C] hover:text-[#F2F1EB] p-1">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Details Panel */}
      {isExpanded && (
        <div className="p-4 border-t border-[#242622] space-y-4 bg-[#121311]">
          {/* Search Warning Banner if Insufficient Evidence or Failed */}
          {activitySummary?.search_status === 'INSUFFICIENT_EVIDENCE' && (
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-300 text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold">Insufficient Live Search Evidence: </span>
                {activitySummary.search_error_message || 'Tavily Search API key is not configured or returned no results. The agent relies strictly on verified historical baselines.'}
              </div>
            </div>
          )}

          {activitySummary?.search_status === 'FAILED' && (
            <div className="p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-300 text-[11px] flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <div>
                <span className="font-semibold">Search Provider Failure: </span>
                {activitySummary.search_error_message || 'External searches failed or timed out. No live web evidence was retrieved.'}
              </div>
            </div>
          )}

          {/* Historical Baseline Info Banner */}
          {activitySummary && (activitySummary.historical_baseline_source || activitySummary.historical_baseline_date) && (
            <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622] flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-[#C4F45D]" />
                <div>
                  <span className="text-[#92938C]">Historical Baseline: </span>
                  <span className="text-[#F2F1EB] font-medium">{activitySummary.historical_baseline_source || 'Conversation Memory'}</span>
                </div>
              </div>
              {activitySummary.historical_baseline_date && (
                <span className="text-[10px] text-[#C4F45D] font-mono">
                  {new Date(activitySummary.historical_baseline_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          )}

          {/* Multi-Topic Decomposed Pipeline Breakdown */}
          {activitySummary?.topics && activitySummary.topics.length > 1 && (
            <div className="p-3 rounded-lg bg-[#181916] border border-[#242622] text-[11px]">
              <div className="text-[10px] text-[#C4F45D] font-mono uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Multi-Topic Decomposed Research ({activitySummary.topics.length} topics isolated):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activitySummary.topics.map((t, idx) => (
                  <div key={idx} className="p-2 rounded border border-[#2E302B] bg-[#141513]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#F2F1EB]">{t.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        t.search_status === 'RECALLED_FROM_MEMORY'
                          ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40'
                          : t.search_status === 'SEARCHED'
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                          : 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
                      }`}>
                        {t.search_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#92938C] space-y-0.5">
                      <div><span className="text-[#72736C]">Baseline:</span> {t.conversation_title || 'Historical Session'}</div>
                      <div><span className="text-[#72736C]">Scope:</span> {t.entities.length} entities ({t.entities.slice(0, 3).join(', ')}{t.entities.length > 3 ? '...' : ''}), {t.claims_count} claims</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metric Grid with Query Pipeline Stats */}
          {activitySummary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622]">
                <div className="text-[10px] text-[#92938C] uppercase tracking-wider flex items-center gap-1">
                  <Search className="w-3 h-3 text-blue-400" /> Queries
                </div>
                <div className="text-sm font-semibold text-[#F2F1EB] mt-1 font-mono">
                  {executedCount} / {plannedCount}
                </div>
                <div className="text-[10px] text-[#92938C] mt-0.5 font-mono">
                  {successfulCount} ok, {failedCount} fail
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622]">
                <div className="text-[10px] text-[#92938C] uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Evidence Sources
                </div>
                <div className="text-sm font-semibold text-[#F2F1EB] mt-1 font-mono">
                  {activitySummary.sources_accepted_count ?? activitySummary.sources_collected} Accepted
                </div>
                <div className="text-[10px] text-[#92938C] mt-0.5 font-mono">
                  {activitySummary.sources_retrieved_count ?? activitySummary.sources_collected} retrieved ({activitySummary.sources_rejected_count ?? 0} rejected)
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622]">
                <div className="text-[10px] text-[#92938C] uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Verified Claims
                </div>
                <div className="text-sm font-semibold text-[#F2F1EB] mt-1 font-mono">
                  {activitySummary.claims_verified} Verified
                </div>
                <div className="text-[10px] text-[#92938C] mt-0.5 font-mono">
                  {activitySummary.unverified_count} unresolved
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622]">
                <div className="text-[10px] text-[#92938C] uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-400" /> Confirmed Changes
                </div>
                <div className="text-sm font-semibold text-[#F2F1EB] mt-1 font-mono">
                  {activitySummary.changes_detected} Detected
                </div>
                <div className="text-[10px] text-[#92938C] mt-0.5 font-mono">
                  {activitySummary.changes_detected === 0 ? '0 price/feature changes' : `${activitySummary.changes_detected} verified changes`}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#181916] border border-[#242622]">
                <div className="text-[10px] text-[#92938C] uppercase tracking-wider flex items-center gap-1">
                  <History className="w-3 h-3 text-[#C4F45D]" /> Memory Context
                </div>
                <div className="text-sm font-semibold text-[#F2F1EB] mt-1 font-mono">
                  {activitySummary.historical_events_retrieved} Events
                </div>
                <div className="text-[10px] text-[#92938C] mt-0.5 font-mono">
                  {activitySummary.relevant_entities?.length || 0} entities tracked
                </div>
              </div>
            </div>
          )}

          {/* Identified & Researched Entities Breakdown */}
          {activitySummary?.relevant_entities && activitySummary.relevant_entities.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-[#92938C] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Tag className="w-3 h-3 text-[#C4F45D]" /> Target Entities & Research Status:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activitySummary.relevant_entities.map((ent, idx) => {
                  const isResearched = activitySummary.researched_entities?.includes(ent);
                  return (
                    <span
                      key={idx}
                      className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 ${
                        isResearched
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                          : 'bg-[#1C1D1A] border-[#2E302B] text-[#92938C]'
                      }`}
                    >
                      {isResearched ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <HelpCircle className="w-3 h-3 text-amber-400/70" />
                      )}
                      <span>{ent}</span>
                      <span className="text-[10px] opacity-75">
                        {isResearched ? 'Researched' : 'Baseline Only'}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Executed Queries Inspector */}
          {activitySummary?.queries && activitySummary.queries.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-[#92938C] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Search className="w-3 h-3 text-blue-400" /> Executed Search Queries:
              </div>
              <div className="space-y-1.5">
                {activitySummary.queries.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-[#181916] border border-[#242622] flex items-center justify-between text-[11px]"
                  >
                    <div className="truncate mr-2">
                      <span className="font-mono text-[#C4F45D] mr-2">Q{idx + 1}</span>
                      <span className="text-[#F2F1EB] font-mono">{q.query}</span>
                      {q.target_entity && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-[#232521] text-[#92938C] text-[10px]">
                          {q.target_entity}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                          q.status === 'SUCCESS'
                            ? 'bg-emerald-900/40 text-emerald-300'
                            : q.status === 'NO_API_KEY'
                            ? 'bg-amber-900/40 text-amber-300'
                            : 'bg-red-900/40 text-red-300'
                        }`}
                      >
                        {q.status} ({q.results_count} sources)
                      </span>
                      <span className="text-[10px] text-[#92938C] font-mono">
                        {q.duration_ms}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Timeline */}
          <div>
            <div className="text-[11px] font-medium text-[#92938C] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#C4F45D]" /> Execution Timeline:
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {activityLog.map((act, index) => (
                <div key={index} className="flex items-start gap-2 text-[11px] text-[#92938C]">
                  <span className="font-mono text-[#C4F45D] shrink-0">
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <div>
                    <span className="text-[#F2F1EB] font-medium">{act.step}</span>
                    {act.details && <span className="text-[#92938C] ml-1.5">— {act.details}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Genuine Verified Sources List */}
          <div>
            <div className="text-[11px] font-medium text-[#92938C] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Verified External Sources:
            </div>
            {citations.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#181916] border border-[#242622] text-[#92938C] text-[11px] italic">
                Zero verified external sources collected. Conclusions are based strictly on previously stored conversational memory.
              </div>
            ) : (
              <div className="space-y-1">
                {citations.map((c) => (
                  <a
                    key={c.id}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 rounded-lg bg-[#181916] hover:bg-[#1E201B] border border-[#242622] text-[#C8C7BF] hover:text-[#F2F1EB] transition-colors"
                  >
                    <div className="truncate flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#C4F45D]">[{c.index}]</span>
                      <span className="truncate">{c.title}</span>
                      <span className="text-[10px] text-[#92938C] font-mono">({c.domain})</span>
                      {c.credibility_category !== 'PRIMARY_OFFICIAL' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#2A2B26] text-amber-300 font-mono">
                          3rd-Party
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-3 h-3 text-[#92938C] shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Excluded & Rejected Sources with Stored Reasons */}
          {activitySummary?.rejected_sources && activitySummary.rejected_sources.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-[#92938C] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-amber-400" /> Excluded Sources ({activitySummary.rejected_sources.length}):
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {activitySummary.rejected_sources.map((rej, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-[#181916] border border-[#242622] flex items-center justify-between text-[11px]"
                  >
                    <div className="truncate mr-2">
                      <div className="text-[#C8C7BF] font-medium truncate">{rej.title || rej.url}</div>
                      <div className="text-[10px] text-[#92938C] font-mono">{rej.domain}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[10px] shrink-0">
                      {rej.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
