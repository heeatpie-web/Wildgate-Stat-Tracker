import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface QueueCollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const QueueCollapseToggle: React.FC<QueueCollapseToggleProps> = ({ collapsed, onToggle }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-9 h-9 rounded-control md3-surface inline-flex items-center justify-center text-md-sys-on-surface/68 hover:bg-md-sys-on-surface/8 transition-colors"
      aria-label={collapsed ? 'Expand queue panel' : 'Collapse queue panel'}
      title={collapsed ? 'Expand queue panel' : 'Collapse queue panel'}
    >
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>
  );
};

export default QueueCollapseToggle;

