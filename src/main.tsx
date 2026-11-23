import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { clearPlannerStorage } from './utils/storage';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
}

class PlannerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f6f1] text-[#1f2421]">
          <div className="max-w-md w-full rounded-2xl border border-[#e5e0d5] bg-white p-6 space-y-4 shadow-sm">
            <h1 className="text-lg font-bold">화면을 불러오는 중 문제가 발생했습니다</h1>
            <p className="text-sm text-[#5c635e] leading-relaxed">
              일시적인 오류이거나 브라우저에 저장된 플래너 데이터가 손상되었을 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#2f5d50] text-white cursor-pointer"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => {
                  clearPlannerStorage();
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#e5e0d5] bg-[#f8f6f1] cursor-pointer"
              >
                저장 데이터 초기화 후 복구
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <PlannerErrorBoundary>
    <App />
  </PlannerErrorBoundary>
);
