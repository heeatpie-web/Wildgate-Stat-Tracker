import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import { Section } from '@/components/smart-captures/SmartCaptureWidgets';

export const Basic = () => (
  <div style={{ width: 360 }}>
    <Section title="Match Details" icon={<Swords size={16} />}>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Section body content goes here.</p>
    </Section>
  </div>
);

export const Collapsible = () => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ width: 360 }}>
      <Section
        title="Reach Modifiers"
        icon={<Swords size={16} />}
        collapsible
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      >
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Toggle to collapse this section.</p>
      </Section>
    </div>
  );
};
