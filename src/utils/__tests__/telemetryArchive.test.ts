import { describe, expect, it } from 'vitest';
import {
  getTelemetryEventName,
  getTelemetryEventPayload,
  getTelemetryEventTimestamp,
  normalizeTelemetryArchiveCollection,
  normalizeTelemetryArchivePayload,
} from '../telemetryArchive';

describe('telemetryArchive helpers', () => {
  it('normalizes telemetry arrays and filters non-event entries', () => {
    const input = [
      { EventName: 'NebLoadingScreen', Payload: { event: { loadedMap: 'MapA' } } },
      { random: 'value' },
      123,
    ];

    const result = normalizeTelemetryArchivePayload(input);
    expect(result).toHaveLength(1);
    expect(result[0].EventName).toBe('NebLoadingScreen');
  });

  it('normalizes object payloads with telemetry arrays and single events', () => {
    const fromTelemetry = normalizeTelemetryArchivePayload({
      telemetry: [
        { eventName: 'NebClientMatchmakerStateChange', payload: { event: { ticketMatchPool: 'Artifact' } } },
        { nope: true },
      ],
    });
    expect(fromTelemetry).toHaveLength(1);
    expect(fromTelemetry[0].eventName).toBe('NebClientMatchmakerStateChange');

    const single = normalizeTelemetryArchivePayload({
      EventName: 'NebLoadoutSaved',
      Payload: { event: { bWasSavedInGame: true } },
    });
    expect(single).toHaveLength(1);
    expect(single[0].EventName).toBe('NebLoadoutSaved');
  });

  it('normalizes collection payloads from mixed archive shapes', () => {
    const result = normalizeTelemetryArchiveCollection([
      {
        telemetry: [{ EventName: 'One', Payload: { event: { key: 'value' } } }],
      },
      {
        EventName: 'Two',
        payload: { event: { another: 'field' } },
      },
      { random: 'skip-me' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(1);
    expect(result[0][0].EventName).toBe('One');
    expect(result[1][0].EventName).toBe('Two');
  });

  it('extracts timestamps and names with the expected precedence', () => {
    const event = {
      ClientTimestamp: '1700000100',
      timestamp: 1700000000,
      EventTimestamp: 1600000000,
      EventName: 'PrimaryName',
      eventName: 'SecondaryName',
      type: 'FallbackType',
    };

    expect(getTelemetryEventTimestamp(event)).toBe(1700000100);
    expect(getTelemetryEventName(event)).toBe('PrimaryName');
    expect(getTelemetryEventTimestamp({ timestamp: -10 })).toBe(0);
    expect(getTelemetryEventName({})).toBe('');
  });

  it('extracts event payload records from nested envelope variants', () => {
    const fromPayloadEvent = getTelemetryEventPayload({
      Payload: { event: { source: 'payload.event' } },
    });
    expect(fromPayloadEvent).toEqual({ source: 'payload.event' });

    const fromPayloadRoot = getTelemetryEventPayload({
      payload: { fromRoot: true },
    });
    expect(fromPayloadRoot).toEqual({ fromRoot: true });

    const fromEventRoot = getTelemetryEventPayload({
      event: { source: 'event.root' },
    });
    expect(fromEventRoot).toEqual({ source: 'event.root' });

    const empty = getTelemetryEventPayload({
      Payload: 'not-an-object',
      payload: 1,
      event: null,
    });
    expect(empty).toEqual({});
  });
});
