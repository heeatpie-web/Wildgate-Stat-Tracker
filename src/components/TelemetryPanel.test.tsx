import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TelemetryPanel } from './TelemetryPanel';

describe('TelemetryPanel status summary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not duplicate SystemPulse receiving/connected/offline badges', () => {
    render(
      <TelemetryPanel
        logFeed={[]}
        logStatus={{
          exists: true,
          lastEventAt: Date.now() - 1_000,
        }}
        onClear={() => {}}
      />
    );

    expect(screen.getByText('Live Diagnostics')).toBeInTheDocument();
    expect(screen.queryByText('RECEIVING')).not.toBeInTheDocument();
    expect(screen.queryByText('CONNECTED')).not.toBeInTheDocument();
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument();
  });

  it('shows last check and last event diagnostics', () => {
    const checkTimestamp = Date.parse('2026-01-01T00:00:05.000Z');
    const eventTimestamp = Date.parse('2026-01-01T00:00:03.000Z');
    const expectedCheckLabel = new Date(checkTimestamp).toLocaleTimeString([], { hour12: false });
    const expectedEventLabel = new Date(eventTimestamp).toLocaleTimeString([], { hour12: false });

    render(
      <TelemetryPanel
        logFeed={[]}
        logStatus={{
          exists: true,
          size: 4096,
          lastCheck: checkTimestamp,
          lastEventAt: eventTimestamp,
        }}
        onClear={() => {}}
      />
    );

    expect(screen.getByText('Buffer')).toBeInTheDocument();
    expect(screen.getByText('Last Check')).toBeInTheDocument();
    expect(screen.getByText('Last Event')).toBeInTheDocument();
    expect(screen.getByText('4.0 KB')).toBeInTheDocument();
    expect(screen.getByText(expectedCheckLabel)).toBeInTheDocument();
    expect(screen.getByText(expectedEventLabel)).toBeInTheDocument();
  });

  it('uses placeholder timestamps when checks and events are unavailable', () => {
    render(
      <TelemetryPanel
        logFeed={[]}
        logStatus={{ exists: false }}
        onClear={() => {}}
      />
    );

    expect(screen.getAllByText('--:--:--').length).toBeGreaterThanOrEqual(2);
  });
});
