import React, { useState } from 'react';
import { AlertTriangle, Check, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { AiPlanProposal, PlannerState } from '../types/planner';
import { requiresUserConfirmation } from '../utils/aiPlannerExecutor';

export interface AiApplyFeedbackResult {
  appliedCount: number;
  savedOk: boolean;
  touchedDates: string[];
  appliedSummaries: string[];
  warnings: string[];
  errors: string[];
}

interface AiPlannerBarProps {
  todayKst: string;
  selectedDate: string;
  state: PlannerState;
  onApplyProposal: (proposal: AiPlanProposal) => AiApplyFeedbackResult;
  onUndoLastAiChange: () => void;
  canUndo: boolean;
}

const EXAMPLE_PROMPTS = [
  '이번 주 시험공부 계획을 짜 줘',
  '자격증 모의고사 할 일을 3단계로 분리해 줘',
  '달력을 연한 초록색 테마로 바꿔 줘',
  '메인 화면에 D-day 위젯을 추가해 줘',
  '완료하지 못한 일들을 내일 일정으로 옮겨 줘',
  '매주 월요일과 수요일에 운동 일정을 반복 등록해 줘',
];

export const AiPlannerBar: React.FC<AiPlannerBarProps> = ({
  todayKst,
  selectedDate,
  state,
  onApplyProposal,
  onUndoLastAiChange,
  canUndo,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingProposal, setPendingProposal] = useState<AiPlanProposal | null>(null);
  const [lastAppliedMessage, setLastAppliedMessage] = useState('');
  const [appliedWarnings, setAppliedWarnings] = useState<string[]>([]);

  const applyWithFeedback = (proposal: AiPlanProposal, prefix = '') => {
    const result = onApplyProposal(proposal);
    setAppliedWarnings(result.warnings);

    if (!result.savedOk || result.appliedCount === 0) {
      setLastAppliedMessage('');
      setErrorMsg(
        result.errors.join(' ') ||
          result.warnings.join(' ') ||
          '요청한 일정·작업의 유효성을 확인하지 못해 반영되지 않았습니다.'
      );
      return false;
    }

    const summaryText =
      result.appliedSummaries.length > 0
        ? result.appliedSummaries.join(' ')
        : proposal.explanation;
    setErrorMsg(result.errors.length > 0 ? result.errors.join(' ') : '');
    setLastAppliedMessage(prefix ? `${prefix}${summaryText}` : summaryText);
    return true;
  };

  const handleSubmitPrompt = async (customPrompt?: string) => {
    const query = (customPrompt ?? prompt).trim();
    if (!query || loading) return;

    setLoading(true);
    setErrorMsg('');
    setPendingProposal(null);
    setLastAppliedMessage('');
    setAppliedWarnings([]);

    try {
      const compactContext = {
        todayKst,
        selectedDate,
        profile: state.profile,
        design: state.design,
        widgets: state.widgets,
        schedules: state.schedules.slice(-25),
        todos: state.todos.slice(-25),
        ddays: state.ddays.slice(0, 10),
      };

      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: query, context: compactContext }),
      });

      const data = (await res.json()) as { proposal?: AiPlanProposal; error?: string };
      if (!res.ok || !data.proposal) {
        setErrorMsg(
          data.error ||
            'AI 요청을 처리할 수 없습니다. 기본 달력과 위젯 기능은 정상적으로 사용하실 수 있습니다.'
        );
        return;
      }

      const proposal = data.proposal;
      const operations = Array.isArray(proposal.operations) ? proposal.operations : [];

      if (proposal.intent === 'unsupported') {
        setPendingProposal({ ...proposal, operations: [] });
        return;
      }

      if (proposal.intent === 'schedule_analysis' && operations.length === 0) {
        setPendingProposal({ ...proposal, operations: [] });
        return;
      }

      if (operations.length === 0) {
        setErrorMsg(
          'AI 응답에서 실제로 등록하거나 변경할 작업 데이터를 확인하지 못했습니다. 날짜와 일정을 구체적으로 입력해 주세요.'
        );
        return;
      }

      if (!requiresUserConfirmation(proposal)) {
        const applied = applyWithFeedback(proposal);
        if (applied) {
          setPrompt('');
        }
      } else {
        setPendingProposal(proposal);
      }
    } catch {
      setErrorMsg(
        '서버와 통신하는 중 문제가 발생했습니다. 기본 달력·할 일 기능은 계속 이용하실 수 있습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="planner-surface rounded-2xl p-4 sm:p-5 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitPrompt();
        }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] focus-within:border-[var(--accent-primary)]">
          <Sparkles className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="어떤 기능이 필요하세요? 원하는 대로 말해 보세요."
            className="w-full bg-transparent text-sm focus:outline-none placeholder:text-[var(--text-muted)]"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--accent-contrast)',
          }}
        >
          <Send className="w-3.5 h-3.5" />
          <span>{loading ? '분석 중...' : 'AI에게 요청'}</span>
        </button>
      </form>

      {/* Quick Request Examples */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap shrink-0 mr-1">
          예시 요청:
        </span>
        {EXAMPLE_PROMPTS.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={loading}
            onClick={() => {
              setPrompt(ex);
              handleSubmitPrompt(ex);
            }}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Error State */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start justify-between gap-3 text-sm text-red-700 dark:text-red-300">
          <p>{errorMsg}</p>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            aria-label="안내 닫기"
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Immediate Applied Confirmation + Undo */}
      {lastAppliedMessage && (
        <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span>{lastAppliedMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              {canUndo && (
                <button
                  type="button"
                  onClick={() => {
                    onUndoLastAiChange();
                    setLastAppliedMessage('');
                    setAppliedWarnings([]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>되돌리기</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setLastAppliedMessage('');
                  setAppliedWarnings([]);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>

          {appliedWarnings.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 pt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{appliedWarnings.join(' ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Proposal Confirmation Card */}
      {pendingProposal && (
        <div className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--accent-primary)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--accent-primary)]">
                {pendingProposal.intentLabel}
              </span>
              {pendingProposal.operations.length > 0 &&
                pendingProposal.intent !== 'unsupported' && (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    · 실행 전 확인 필요 ({pendingProposal.operations.length}건)
                  </span>
                )}
            </div>
            <button
              type="button"
              onClick={() => setPendingProposal(null)}
              aria-label="제안 닫기"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm font-medium leading-relaxed">{pendingProposal.explanation}</p>

          {pendingProposal.previewSummary.length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--text-secondary)] list-disc list-inside">
              {pendingProposal.previewSummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}

          {pendingProposal.operations.length > 0 && pendingProposal.intent !== 'unsupported' && (
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const applied = applyWithFeedback(pendingProposal, '적용 완료: ');
                  setPendingProposal(null);
                  if (applied) setPrompt('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <Check className="w-3.5 h-3.5" />
                <span>확인하고 적용하기</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingProposal(null)}
                className="px-4 py-2 rounded-xl text-xs border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
