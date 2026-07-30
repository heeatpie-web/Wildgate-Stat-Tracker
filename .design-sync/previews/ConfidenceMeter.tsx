import React from 'react';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';

export const Levels = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
    <ConfidenceMeter confidence={94} />
    <ConfidenceMeter confidence={62} />
    <ConfidenceMeter confidence={21} />
  </div>
);

export const Small = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
    <ConfidenceMeter confidence={88} size="sm" />
    <ConfidenceMeter confidence={45} size="sm" />
  </div>
);
