import React from 'react';

interface SmartCapturesQueuePaneProps {
  className?: string;
  header: React.ReactNode;
  body: React.ReactNode;
  footer?: React.ReactNode;
}

export const SmartCapturesQueuePane: React.FC<SmartCapturesQueuePaneProps> = ({ className = '', header, body, footer }) => {
  return (
    <aside className={`min-h-0 flex flex-col md3-surface-high rounded-card overflow-hidden ${className}`.trim()}>
      {header}
      {body}
      {footer}
    </aside>
  );
};

export default SmartCapturesQueuePane;

