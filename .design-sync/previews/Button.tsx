import React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="primary">Save Match</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="tertiary">Skip</Button>
    <Button variant="danger">Delete</Button>
  </div>
);

export const WithIcon = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="primary" icon={<Download size={16} />}>Export</Button>
    <Button variant="danger" icon={<Trash2 size={16} />} iconPosition="start">Remove</Button>
    <Button variant="icon" aria-label="Delete match" icon={<Trash2 size={16} />} />
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="primary" loading>Saving…</Button>
    <Button variant="primary" disabled>Disabled</Button>
  </div>
);
