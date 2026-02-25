import React from 'react';

interface SmartCaptureSummaryBarProps {
  children: React.ReactNode;
}

export const SmartCaptureSummaryBar: React.FC<SmartCaptureSummaryBarProps> = ({ children }) => {
  return (
    <div className="sc-detail-summary-bar">
      {children}
    </div>
  );
};

export default SmartCaptureSummaryBar;
