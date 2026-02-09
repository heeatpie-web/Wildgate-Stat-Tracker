/**
 * @module ErrorBoundary
 * Top-level React error boundary. Catches render-time exceptions,
 * logs them via Logger.captureException, and shows a recovery UI.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Logger from '../utils/logger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Logger.captureException(error, {
      category: 'ErrorBoundary',
      action: 'componentDidCatch',
      extra: { componentStack: errorInfo.componentStack }
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearData = () => {
      if(confirm("This will clear local storage settings (not your database). Continue?")) {
          localStorage.clear();
          window.location.reload();
      }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#121212] text-white p-6">
          <div className="max-w-md w-full bg-[#1e1e1e] p-8 rounded-2xl border border-red-500/20 shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <AlertTriangle size={40} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-widest mb-2">System Critical</h1>
            <p className="text-sm font-medium opacity-60 mb-6">
              The application encountered a critical error and could not render.
            </p>
            
            <div className="bg-black/20 p-4 rounded-xl mb-6 text-left overflow-auto max-h-32 custom-scrollbar">
                <code className="text-[10px] font-mono text-red-300 whitespace-pre-wrap">
                    {this.state.error?.toString()}
                </code>
            </div>

            <div className="grid gap-3">
                <button 
                    onClick={this.handleReload}
                    className="w-full py-4 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest hover:brightness-110 flex items-center justify-center gap-2"
                >
                    <RefreshCw size={18}/> Reboot System
                </button>
                <button 
                    onClick={this.handleClearData}
                    className="text-xs font-bold uppercase opacity-40 hover:opacity-100 hover:text-red-400 transition-colors"
                >
                    Emergency Reset (Clear Cache)
                </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
