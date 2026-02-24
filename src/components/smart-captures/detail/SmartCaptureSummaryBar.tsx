import React from 'react';

interface SmartCaptureSummaryBarProps {
  children: React.ReactNode;
}

export const SmartCaptureSummaryBar: React.FC<SmartCaptureSummaryBarProps> = ({ children }) => {
  return (
    <div className="sc-detail-summary-bar space-y-1.5">
      {children}
    </div>
  );
};

export default SmartCaptureSummaryBar;
