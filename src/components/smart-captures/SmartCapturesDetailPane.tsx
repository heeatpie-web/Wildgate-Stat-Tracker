import React from 'react';

interface SmartCapturesDetailPaneProps {
  header?: React.ReactNode;
  content: React.ReactNode;
  contentOverlay?: React.ReactNode;
  className?: string;
}

export const SmartCapturesDetailPane: React.FC<SmartCapturesDetailPaneProps> = ({ header, content, contentOverlay, className = '' }) => {
  return (
    <section
      aria-busy={contentOverlay ? 'true' : 'false'}
      className={`relative isolate min-h-0 bg-md-sys-surface ring-1 ring-md-sys-outline/10 shadow-lg sc-detail-pane rounded-card overflow-hidden flex h-full flex-col ${className}`.trim()}
    >
      {header ? (
        <div
          className={`border-b border-md-sys-outline/10 flex-shrink-0 transition-opacity duration-150 ${
            contentOverlay ? 'pointer-events-none opacity-55' : ''
          }`.trim()}
        >
          {header}
        </div>
      ) : null}
      <div
        className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar transition-opacity duration-150 ${
          contentOverlay ? 'pointer-events-none opacity-45' : ''
        }`.trim()}
      >
        {content}
      </div>
      {contentOverlay ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-md-sys-surface/14 px-4 py-6 backdrop-blur-[1px]"
          data-testid="smart-captures-detail-overlay"
        >
          {contentOverlay}
        </div>
      ) : null}
    </section>
  );
};

export default SmartCapturesDetailPane;
