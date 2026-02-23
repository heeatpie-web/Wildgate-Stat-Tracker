import React from 'react';

interface SmartCaptureDetailLayoutProps {
  summary: React.ReactNode;
  editor: React.ReactNode;
  rail: React.ReactNode;
  footer?: React.ReactNode;
  summaryMode?: 'default' | 'compact' | 'hidden';
}

export const SmartCaptureDetailLayout: React.FC<SmartCaptureDetailLayoutProps> = ({ summary, editor, rail, footer, summaryMode = 'default' }) => {
  const showSummary = summaryMode !== 'hidden';
  const summaryClassName = summaryMode === 'compact'
    ? 'sc-detail-summary sticky top-0 z-30 overflow-visible bg-md-sys-surface-container-high rounded-card px-2 py-1 border border-md-sys-outline/12 shadow-sm'
    : 'sc-detail-summary sticky top-0 z-30 overflow-visible bg-md-sys-surface-container-high rounded-card px-2 py-1.5 border border-md-sys-outline/12 shadow-sm';

  return (
    <div className="sc-detail-shell h-full min-h-0 p-4 lg:p-5 flex flex-col">
      {showSummary ? <div className={summaryClassName}>{summary}</div> : null}
      <div className={`sc-detail-main min-h-0 ${showSummary ? 'mt-4' : ''}`}>
        <div className="sc-detail-editor min-w-0 space-y-4">{editor}</div>
        <aside className="sc-detail-rail min-w-0 space-y-4">{rail}</aside>
      </div>
      {footer ? <div className="mt-4 flex-shrink-0">{footer}</div> : null}
    </div>
  );
};

export default SmartCaptureDetailLayout;
