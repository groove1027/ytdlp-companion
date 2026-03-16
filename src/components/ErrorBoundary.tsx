
import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { logger } from '../services/LoggerService';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

function ErrorFallback({ error: rawError, resetErrorBoundary, fallbackMessage }: FallbackProps & { fallbackMessage?: string }) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-gray-900/50 rounded-xl border border-red-500/30 m-4">
      <div className="text-red-400 text-lg font-bold mb-2">
        화면 렌더링 오류
      </div>
      <p className="text-gray-400 text-sm mb-4 text-center max-w-md">
        {fallbackMessage || '이 영역에서 오류가 발생했습니다. 디버그 로그에 자동 기록되었습니다.'}
      </p>
      <div className="text-gray-600 text-xs font-mono mb-4 max-w-lg break-all text-center">
        {error?.message?.substring(0, 200)}
      </div>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-bold transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}

export default function ErrorBoundary({ children, fallbackMessage }: Props) {
  return (
    <ReactErrorBoundary
      FallbackComponent={(props) => <ErrorFallback {...props} fallbackMessage={fallbackMessage} />}
      onError={(rawError, info) => {
        const err = rawError instanceof Error ? rawError : new Error(String(rawError));
        logger.trackReactError(err, info.componentStack || '(no component stack)');
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
