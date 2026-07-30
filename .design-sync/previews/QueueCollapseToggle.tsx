import React, { useState } from 'react';
import { QueueCollapseToggle } from '@/components/smart-captures/QueueCollapseToggle';

export const Toggle = () => {
  const [collapsed, setCollapsed] = useState(false);
  return <QueueCollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />;
};

export const CollapsedState = () => (
  <QueueCollapseToggle collapsed onToggle={() => {}} />
);
