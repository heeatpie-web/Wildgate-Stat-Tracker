import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock heavy child panels: we want to test RecordingView layout logic, not panel internals.
vi.mock('./recording/ActionPanel', () => ({
  ActionPanel: (props: any) => (
    <div data-testid="ActionPanel" data-props={JSON.stringify(props)}>
      ActionPanel
    </div>
  ),
}));

vi.mock('./recording/SquadronPanel', () => ({
  SquadronPanel: (props: any) => (
    <div data-testid="SquadronPanel" data-props={JSON.stringify(props)}>
      SquadronPanel
    </div>
  ),
}));

vi.mock('./recording/RosterPanel', () => ({
  RosterPanel: () => <div data-testid="RosterPanel">RosterPanel</div>,
}));

vi.mock('./recording/MissionPanel', () => ({
  MissionPanel: () => <div data-testid="MissionPanel">MissionPanel</div>,
}));

function setViewport(w: number, h: number) {
  (window as any).innerWidth = w;
  (window as any).innerHeight = h;
}

describe('RecordingView', () => {
  beforeEach(() => {
    // Reset to a stable viewport for each test; individual tests can override.
    setViewport(1920, 1080);
  });

  it('renders standard (wide + tall) layout with SquadronPanel primary and ActionPanel compact (no tab bar)', async () => {
    setViewport(1600, 1000);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    // Both panels visible simultaneously.
    expect(screen.getByTestId('SquadronPanel')).toBeInTheDocument();
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();

    // Compact tab bar should not exist in standard layout.
    expect(screen.queryByRole('button', { name: /actions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /loadout/i })).toBeNull();

    // Wide layout keeps the loadout panel slightly compact; ActionPanel stays compact.
    const squadProps = screen.getByTestId('SquadronPanel').getAttribute('data-props') || '';
    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(squadProps).toContain('"density":"compact"');
    expect(actionProps).toContain('"density":"compact"');

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root?.children[2]?.className).toContain('pl-1');
  }, 10000);

  it('renders compact left panel tabs on short heights and swaps Actions vs Loadout without scrolling the panel', async () => {
    // Short height triggers compact density (even on wide screens).
    setViewport(1600, 680);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('overflow-y-auto');

    // Compact tab bar exists (use first match in case of duplicates).
    const actionsBtns = screen.getAllByRole('button', { name: /actions/i });
    const loadoutBtns = screen.getAllByRole('button', { name: /loadout/i });
    const actionsBtn = actionsBtns[0];
    const loadoutBtn = loadoutBtns[0];
    expect(actionsBtn).toBeInTheDocument();
    expect(loadoutBtn).toBeInTheDocument();

    // Default compact tab is Actions: compact ActionPanel rendered, SquadronPanel not.
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('SquadronPanel')).toBeNull();

    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(actionProps).toContain('"density":"compact"');

    // Switch to Loadout: SquadronPanel rendered with compact density, ActionPanel removed.
    fireEvent.click(loadoutBtn);
    expect(screen.getByTestId('SquadronPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('ActionPanel')).toBeNull();

    const squadProps = screen.getByTestId('SquadronPanel').getAttribute('data-props') || '';
    expect(squadProps).toContain('"density":"compact"');

    // Switch back to Actions.
    fireEvent.click(actionsBtn);
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('SquadronPanel')).toBeNull();
  }, 10000);

  it('uses stacked layout on narrow widths with page-level scroll (not panel-level scroll)', async () => {
    setViewport(900, 900);
    const { RecordingView } = await import('./RecordingView');

    render(<RecordingView />);

    const root = document.querySelector('[data-tour="view-recording"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('overflow-y-auto');

    // Ensure we still render the left panel content (compact by definition in narrow mode).
    expect(screen.getAllByRole('button', { name: /actions/i })[0]).toBeInTheDocument();
    expect(screen.getByTestId('ActionPanel')).toBeInTheDocument();

    const actionProps = screen.getByTestId('ActionPanel').getAttribute('data-props') || '';
    expect(actionProps).toContain('"density":"compact"');

    // Stacked layout includes the other panels.
    expect(screen.getByTestId('RosterPanel')).toBeInTheDocument();
    expect(screen.getByTestId('MissionPanel')).toBeInTheDocument();
  });
});
