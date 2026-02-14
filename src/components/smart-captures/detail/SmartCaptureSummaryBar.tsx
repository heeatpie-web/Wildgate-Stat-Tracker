import React from 'react';

interface SmartCaptureSummaryBarProps {
  children: React.ReactNode;
}

export const SmartCaptureSummaryBar: React.FC<SmartCaptureSummaryBarProps> = ({ children }) => {
  return (
    <div className="sc-detail-summary-bar md3-surface-high rounded-card p-4 space-y-3">
      {children}
    </div>
  );
};

export default SmartCaptureSummaryBar;
