/**
 * 위젯 에러 바운더리
 *
 * 개별 위젯의 에러를 격리하여 다른 위젯에 영향을 주지 않도록 한다.
 */

'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  widgetName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {this.props.widgetName ?? '위젯'} 로딩 실패
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => this.setState({ hasError: false })}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            재시도
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
