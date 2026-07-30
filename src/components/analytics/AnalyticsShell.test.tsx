import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const analyticsData = {
  filteredMatches: [
    {
      id: 1,
      timestamp: 1_700_000_000_000,
      date: '2026-02-17',
      mode: 'Artifact Brawl',
      player: 'Pilot',
      teammates: ['Wingman'],
      opponents: ['Enemy'],
      hero: 'Adrian',
      ship: 'Hunter',
      loadout: {
        hero: 'Adrian',
        ship: 'Hunter',
        weapons: [],
        equipment: [],
        characterWeapons: [],
        characterEquipment: [],
        perks: [],
      },
      reachModifiers: [],
      kills: {},
      result: 'Win',
      subType: 'Combat',
    },
  ],
  winRate: 50,
  momentum: { currentMomentum: 10 },
  placementData: { avgPlacement: 3 },
  sessionSummary: {},
  periodComparison: {},
  timePatterns: {},
  streakHistory: {},
  killEfficiency: {},
  insights: [],
  relationshipInsights: [],
  socialData: {},
  playerProfiles: {},
  entityAnalytics: {},
  synergyMatrix: [],
  currentStreak: 0,
};

vi.mock('../../providers/GameDataProvider', () => ({
  useGameData: () => ({
    setDrillDownTarget: vi.fn(),
  }),
}));

vi.mock('../../providers/UIStateProvider', () => ({
  useUIState: () => ({
    activeMode: 'Artifact Brawl',
    activeUser: 'Pilot',
  }),
}));

vi.mock('../../providers/UserPreferencesProvider', () => ({
  useUserPreferences: () => ({
    language: 'en',
    visualMode: 'editorial',
    setVisualMode: vi.fn(),
  }),
}));

vi.mock('./useAnalyticsData', () => ({
  useAnalyticsData: () => analyticsData,
}));

vi.mock('./DenseEditorialToggle', () => ({
  InlineNarrativeToggle: () => <div data-testid="inline-toggle" />,
}));

vi.mock('./analyticsExport', () => ({
  exportAnalyticsAsImage: vi.fn(),
}));

vi.mock('./AnalyticsCockpit', () => ({
  AnalyticsCockpit: () => <div data-testid="analytics-cockpit" />,
}));

vi.mock('./ControlPanelView', () => ({
  ControlPanelView: () => <div data-testid="control-panel-view" />,
}));

vi.mock('./EnvironmentView', () => ({
  EnvironmentView: () => <div data-testid="environment-view" />,
}));

vi.mock('./SynergyView', () => ({
  SynergyView: () => <div data-testid="synergy-view" />,
}));

vi.mock('./InsightsView', () => ({
  InsightsView: () => <div data-testid="insights-view" />,
}));

vi.mock('./SocialView', () => ({
  SocialView: () => <div data-testid="social-view" />,
}));

vi.mock('./TimePatternView', () => ({
  TimePatternView: () => <div data-testid="time-patterns-view" />,
}));

vi.mock('./StreakTimelineView', () => ({
  StreakTimelineView: () => <div data-testid="streaks-view" />,
}));

vi.mock('./SessionSummaryView', () => ({
  SessionSummaryView: () => <div data-testid="session-summary-view" />,
}));

vi.mock('./PeriodComparisonView', () => ({
  PeriodComparisonView: () => <div data-testid="period-view" />,
}));

vi.mock('./KillEfficiencyView', () => ({
  KillEfficiencyView: () => <div data-testid="kill-efficiency-view" />,
}));

vi.mock('./PlacementDistView', () => ({
  PlacementDistView: () => <div data-testid="placement-view" />,
}));

vi.mock('./MomentumView', () => ({
  MomentumView: () => <div data-testid="momentum-view" />,
}));

vi.mock('./VisualEssayView', () => ({
  VisualEssayView: () => <div data-testid="essay-view" />,
}));

vi.mock('./AnalyticsNavigation', () => ({
  AnalyticsNavigation: () => <div data-testid="analytics-nav" />,
}));

vi.mock('./EntityAnalyticsView', () => ({
  EntityAnalyticsView: () => <div data-testid="entity-view" />,
}));

vi.mock('../patch/patchEntityCatalog', () => ({
  getMatchUpdateKey: vi.fn(() => 'drill-charge-ram-bastion-2026-03-12'),
  getMatchEquipment: vi.fn(() => []),
  getMatchPerks: vi.fn(() => []),
  getMatchProspectorWeapons: vi.fn(() => []),
  getMatchShip: vi.fn(() => 'Hunter'),
  getKnownMatchCategories: vi.fn(() => []),
}));

describe('AnalyticsShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the filter bar in the shared shell header on overview', async () => {
    const { AnalyticsShell } = await import('./AnalyticsShell');
    render(<AnalyticsShell />);

    expect(screen.getByRole('heading', { name: /analytics cockpit/i }).closest('.twilight-solid-scope')).not.toBeNull();
    expect(screen.getByTestId('analytics-cockpit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^filters$/i }));
    expect(screen.getByRole('option', { name: /all updates/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /drill charge \/ ram bastion - 3\/12\/2026/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all updates/i })).toBeNull();
    expect(screen.queryByText(/game patch history/i)).toBeNull();
  });

  it('ignores external navigation while inactive and preserves the current view', async () => {
    const { AnalyticsShell } = await import('./AnalyticsShell');
    const { rerender } = render(<AnalyticsShell />);

    act(() => {
      window.dispatchEvent(new CustomEvent('analytics:navigate-view', {
        detail: { view: 'social' },
      }));
    });

    expect(screen.getByTestId('social-view')).toBeInTheDocument();

    rerender(<AnalyticsShell isActive={false} />);
    expect(screen.getByTestId('social-view')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('analytics:navigate-view', {
        detail: { view: 'momentum' },
      }));
    });

    expect(screen.getByTestId('social-view')).toBeInTheDocument();
    expect(screen.queryByTestId('momentum-view')).toBeNull();
  });
});
