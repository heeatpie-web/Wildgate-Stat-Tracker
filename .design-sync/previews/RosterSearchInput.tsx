import React, { useState } from 'react';
import { RosterSearchInput } from '@/components/ocr/RosterSearchInput';

const ROSTER = ['Alixerthus', 'Caziban', 'Marrowfen', 'Ashcallow', 'Brindlewick', 'Ossuara'];

export const Typeahead = () => {
  const [value, setValue] = useState('Cazi');
  return (
    <div style={{ width: 260 }}>
      <RosterSearchInput
        value={value}
        onChange={setValue}
        rosterNames={ROSTER}
        placeholder="Player name"
        className="wg-input"
      />
    </div>
  );
};

export const Empty = () => {
  const [value, setValue] = useState('');
  return (
    <div style={{ width: 260 }}>
      <RosterSearchInput
        value={value}
        onChange={setValue}
        rosterNames={ROSTER}
        placeholder="Search roster…"
        className="wg-input"
      />
    </div>
  );
};
