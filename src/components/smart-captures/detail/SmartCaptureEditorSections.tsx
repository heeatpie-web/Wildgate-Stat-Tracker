import React from 'react';

interface SmartCaptureEditorSectionsProps {
  children: React.ReactNode;
}

export const SmartCaptureEditorSections: React.FC<SmartCaptureEditorSectionsProps> = ({ children }) => {
  return <div className="sc-detail-editor-sections space-y-3">{children}</div>;
};

export default SmartCaptureEditorSections;
