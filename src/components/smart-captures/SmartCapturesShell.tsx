import React from 'react';

interface SmartCapturesShellProps {
  topNav?: React.ReactNode;
  content: React.ReactNode;
}

export const SmartCapturesShell: React.FC<SmartCapturesShellProps> = ({ topNav, content }) => {
  return (
    <div data-tour="view-smart-captures" className="h-full min-h-0 flex flex-col gap-3">
      {topNav ? <div className="shrink-0">{topNav}</div> : null}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">{content}</div>
    </div>
  );
};

export default SmartCapturesShell;
