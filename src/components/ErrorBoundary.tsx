
import React from 'react';
import { logger } from '../services/LoggerService';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — 컴포넌트 렌더 에러를 잡아 로거에 기록.
 * 전체 앱 크래시 대신 에러 UI를 표시하고 진단 데이터를 수집.
 */
class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.trackReactError(error, errorInfo.componentStack || '(no component stack)');
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-900/50 rounded-xl border border-red-500/30 m-4">
          <div className="text-red-400 text-lg font-bold mb-2">
            화면 렌더링 오류
          </div>
          <p className="text-gray-400 text-sm mb-4 text-center max-w-md">
            {this.props.fallbackMessage || '이 영역에서 오류가 발생했습니다. 디버그 로그에 자동 기록되었습니다.'}
          </p>
          <div className="text-gray-600 text-xs font-mono mb-4 max-w-lg break-all text-center">
            {this.state.error?.message?.substring(0, 200)}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-bold transition-colors"
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
