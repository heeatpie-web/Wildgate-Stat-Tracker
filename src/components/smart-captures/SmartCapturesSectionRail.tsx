import React from 'react';
import { ScanEye, Zap } from 'lucide-react';
import type { SmartCapturesSection } from '../../store/slices/createSmartCapturesSlice';

interface SmartCapturesSectionRailProps {
  activeSection: SmartCapturesSection;
  onChange: (section: SmartCapturesSection) => void;
}

export const SmartCapturesSectionRail: React.FC<SmartCapturesSectionRailProps> = ({ activeSection, onChange }) => {
  const itemClass = (active: boolean) =>
    `w-full flex flex-col items-center gap-1 py-2.5 rounded-control text-label-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary ${
      active ? 'bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer' : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
    }`;

  return (
    <nav className="w-14 shrink-0 flex flex-col gap-1 md3-surface-high rounded-card p-2 self-start" aria-label="Smart Captures sections">
      <button
        type="button"
        onClick={() => onChange('capture')}
        aria-current={activeSection === 'capture' ? 'page' : undefined}
        title="Capture Queue"
        className={itemClass(activeSection === 'capture')}
      >
        <ScanEye size={20} aria-hidden />
        <span>Queue</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('tools')}
        aria-current={activeSection === 'tools' ? 'page' : undefined}
        title="Tools"
        className={itemClass(activeSection === 'tools')}
      >
        <Zap size={20} aria-hidden />
        <span>Tools</span>
      </button>
    </nav>
  );
};

export default SmartCapturesSectionRail;

