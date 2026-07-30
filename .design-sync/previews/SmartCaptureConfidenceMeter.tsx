import React from 'react';
import { SmartCaptureConfidenceMeter } from '@/components/smart-captures/primitives/ConfidenceMeter';

export const Levels = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
    <SmartCaptureConfidenceMeter percent={92} />
    <SmartCaptureConfidenceMeter percent={58} />
    <SmartCaptureConfidenceMeter percent={15} />
  </div>
);
