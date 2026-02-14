import React from 'react';

interface SmartCaptureMediaRailProps {
  children: React.ReactNode;
}

export const SmartCaptureMediaRail: React.FC<SmartCaptureMediaRailProps> = ({ children }) => {
  return <div className="sc-detail-media-rail space-y-3">{children}</div>;
};

export default SmartCaptureMediaRail;
