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
      className="w-8 h-8 rounded-control md3-surface inline-flex items-center justify-center text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/8 transition-colors"
      aria-label={collapsed ? 'Expand queue panel' : 'Collapse queue panel'}
      title={collapsed ? 'Expand queue panel' : 'Collapse queue panel'}
    >
      {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
    </button>
  );
};

export default QueueCollapseToggle;

