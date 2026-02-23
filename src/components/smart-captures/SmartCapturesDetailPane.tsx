import React from 'react';

interface SmartCapturesDetailPaneProps {
  header?: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

export const SmartCapturesDetailPane: React.FC<SmartCapturesDetailPaneProps> = ({ header, content, className = '' }) => {
  return (
    <section className={`min-h-0 md3-surface-high sc-detail-pane rounded-card overflow-visible flex h-full flex-col ${className}`.trim()}>
      {header ? <div className="border-b border-md-sys-outline/10 flex-shrink-0">{header}</div> : null}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible custom-scrollbar">{content}</div>
    </section>
  );
};

export default SmartCapturesDetailPane;
