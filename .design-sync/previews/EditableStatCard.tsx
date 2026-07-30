import React, { useState } from 'react';
import { Skull } from 'lucide-react';
import { EditableStatCard } from '@/components/smart-captures/SmartCaptureWidgets';

export const Editable = () => {
  const [kills, setKills] = useState('7');
  return (
    <div style={{ width: 220 }}>
      <EditableStatCard
        icon={<Skull size={16} />}
        label="Kills"
        value={kills}
        type="number"
        onSave={setKills}
        accent="primary"
      />
    </div>
  );
};

export const ReadOnly = () => (
  <div style={{ width: 220 }}>
    <EditableStatCard icon={<Skull size={16} />} label="Deaths" value="2" readOnly accent="danger" />
  </div>
);
