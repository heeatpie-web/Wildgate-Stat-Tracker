import React from 'react';
import { OCRFieldRow } from '@/components/smart-captures/fields/OCRFieldRow';

export const HighConfidence = () => (
  <div style={{ width: 280 }}>
    <OCRFieldRow label="Player Name" value="Alixerthus" confidence={94} />
  </div>
);

export const LowConfidence = () => (
  <div style={{ width: 280 }}>
    <OCRFieldRow label="Ship" value="Interceptr?" confidence={38} />
  </div>
);

export const NoConfidence = () => (
  <div style={{ width: 280 }}>
    <OCRFieldRow label="Notes" value="Manual entry" />
  </div>
);
