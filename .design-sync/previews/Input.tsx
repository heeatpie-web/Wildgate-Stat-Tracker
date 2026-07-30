import React from 'react';
import { Input } from '@/components/ui/Input';

export const Basic = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 280 }}>
    <Input label="Player name" placeholder="Enter a name" defaultValue="" />
    <Input label="Kill count" type="number" defaultValue="4" helperText="OCR-detected, editable" />
  </div>
);

export const ErrorState = () => (
  <div style={{ width: 280 }}>
    <Input label="Ship name" defaultValue="Interceptr" error="Unrecognized ship — check spelling" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 280 }}>
    <Input label="Match ID" defaultValue="wg-2f91ac" disabled />
  </div>
);
