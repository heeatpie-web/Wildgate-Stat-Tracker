/**
 * @module ErrorBoundary
 * Top-level React error boundary. Catches render-time exceptions,
 * logs them via Logger.captureException, and shows a recovery UI.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import Logger from '../utils/logger';
import { getElectronAPI } from '../utils/electronAPI';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copyStatus: string | null;
  copyStatusTone: 'success' | 'error' | 'info';
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copyStatus: null,
    copyStatusTone: 'info',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      copyStatus: null,
      copyStatusTone: 'info',
    };
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
      const confirmed = window.confirm(
        'Emergency reset will clear local cache/settings and reload the app. Continue?'
      );
      if (!confirmed) return;
      localStorage.clear();
      window.location.reload();
  }

  private handleCopyLogs = async () => {
      const api = getElectronAPI();
      if (!api) {
        this.setState({
          copyStatus: 'Copy Logs is only available in the desktop app.',
          copyStatusTone: 'error',
        });
        return;
      }
      try {
        const result = await api.invoke('read-logs');
        if (!result?.success) {
          this.setState({
            copyStatus: `Could not read logs: ${result?.error || 'Unknown error'}`,
            copyStatusTone: 'error',
          });
          return;
        }
        const content = String(result.content || '').trim();
        const payload = content.length > 0
          ? content
          : `No logs recorded yet.\nLog file: ${result.path || 'unknown'}`;

        try {
          await navigator.clipboard.writeText(payload);
        } catch {
          const textarea = document.createElement('textarea');
          textarea.value = payload;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        this.setState({
          copyStatus: 'Logs copied. Share them with your beta report.',
          copyStatusTone: 'success',
        });
      } catch (error) {
        this.setState({
          copyStatus: `Copy Logs failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          copyStatusTone: 'error',
        });
      }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-modal flex items-center justify-center md3-dialog-scrim text-md-sys-on-surface p-6">
          <div className="max-w-md w-full md3-dialog border border-md-sys-error/30 shadow-2xl text-center">
            <div className="w-20 h-20 bg-md-sys-error-container/40 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <AlertTriangle size={40} className="text-md-sys-error" />
            </div>
            <h1 className="text-2xl font-bold uppercase tracking-widest mb-2">System Critical</h1>
            <p className="text-body font-medium opacity-60 mb-6">
              The application encountered a critical error and could not render.
            </p>
            
            <div className="md3-surface-high p-4 rounded-xl mb-6 text-left overflow-auto max-h-32 custom-scrollbar border border-md-sys-outline/10">
                <code className="text-label-sm font-mono text-md-sys-error whitespace-pre-wrap">
                    {this.state.error?.toString()}
                </code>
            </div>

            {this.state.copyStatus && (
              <p className={`text-label-sm mb-4 ${this.state.copyStatusTone === 'success' ? 'text-success' : this.state.copyStatusTone === 'error' ? 'text-md-sys-error' : 'opacity-70'}`}>
                {this.state.copyStatus}
              </p>
            )}

            <div className="grid gap-3">
                <button
                    onClick={this.handleCopyLogs}
                    className="w-full py-3 md3-btn-outlined rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                >
                    <Copy size={16}/> Copy Logs
                </button>
                <button 
                    onClick={this.handleReload}
                    className="w-full py-4 md3-btn-filled rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 bg-md-sys-error text-md-sys-on-error hover:brightness-110"
                >
                    <RefreshCw size={18}/> Reboot System
                </button>
                <button 
                    onClick={this.handleClearData}
                    className="text-label-sm font-bold uppercase opacity-60 hover:opacity-100 hover:text-md-sys-error transition-colors"
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

