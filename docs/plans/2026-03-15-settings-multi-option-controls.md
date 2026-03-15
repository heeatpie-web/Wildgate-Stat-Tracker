# Settings Multi-Option Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all multi-option (non-boolean) settings controls with `SegmentedControl` (chip row) for short labels and `OptionCycler` (‹ label ›) for long labels, both using a `SettingRow` wrapper that shows a description that updates per selection.

**Architecture:** New file `src/components/settings/SettingControls.tsx` exports three components (`SegmentedControl`, `OptionCycler`, `SettingRow`). `SettingsModal.tsx` imports and uses them, replacing 5 existing inline button grids and the large capture card grid. Boolean toggle switches are untouched.

**Tech Stack:** React, TypeScript, Tailwind/CSS utility classes matching existing MD3 design tokens, Vitest + Testing Library for tests.

---

### Task 1: Create SettingControls components with tests

**Files:**
- Create: `src/components/settings/SettingControls.tsx`
- Create: `src/components/settings/SettingControls.test.tsx`

**Step 1: Write failing tests**

Create `src/components/settings/SettingControls.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SegmentedControl, OptionCycler, SettingRow } from './SettingControls';

const OPTIONS = [
  { id: 'a', label: 'Option A' },
  { id: 'b', label: 'Option B' },
  { id: 'c', label: 'Option C' },
];

describe('SegmentedControl', () => {
  it('renders all option labels', () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Option A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Option B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Option C' })).toBeInTheDocument();
  });

  it('calls onChange with clicked option id', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('OptionCycler', () => {
  it('shows current option label', () => {
    render(<OptionCycler options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('next arrow advances to next option', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('prev arrow goes to previous option', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous option' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wraps from last to first on next', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="c" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wraps from first to last on prev', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous option' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<OptionCycler options={OPTIONS} value="b" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Next option' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SettingRow', () => {
  it('renders label and description for current value', () => {
    render(
      <SettingRow
        label="My Setting"
        value="a"
        descriptions={{ a: 'Description for A', b: 'Description for B' }}
      >
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('My Setting')).toBeInTheDocument();
    expect(screen.getByText('Description for A')).toBeInTheDocument();
    expect(screen.queryByText('Description for B')).not.toBeInTheDocument();
  });

  it('updates description when value changes', () => {
    const { rerender } = render(
      <SettingRow label="My Setting" value="a" descriptions={{ a: 'Desc A', b: 'Desc B' }}>
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('Desc A')).toBeInTheDocument();
    rerender(
      <SettingRow label="My Setting" value="b" descriptions={{ a: 'Desc A', b: 'Desc B' }}>
        <span>control</span>
      </SettingRow>
    );
    expect(screen.getByText('Desc B')).toBeInTheDocument();
    expect(screen.queryByText('Desc A')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests to confirm they fail**

```
npm test -- SettingControls
```
Expected: FAIL — module not found.

**Step 3: Implement SettingControls.tsx**

Create `src/components/settings/SettingControls.tsx`:

```tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SelectOption {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options, value, onChange, disabled,
}) => (
  <div className="flex gap-1 flex-wrap">
    {options.map(opt => (
      <button
        key={opt.id}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt.id)}
        className={`px-3 py-1.5 rounded-control text-label-sm font-bold transition-all disabled:opacity-disabled ${
          value === opt.id
            ? 'bg-md-sys-primary text-md-sys-on-primary'
            : 'md3-surface-high opacity-60 hover:opacity-100'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

interface OptionCyclerProps {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const OptionCycler: React.FC<OptionCyclerProps> = ({
  options, value, onChange, disabled,
}) => {
  const idx = Math.max(0, options.findIndex(o => o.id === value));
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length].id);
  const next = () => onChange(options[(idx + 1) % options.length].id);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={prev}
        aria-label="Previous option"
        className="p-1 rounded-control md3-surface-high opacity-60 hover:opacity-100 disabled:opacity-disabled"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-label-sm font-bold text-md-sys-on-surface min-w-[11rem] text-center px-1">
        {options[idx]?.label ?? value}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={next}
        aria-label="Next option"
        className="p-1 rounded-control md3-surface-high opacity-60 hover:opacity-100 disabled:opacity-disabled"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

interface SettingRowProps {
  label: string;
  value: string;
  descriptions: Record<string, string>;
  children: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label, value, descriptions, children,
}) => (
  <div className="py-3 border-b border-md-sys-outline/10 last:border-0">
    <div className="flex items-center justify-between gap-4">
      <span className="text-label-sm font-medium text-md-sys-on-surface/70 shrink-0">{label}</span>
      {children}
    </div>
    {descriptions[value] && (
      <p className="mt-1.5 text-label-sm text-md-sys-on-surface/50">{descriptions[value]}</p>
    )}
  </div>
);
```

**Step 4: Run tests to confirm they pass**

```
npm test -- SettingControls
```
Expected: PASS — all 10 tests green.

**Step 5: Commit**

```bash
git add src/components/settings/SettingControls.tsx src/components/settings/SettingControls.test.tsx
git commit -m "feat: add SegmentedControl, OptionCycler, SettingRow components"
```

---

### Task 2: Replace Appearance Mode grid

**Files:**
- Modify: `src/components/SettingsModal.tsx` (around line 940–958)

**Step 1: Add import**

At the top of `SettingsModal.tsx`, after the existing imports, add:

```tsx
import { SegmentedControl, OptionCycler, SettingRow } from './settings/SettingControls';
```

**Step 2: Replace the Appearance Mode button grid**

Find this block (around line 940):
```tsx
<label className="text-label-sm font-semibold opacity-60 block mb-3">Appearance Mode</label>
<div className="grid grid-cols-2 gap-2">
    {([
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' },
        { id: 'twilight', label: 'Twilight' },
        { id: 'system', label: 'System' },
    ] as const).map(opt => (
        <Button
            key={opt.id}
            onClick={() => setAppearanceMode(opt.id)}
            variant={appearanceMode === opt.id ? 'primary' : 'secondary'}
            className={`h-12 text-label-sm font-bold uppercase tracking-wide ${appearanceMode === opt.id ? '' : 'opacity-60 hover:opacity-100'}`}
        >
            {opt.label}
        </Button>
    ))}
</div>
```

Replace with:
```tsx
<label className="text-label-sm font-semibold opacity-60 block mb-3">Appearance Mode</label>
<SegmentedControl
    options={[
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' },
        { id: 'twilight', label: 'Twilight' },
        { id: 'system', label: 'System' },
    ]}
    value={appearanceMode}
    onChange={(id) => setAppearanceMode(id as typeof appearanceMode)}
/>
```

**Step 3: Run tests**

```
npm test -- SettingsModal
```
Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: replace appearance mode grid with SegmentedControl"
```

---

### Task 3: Replace Overlay Style grid

**Files:**
- Modify: `src/components/SettingsModal.tsx` (around line 1079–1100)

**Step 1: Replace the Overlay Style section content**

Find this block (the entire content inside `activeSection === 'overlay'`):
```tsx
<div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
    <div className="grid grid-cols-2 gap-3">
        <button
            onClick={() => setOverlayStyle('transparent')}
            className={`p-4 rounded-control text-center transition-all ${overlayStyle === 'transparent' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
        >
            <div className="text-body font-bold">Compact</div>
            <div className="text-label-sm opacity-60">Small opaque popup</div>
        </button>
        <button
            onClick={() => setOverlayStyle('compact')}
            className={`p-4 rounded-control text-center transition-all ${overlayStyle === 'compact' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
        >
            <div className="text-body font-bold">Full Panel</div>
            <div className="text-label-sm opacity-60">Full-height side panel</div>
        </button>
    </div>
</div>
```

Replace with:
```tsx
<div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
    <SettingRow
        label="Overlay Style"
        value={overlayStyle}
        descriptions={{
            transparent: 'Small opaque popup shown while in game.',
            compact: 'Full-height side panel shown while in game.',
        }}
    >
        <SegmentedControl
            options={[
                { id: 'transparent', label: 'Compact' },
                { id: 'compact', label: 'Full Panel' },
            ]}
            value={overlayStyle}
            onChange={(id) => setOverlayStyle(id as 'compact' | 'transparent')}
        />
    </SettingRow>
</div>
```

**Step 2: Run tests**

```
npm test -- SettingsModal
```
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: replace overlay style grid with SegmentedControl"
```

---

### Task 4: Replace Capture section cards with SettingRow + OptionCycler

**Files:**
- Modify: `src/components/SettingsModal.tsx` (around lines 1141–1218)

**Step 1: Replace the auto-fit card grid**

Find the entire `data-testid="settings-quick-setup-grid"` div and its contents (from the opening `<div data-testid="settings-quick-setup-grid"...>` through its closing `</div>`, approximately lines 1141–1218). Replace it with:

```tsx
<div
    data-testid="settings-quick-setup-grid"
    className="divide-y divide-md-sys-outline/10"
>
    <SettingRow
        label="Capture Mode"
        value={captureMode}
        descriptions={{
            deferred: 'Saves screenshot now; run OCR later from Smart Captures.',
            auto: 'Runs OCR automatically right after each capture.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'deferred', label: 'Capture Now, OCR Later' },
                { id: 'auto', label: 'Capture Now + Auto OCR' },
            ]}
            value={captureMode}
            onChange={(id) => setCaptureMode(id as CaptureMode)}
        />
    </SettingRow>
    <SettingRow
        label="Result Button"
        value={resultOcrFlowMode}
        descriptions={{
            prompt: 'Ask before processing queued captures.',
            background: 'Opens wizard immediately; OCR runs in background.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'prompt', label: 'Prompt Before OCR' },
                { id: 'background', label: 'Background OCR' },
            ]}
            value={resultOcrFlowMode}
            onChange={(id) => setResultOcrFlowMode(id as ResultOcrFlowMode)}
        />
    </SettingRow>
    <SettingRow
        label="OCR Rerun"
        value={ocrAutoOpenAfterRerun ? 'auto-open' : 'notify'}
        descriptions={{
            'notify': 'Completed reruns raise a notification and stay in place.',
            'auto-open': 'Completed reruns open the review flow automatically.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'notify', label: 'Notify Only' },
                { id: 'auto-open', label: 'Auto-open Review' },
            ]}
            value={ocrAutoOpenAfterRerun ? 'auto-open' : 'notify'}
            onChange={(id) => setOcrAutoOpenAfterRerun(id === 'auto-open')}
        />
    </SettingRow>
    <SettingRow
        label="Smart Capture Button"
        value={autoSequenceOnCapture ? 'sequence' : 'single'}
        descriptions={{
            single: 'UI capture buttons run one Smart Capture on the current screen.',
            sequence: 'UI capture buttons run Tactical Map + Crew Hub sequence.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'single', label: 'Single Capture' },
                { id: 'sequence', label: 'Auto-sequence' },
            ]}
            value={autoSequenceOnCapture ? 'sequence' : 'single'}
            onChange={(id) => setAutoSequenceOnCapture(id === 'sequence')}
        />
    </SettingRow>
    <SettingRow
        label="Auto-capture Input"
        value={autoCaptureSendKeypresses ? 'keypresses' : 'manual'}
        descriptions={{
            manual: 'Sequence waits and captures only — navigate the UI yourself.',
            keypresses: 'Main process sends map and crew-hub navigation inputs to Wildgate.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'manual', label: 'Manual Navigation Only' },
                { id: 'keypresses', label: 'Send Game Keypresses' },
            ]}
            value={autoCaptureSendKeypresses ? 'keypresses' : 'manual'}
            onChange={(id) => setAutoCaptureSendKeypresses(id === 'keypresses')}
        />
    </SettingRow>
    <SettingRow
        label="OCR Learning"
        value={ocrLearningEnabled ? 'enabled' : 'disabled'}
        descriptions={{
            disabled: 'Manual review only — no aliases are auto-applied.',
            enabled: `Aliases are learned automatically. Review mode: ${ocrLearningReviewMode}.`,
        }}
    >
        <OptionCycler
            options={[
                { id: 'disabled', label: 'Disabled' },
                { id: 'enabled', label: 'Enabled' },
            ]}
            value={ocrLearningEnabled ? 'enabled' : 'disabled'}
            onChange={(id) => setOcrLearningEnabled(id === 'enabled')}
        />
    </SettingRow>
    <SettingRow
        label="Roster Auto-populate"
        value={autoPopulateRosterOnSave ? 'enabled' : 'disabled'}
        descriptions={{
            disabled: 'Detected players are not added to roster automatically.',
            enabled: 'Auto-adds detected players after match save at 83%+ confidence.',
        }}
    >
        <OptionCycler
            options={[
                { id: 'disabled', label: 'Disabled' },
                { id: 'enabled', label: 'Enabled on Match Save' },
            ]}
            value={autoPopulateRosterOnSave ? 'enabled' : 'disabled'}
            onChange={(id) => setAutoPopulateRosterOnSave(id === 'enabled')}
        />
    </SettingRow>
    <SettingRow
        label="Capture Framing"
        value="action"
        descriptions={{ action: 'Only use this when your capture framing is visibly off.' }}
    >
        <button
            type="button"
            onClick={() => setShowRoiEditor(true)}
            className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold uppercase"
        >
            Adjust OCR Boxes
        </button>
    </SettingRow>
</div>
```

**Step 2: Run tests**

```
npm test -- SettingsModal
```
Expected: PASS. If any existing tests check for the old card text (e.g. `"Capture Now, OCR Later"` or `"settings-quick-setup-grid"`), they should still pass since both the testid and the option labels are preserved.

**Step 3: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: replace capture section cards with OptionCycler rows"
```

---

### Task 5: Replace Telemetry Profile grid

**Files:**
- Modify: `src/components/SettingsModal.tsx` (around lines 1682–1714)

**Step 1: Replace the 3-button grid**

Find this block inside `activeSection === 'telemetry-monitoring'`:
```tsx
<div className="grid grid-cols-3 gap-2">
    {[
        { id: 'low-power' as TelemetryPerformanceProfile, label: 'Low Power', desc: 'Cooler, slower updates' },
        { id: 'balanced' as TelemetryPerformanceProfile, label: 'Balanced', desc: 'Recommended default' },
        { id: 'high-accuracy' as TelemetryPerformanceProfile, label: 'High Accuracy', desc: 'Faster, heavier polling' },
    ].map(opt => (
        <button
            key={opt.id}
            onClick={() => setTelemetryPerformanceProfile(opt.id)}
            disabled={adaptiveTelemetryPollingEnabled}
            className={`p-2.5 rounded-control text-center transition-all ${telemetryPerformanceProfile === opt.id
                ? 'md3-btn-filled ring-2 ring-md-sys-primary/40'
                : 'md3-btn-outlined'
                } disabled:opacity-disabled`}
            title={opt.desc}
        >
            <div className="text-label-sm font-bold">{opt.label}</div>
            <div className="text-label-sm opacity-60">{opt.desc}</div>
        </button>
    ))}
</div>
```

Replace with:
```tsx
<SettingRow
    label="Performance Profile"
    value={telemetryPerformanceProfile}
    descriptions={{
        'low-power': 'Cooler, slower updates.',
        'balanced': 'Recommended default.',
        'high-accuracy': 'Faster, heavier polling.',
    }}
>
    <SegmentedControl
        options={[
            { id: 'low-power', label: 'Low Power' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'high-accuracy', label: 'High Accuracy' },
        ]}
        value={telemetryPerformanceProfile}
        onChange={(id) => setTelemetryPerformanceProfile(id as TelemetryPerformanceProfile)}
        disabled={adaptiveTelemetryPollingEnabled}
    />
</SettingRow>
```

**Step 2: Run tests**

```
npm test -- SettingsModal
```
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: replace telemetry profile grid with SegmentedControl"
```

---

### Task 6: Replace OCR Learning Review Mode grid

**Files:**
- Modify: `src/components/SettingsModal.tsx` (around lines 1381–1401)

**Step 1: Replace the 3-button grid and its header**

Find this block inside the advanced OCR settings section:
```tsx
<div>
    <div className="text-label-sm font-semibold">Learning Review Policy</div>
    <div className="text-label-sm opacity-60">Control how often learned aliases are queued for confirmation</div>
</div>
<div className="grid grid-cols-3 gap-2">
    {([
        { id: 'conservative' as OcrLearningReviewMode, label: 'Conservative' },
        { id: 'balanced' as OcrLearningReviewMode, label: 'Balanced' },
        { id: 'aggressive' as OcrLearningReviewMode, label: 'Aggressive' },
    ] as const).map((mode) => (
        <button
            key={mode.id}
            onClick={() => setOcrLearningReviewMode(mode.id)}
            disabled={!ocrLearningEnabled}
            className={`p-2 rounded-control text-label-sm font-bold transition-all ${ocrLearningReviewMode === mode.id ? 'md3-btn-filled ring-2 ring-md-sys-primary/40' : 'md3-btn-outlined'} disabled:opacity-disabled`}
        >
            {mode.label}
        </button>
    ))}
</div>
```

Replace with:
```tsx
<SettingRow
    label="Learning Review Policy"
    value={ocrLearningReviewMode}
    descriptions={{
        conservative: 'Queue aliases frequently — confirm most changes manually.',
        balanced: 'Queue aliases only when uncertain about the mapping.',
        aggressive: 'Auto-apply aliases with minimal review.',
    }}
>
    <SegmentedControl
        options={[
            { id: 'conservative', label: 'Conservative' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'aggressive', label: 'Aggressive' },
        ]}
        value={ocrLearningReviewMode}
        onChange={(id) => setOcrLearningReviewMode(id as OcrLearningReviewMode)}
        disabled={!ocrLearningEnabled}
    />
</SettingRow>
```

**Step 2: Run full test suite**

```
npm test
```
Expected: All tests pass (no regressions).

**Step 3: Final commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: replace OCR review mode grid with SegmentedControl"
```
