import React from 'react';
import { SmartCaptureDetailLayout } from '@/components/smart-captures/detail/SmartCaptureDetailLayout';

const Box: React.FC<{ label: string; height?: number }> = ({ label, height = 60 }) => (
  <div style={{
    height, borderRadius: 8, background: 'rgba(127,127,127,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.7,
  }}>
    {label}
  </div>
);

export const Default = () => (
  <div style={{ width: 480, height: 360 }}>
    <SmartCaptureDetailLayout
      summary={<Box label="Summary bar" height={40} />}
      editor={<Box label="Editor sections" height={180} />}
      rail={<Box label="Media rail" height={180} />}
    />
  </div>
);
