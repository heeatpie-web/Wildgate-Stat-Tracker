import React from 'react';
import { SmartCapturesToolsView } from '@/components/smart-captures/SmartCapturesToolsView';

export const Basic = () => (
  <div style={{ width: 320, height: 220 }}>
    <SmartCapturesToolsView>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Tools</p>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.65 }}>Batch actions and filters live here.</p>
    </SmartCapturesToolsView>
  </div>
);
