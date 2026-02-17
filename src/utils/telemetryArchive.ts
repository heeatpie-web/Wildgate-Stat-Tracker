/**
 * @module telemetryArchive
 * Shared helpers for normalizing archived telemetry payloads coming from
 * Electron IPC and local JSON files. Legacy payloads may be:
 * - raw event arrays
 * - objects with a `telemetry` array
 * - single event objects
 */

export interface TelemetryArchiveEvent extends Record<string, unknown> {
  ClientTimestamp?: number | string;
  timestamp?: number | string;
  EventTimestamp?: number | string;
  EventName?: string;
  eventName?: string;
  type?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTelemetryEvent = (value: unknown): value is TelemetryArchiveEvent => {
  if (!isRecord(value)) return false;
  return (
    'EventName' in value ||
    'eventName' in value ||
    'type' in value ||
    'event' in value ||
    'ClientTimestamp' in value ||
    'timestamp' in value ||
    'EventTimestamp' in value ||
    'Payload' in value
  );
};

const asTelemetryEventArray = (value: unknown): TelemetryArchiveEvent[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isTelemetryEvent);
};

export const normalizeTelemetryArchivePayload = (payload: unknown): TelemetryArchiveEvent[] => {
  if (Array.isArray(payload)) return asTelemetryEventArray(payload);
  if (!isRecord(payload)) return [];

  const telemetry = asTelemetryEventArray(payload.telemetry);
  if (telemetry.length > 0) return telemetry;
  if (isTelemetryEvent(payload)) return [payload];
  return [];
};

export const normalizeTelemetryArchiveCollection = (payload: unknown): TelemetryArchiveEvent[][] => {
  if (!Array.isArray(payload)) return [];
  if (payload.every(isTelemetryEvent)) {
    return [payload.filter(isTelemetryEvent)];
  }
  return payload
    .map((entry) => normalizeTelemetryArchivePayload(entry))
    .filter((events) => events.length > 0);
};

export const getTelemetryEventTimestamp = (event: TelemetryArchiveEvent): number => {
  const value = event.ClientTimestamp ?? event.timestamp ?? event.EventTimestamp;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
