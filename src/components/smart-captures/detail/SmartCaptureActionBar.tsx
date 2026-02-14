import React from 'react';

interface SmartCaptureActionBarProps {
  children: React.ReactNode;
}

export const SmartCaptureActionBar: React.FC<SmartCaptureActionBarProps> = ({ children }) => {
  return (
    <div className="sc-detail-action-bar flex flex-wrap items-center gap-1.5 shrink-0">
      {children}
    </div>
  );
};

export default SmartCaptureActionBar;
