import React from 'react';
import { OutcomePill } from '@/components/smart-captures/primitives/OutcomePill';

export const Results = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <OutcomePill result="Win" />
    <OutcomePill result="Loss" />
    <OutcomePill result="Draw" />
    <OutcomePill result="Ongoing" />
    <OutcomePill result="Saved" />
  </div>
);

export const Compact = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <OutcomePill result="Win" compact />
    <OutcomePill result="Loss" compact label="L" />
  </div>
);
