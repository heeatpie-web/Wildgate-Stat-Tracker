import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  getMatchEra: vi.fn(() => ''),
  getMatchEquipment: vi.fn(() => []),
  getMatchPerks: vi.fn(() => []),
  getMatchProspectorWeapons: vi.fn(() => []),
  getMatchShip: vi.fn(() => 'Hunter'),
}));

describe('AnalyticsShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the inline All Updates label instead of the old Game Patch History heading', async () => {
    const { AnalyticsShell } = await import('./AnalyticsShell');
    render(<AnalyticsShell />);

    expect(screen.queryByText(/game patch history/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /all updates/i }));

    expect(screen.getByText('All Updates')).toBeInTheDocument();
    expect(screen.getByText(/select an era filter to view updates/i)).toBeInTheDocument();
  });
});
