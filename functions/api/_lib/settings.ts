import type { ResolutionSafeZone, SafeZone, SettingsShape } from './types';

const DEFAULT_ANIMATION = { type: 'pop', durationMs: 600 } as const;
const DEFAULT_SIZE = { width: 1920, height: 1080 } as const;
const DEFAULT_ROTATION_ENABLED = true;

export function ensureSettings(payload: string | null | undefined): SettingsShape {
  let parsed: unknown;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      parsed = null;
    }
  } else {
    parsed = payload ?? null;
  }

  const safeZones: Record<string, ResolutionSafeZone> = {};
  if (parsed && typeof parsed === 'object' && 'safeZones' in parsed) {
    const raw = (parsed as Record<string, unknown>).safeZones;
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const normalized = normalizeResolutionSafeZone(value);
        if (normalized) {
          safeZones[key] = normalized;
        }
      }
    }
  }

  const animation = normalizeAnimation(parsed);
  const showSafeZoneOverlay =
    parsed && typeof parsed === 'object' && 'showSafeZoneOverlay' in parsed
      ? typeof (parsed as Record<string, unknown>).showSafeZoneOverlay === 'boolean'
        ? ((parsed as Record<string, unknown>).showSafeZoneOverlay as boolean)
        : undefined
      : undefined;
  const rotationEnabled = normalizeRotationEnabled(parsed);
  const preferredResolution = normalizePreferredResolution(parsed);
  const customResolution = normalizeCustomResolution(parsed);

  return {
    safeZones,
    animation,
    showSafeZoneOverlay,
    rotationEnabled,
    preferredResolution,
    customResolution,
  };
}

function normalizeResolutionSafeZone(entry: unknown): ResolutionSafeZone | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const safeEntry = entry as Record<string, unknown>;
  const size = normalizeSize(safeEntry.size);
  const zones = normalizeZonesArray(safeEntry);
  const enabled =
    typeof safeEntry.enabled === 'boolean' ? safeEntry.enabled : undefined;
  return {
    zones: zones.length > 0 ? zones : [defaultZoneForSize(size)],
    size,
    enabled,
  };
}

function normalizeZonesArray(entry: Record<string, unknown>): SafeZone[] {
  if (Array.isArray(entry.zones)) {
    const zones = entry.zones
      .map((zone) => normalizeZone(zone))
      .filter((zone): zone is SafeZone => Boolean(zone));
    if (zones.length > 0) {
      return zones;
    }
  }
  if (entry.zone) {
    const single = normalizeZone(entry.zone);
    if (single) {
      return [single];
    }
  }
  return [];
}

function normalizeZone(zone: unknown): SafeZone | null {
  if (!zone || typeof zone !== 'object') return null;
  const payload = zone as Record<string, unknown>;
  const x = numberOrNull(payload.x);
  const y = numberOrNull(payload.y);
  const width = numberOrNull(payload.width);
  const height = numberOrNull(payload.height);
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function normalizeSize(size: unknown) {
  if (size && typeof size === 'object') {
    const payload = size as Record<string, unknown>;
    const width = numberOrNull(payload.width);
    const height = numberOrNull(payload.height);
    if (width && height) {
      return { width, height };
    }
  }
  return { ...DEFAULT_SIZE };
}

function defaultZoneForSize(size: { width: number; height: number }): SafeZone {
  return {
    x: Math.round(size.width * 0.25),
    y: Math.round(size.height * 0.2),
    width: Math.round(size.width * 0.5),
    height: Math.round(size.height * 0.6),
  };
}

function normalizeAnimation(payload: unknown) {
  if (payload && typeof payload === 'object' && 'animation' in payload) {
    const animation = (payload as Record<string, unknown>).animation;
    if (animation && typeof animation === 'object') {
      const value = animation as Record<string, unknown>;
      const type =
        typeof value.type === 'string' ? value.type : DEFAULT_ANIMATION.type;
      const durationMs =
        typeof value.durationMs === 'number'
          ? value.durationMs
          : DEFAULT_ANIMATION.durationMs;
      return { type, durationMs };
    }
  }
  return { ...DEFAULT_ANIMATION };
}

function normalizeRotationEnabled(payload: unknown) {
  if (payload && typeof payload === 'object' && 'rotationEnabled' in payload) {
    const value = (payload as Record<string, unknown>).rotationEnabled;
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return DEFAULT_ROTATION_ENABLED;
}

function normalizePreferredResolution(payload: unknown) {
  const allowed = new Set(['720p', '1080p', '2160p', 'custom']);
  if (payload && typeof payload === 'object' && 'preferredResolution' in payload) {
    const pref = (payload as Record<string, unknown>).preferredResolution;
    if (typeof pref === 'string' && allowed.has(pref)) {
      return pref as SettingsShape['preferredResolution'];
    }
  }
  return undefined;
}

function normalizeCustomResolution(payload: unknown) {
  if (payload && typeof payload === 'object' && 'customResolution' in payload) {
    const resolution = (payload as Record<string, unknown>).customResolution;
    if (resolution && typeof resolution === 'object') {
      const width = numberOrNull((resolution as Record<string, unknown>).width);
      const height = numberOrNull((resolution as Record<string, unknown>).height);
      if (width && height) {
        return { width, height };
      }
    }
  }
  return undefined;
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
