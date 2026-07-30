import React from 'react';
import { Skull, Trophy } from 'lucide-react';
import { StatCard } from '@/components/smart-captures/SmartCaptureWidgets';

export const Accents = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <StatCard icon={<Skull size={16} />} label="Kills" value="7" accent="primary" />
    <StatCard icon={<Trophy size={16} />} label="Placement" value="1st" accent="success" />
    <StatCard icon={<Skull size={16} />} label="Deaths" value="2" accent="danger" />
  </div>
);
