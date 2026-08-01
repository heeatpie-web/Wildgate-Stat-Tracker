/**
 * @module index
 * Application entry point. Mounts the React tree with provider hierarchy:
 * ErrorBoundary → GameDataProvider → UIStateProvider → UserPreferencesProvider → App.
 * Imports Tailwind CSS (processed by PostCSS at build time).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/accessibility.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserPreferencesProvider } from './providers/UserPreferencesProvider';
import { UIStateProvider } from './providers/UIStateProvider';
import { GameDataProvider } from './providers/GameDataProvider';
import { useAppStore } from './store/useAppStore';
import { reportCriticalException } from './utils/issueTracker';

// Global error handlers — catch unhandled errors outside React's tree.
// Previously these only logged via Logger.captureException, so an uncaught
// error was invisible to the user unless they happened to open devtools or
// go dig through the log file. Now they're tracked as Sev-5 issues, which
// still logs exactly as before but also surfaces a notification.
window.onerror = (message, source, lineno, colno, error) => {
  reportCriticalException(error || message, {
    category: 'GlobalError',
    action: 'window.onerror',
    extra: { source, lineno, colno },
  });
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  reportCriticalException(event.reason, {
    category: 'GlobalError',
    action: 'unhandledrejection',
  });
};

if (typeof window !== 'undefined') {
  (window as any).__WG_STORE__ = useAppStore;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GameDataProvider>
        <UIStateProvider>
          <UserPreferencesProvider>
            <App />
          </UserPreferencesProvider>
        </UIStateProvider>
      </GameDataProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
