import React from 'react';

interface SmartCaptureDetailLayoutProps {
  summary: React.ReactNode;
  editor: React.ReactNode;
  rail: React.ReactNode;
  footer?: React.ReactNode;
}

export const SmartCaptureDetailLayout: React.FC<SmartCaptureDetailLayoutProps> = ({ summary, editor, rail, footer }) => {
  return (
    <div className="sc-detail-shell p-4 lg:p-5">
      <div className="sc-detail-summary sticky top-0 z-20">{summary}</div>
      <div className="sc-detail-main mt-3">
        <div className="sc-detail-editor min-w-0 space-y-3">{editor}</div>
        <aside className="sc-detail-rail min-w-0 space-y-3">{rail}</aside>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
};

export default SmartCaptureDetailLayout;
