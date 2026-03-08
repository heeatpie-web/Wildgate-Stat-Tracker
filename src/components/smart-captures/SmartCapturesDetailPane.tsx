import React from 'react';

interface SmartCapturesDetailPaneProps {
  header?: React.ReactNode;
  content: React.ReactNode;
  contentOverlay?: React.ReactNode;
  className?: string;
}

export const SmartCapturesDetailPane: React.FC<SmartCapturesDetailPaneProps> = ({ header, content, contentOverlay, className = '' }) => {
  return (
    <section className={`min-h-0 bg-md-sys-surface ring-1 ring-md-sys-outline/10 shadow-lg sc-detail-pane rounded-card overflow-hidden flex h-full flex-col ${className}`.trim()}>
      {header ? <div className="border-b border-md-sys-outline/10 flex-shrink-0">{header}</div> : null}
      <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {content}
        {contentOverlay ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-md-sys-surface/78"
            data-testid="smart-captures-detail-overlay"
          >
            {contentOverlay}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default SmartCapturesDetailPane;
