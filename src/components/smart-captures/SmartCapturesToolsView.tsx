import React from 'react';

interface SmartCapturesToolsViewProps {
  children: React.ReactNode;
}

export const SmartCapturesToolsView: React.FC<SmartCapturesToolsViewProps> = ({ children }) => {
  return (
    <div className="h-full min-h-0 overflow-y-auto md3-surface-high rounded-card p-4 space-y-4 flex flex-col gap-4">
      {children}
    </div>
  );
};

export default SmartCapturesToolsView;

