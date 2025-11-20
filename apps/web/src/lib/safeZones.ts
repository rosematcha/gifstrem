import type { SafeZone } from '../types';

export function scaleSafeZones(
  zones: SafeZone[],
  fromSize: { width: number; height: number } | undefined,
  targetSize: { width: number; height: number },
): SafeZone[] {
  const baseWidth = Math.max(1, fromSize?.width ?? targetSize.width);
  const baseHeight = Math.max(1, fromSize?.height ?? targetSize.height);
  const scaleX = targetSize.width / baseWidth;
  const scaleY = targetSize.height / baseHeight;

  return zones.map((zone) => {
    const width = clamp(Math.round(zone.width * scaleX), 1, targetSize.width);
    const height = clamp(Math.round(zone.height * scaleY), 1, targetSize.height);
    const x = clamp(Math.round(zone.x * scaleX), 0, targetSize.width - width);
    const y = clamp(Math.round(zone.y * scaleY), 0, targetSize.height - height);
    return { x, y, width, height };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
