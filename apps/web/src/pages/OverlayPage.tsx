import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ResolutionSafeZone, SafeZone, Streamer, Submission } from '../types';

const RESOLUTION_SPECS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2160p': { width: 3840, height: 2160 },
} as const;

type OverlayResponse = {
  streamer: Streamer;
  submissions: Submission[];
};

type Pocket = {
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  maxSize: number;
  usage: number;
  usedArea: number;
  priority: number;
};

type DensityMap = {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  values: number[];
};

const SAFE_ZONE_PADDING = 32;
const EMPTY_SAFE_ZONE = { x: 0, y: 0, width: 0, height: 0 } as const;
const DENSITY_COLS = 4;
const DENSITY_ROWS = 3;

const OverlayPage = () => {
  const [search] = useSearchParams();
  const token = search.get('token');

  const query = useQuery({
    queryKey: ['overlay', token],
    queryFn: async () => {
      const response = await api.get<OverlayResponse>('/overlay/feed', { params: { token } });
      return response.data;
    },
    enabled: Boolean(token),
    refetchInterval: 4000,
  });

  const resolution = query.data?.streamer.settings?.preferredResolution ?? '1080p';
  const customResolution = query.data?.streamer.settings?.customResolution;
  const canvasSize = useMemo(() => {
    if (resolution === 'custom' && customResolution) {
      return customResolution;
    }
    if (resolution in RESOLUTION_SPECS) {
      return RESOLUTION_SPECS[resolution as keyof typeof RESOLUTION_SPECS];
    }
    return RESOLUTION_SPECS['720p'];
  }, [customResolution, resolution]);

  useEffect(() => {
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    document.body.style.margin = '0';
    return () => {
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, []);

  const safeZoneSetting = query.data?.streamer.settings?.safeZones?.[resolution];
  const safeZoneConfig = useMemo<ResolutionSafeZone>(() => {
    const fallbackZone: SafeZone = {
      x: Math.round(canvasSize.width * 0.25),
      y: Math.round(canvasSize.height * 0.2),
      width: Math.round(canvasSize.width * 0.5),
      height: Math.round(canvasSize.height * 0.6),
    };
    const legacyZone = safeZoneSetting ? (safeZoneSetting as { zone?: SafeZone }).zone : undefined;
    const normalizedZones =
      safeZoneSetting && Array.isArray(safeZoneSetting.zones) && safeZoneSetting.zones.length > 0
        ? safeZoneSetting.zones
        : legacyZone
          ? [legacyZone]
          : undefined;
    if (safeZoneSetting && normalizedZones) {
      return {
        zones: normalizedZones.slice(),
        size: safeZoneSetting.size ?? canvasSize,
        enabled: safeZoneSetting.enabled ?? true,
      };
    }
    return { zones: [fallbackZone], size: canvasSize, enabled: true };
  }, [canvasSize, safeZoneSetting]);
  const safeZoneEnabled = safeZoneSetting?.enabled ?? safeZoneConfig.enabled ?? true;
  const effectiveSafeZones = safeZoneEnabled ? safeZoneConfig.zones : [];
  const showSafeZone =
    safeZoneEnabled && (query.data?.streamer.settings?.showSafeZoneOverlay ?? false);

  const layout = useMemo(() => {
    if (!query.data) return [];
    const pockets = buildPockets(canvasSize, effectiveSafeZones);
    const densityMap = createDensityMap(canvasSize);
    const shortestSide = Math.min(canvasSize.width, canvasSize.height);
    const minStickerSize = Math.max(56, Math.round(shortestSide * 0.05));
    const maxStickerSize = Math.min(220, Math.round(shortestSide * 0.23));
    const availableArea = Math.max(
      1,
      pockets.reduce((total, pocket) => total + pocket.rect.width * pocket.rect.height, 0),
    );
    const areaPerItem = availableArea / Math.max(1, query.data.submissions.length);
    const adaptiveBase = Math.sqrt(areaPerItem) * 0.62;
    const baseSize = clamp(Math.max(shortestSide * 0.12, adaptiveBase), minStickerSize, maxStickerSize);
    const placements: { x: number; y: number; size: number }[] = [];
    const items = query.data.submissions.map((submission, index) => {
      const seedKey = `${submission.id}-${index}`;
      const pocket = selectPocket(pockets, index, seedKey, densityMap);
      const pocketCapacity = Math.max(40, Math.min(maxStickerSize, pocket.maxSize * 0.95));
      const minForPocket = Math.min(minStickerSize, pocketCapacity);
      const scale = randomFromHash(`${seedKey}-scale`, 0.78, 1.22);
      const desiredSize = clamp(baseSize * scale, Math.max(44, minForPocket * 0.9), pocketCapacity);
      const pocketPadding = Math.min(desiredSize * 0.18, 24);
      const offsetXRange = Math.max(1, pocket.rect.width - desiredSize - pocketPadding * 2);
      const offsetYRange = Math.max(1, pocket.rect.height - desiredSize - pocketPadding * 2);
      const offsetX =
        pocket.rect.x + pocketPadding + randomFromHash(`${seedKey}-offset-x-${pocket.usage}`, 0, offsetXRange);
      const offsetY =
        pocket.rect.y + pocketPadding + randomFromHash(`${seedKey}-offset-y-${pocket.usage}`, 0, offsetYRange);
      let rect = clampRect(
        {
        x: offsetX,
        y: offsetY,
        size: desiredSize,
        },
        canvasSize,
      );
      if (safeZoneEnabled) {
        rect = keepOutsideSafeZones(rect, effectiveSafeZones, canvasSize);
      }
      rect = resolveOverlaps(rect, placements, effectiveSafeZones, canvasSize, seedKey, safeZoneEnabled);
      placements.push(rect);
      pocket.usage += 1;
      pocket.usedArea += rect.size * rect.size;
      applyDensity(densityMap, rect);
      const rotationSignSeed = randomFromHash(`${seedKey}-rotation-sign`, 0, 1) >= 0.5 ? 1 : -1;
      const rotationMagnitude = randomFromHash(`${seedKey}-rotation-mag`, 3, 13);
      const flattenChance = randomFromHash(`${seedKey}-rotation-flat`, 0, 1);
      const rotation = flattenChance > 0.9 ? 0 : rotationSignSeed * rotationMagnitude;
      return {
        id: submission.id,
        submission,
        x: rect.x,
        y: rect.y,
        size: rect.size,
        rotation,
        zIndex: 0,
      };
    });

    const layered = [...items].sort((a, b) => a.size - b.size);
    layered.forEach((item, idx) => {
      item.zIndex = 200 + idx;
    });

    return items;
  }, [canvasSize, query.data, safeZoneEnabled, safeZoneConfig.zones]);

  if (!token) {
    return <div className="p-8 text-center text-red-400">Missing overlay token.</div>;
  }

  if (query.isLoading) {
    return <div className="p-8 text-center text-white">Loading overlay…</div>;
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <div className="p-8 text-center text-red-400">
        Unable to load overlay feed. {message}. Check that your backend is running and the token is valid.
      </div>
    );
  }

  if (!query.data) {
    return <div className="p-8 text-center text-white">Loading overlay…</div>;
  }

  return (
    <div
      className="flex items-center justify-center bg-transparent"
      style={{ width: canvasSize.width, height: canvasSize.height }}
    >
      <div className="relative h-full w-full bg-transparent">
        {showSafeZone &&
          safeZoneConfig.zones.map((zone, index) => (
            <div
              key={`safe-zone-${index}`}
              className="absolute border-2 border-emerald-400/70 bg-emerald-400/10"
              style={{
                left: zone.x,
                top: zone.y,
                width: zone.width,
                height: zone.height,
              }}
            />
          ))}
        {layout.map((item) => (
          <img
            key={item.id}
            src={item.submission.fileUrl}
            alt={item.submission.uploaderName}
            style={{
              position: 'absolute',
              left: item.x,
              top: item.y,
              width: item.size,
              zIndex: item.zIndex,
              transform: `rotate(${item.rotation}deg)`,
            }}
            className="drop-shadow-[0_10px_25px_rgba(15,15,30,0.7)] transition-all duration-500"
          />
        ))}
      </div>
    </div>
  );
};

function buildPockets(canvas: { width: number; height: number }, safeZones: SafeZone[]): Pocket[] {
  const margin = 28;
  const baseRect = {
    x: margin,
    y: margin,
    width: Math.max(0, canvas.width - margin * 2),
    height: Math.max(0, canvas.height - margin * 2),
  };
  if (baseRect.width <= 0 || baseRect.height <= 0) {
    return [
      createPocket(
        'fallback',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        Math.max(80, Math.min(canvas.width, canvas.height)),
        1,
      ),
    ];
  }
  const paddedZones = safeZones.map((zone) => padSafeZone(zone, SAFE_ZONE_PADDING, canvas));
  let availableRects = [baseRect];
  for (const zone of paddedZones) {
    availableRects = availableRects.flatMap((rect) => subtractRect(rect, zone));
  }
  if (availableRects.length === 0) {
    availableRects = [baseRect];
  }
  const pockets = availableRects
    .filter((rect) => rect.width > 32 && rect.height > 32)
    .map((rect, index) => {
      const area = rect.width * rect.height;
      const priorityBase = Math.min(1.4, 0.9 + area / Math.max(1, canvas.width * canvas.height));
      return createPocket(
        `pocket-${index}`,
        rect,
        Math.max(70, Math.min(rect.width, rect.height)),
        priorityBase,
      );
    })
    .flatMap((pocket) => subdividePocket(pocket));
  if (pockets.length === 0) {
    return [
      createPocket(
        'fallback',
        baseRect,
        Math.max(90, Math.min(baseRect.width, baseRect.height)),
        1,
      ),
    ];
  }
  return pockets;
}

function subtractRect(
  source: { x: number; y: number; width: number; height: number },
  cut: { x: number; y: number; width: number; height: number },
) {
  const intersection = intersectRect(source, cut);
  if (!intersection) {
    return [source];
  }
  const remainder: { x: number; y: number; width: number; height: number }[] = [];
  const sourceRight = source.x + source.width;
  const sourceBottom = source.y + source.height;
  const intersectRight = intersection.x + intersection.width;
  const intersectBottom = intersection.y + intersection.height;

  if (intersection.y > source.y) {
    remainder.push({
      x: source.x,
      y: source.y,
      width: source.width,
      height: intersection.y - source.y,
    });
  }
  if (intersectBottom < sourceBottom) {
    remainder.push({
      x: source.x,
      y: intersectBottom,
      width: source.width,
      height: sourceBottom - intersectBottom,
    });
  }
  if (intersection.x > source.x) {
    remainder.push({
      x: source.x,
      y: intersection.y,
      width: intersection.x - source.x,
      height: intersection.height,
    });
  }
  if (intersectRight < sourceRight) {
    remainder.push({
      x: intersectRight,
      y: intersection.y,
      width: sourceRight - intersectRight,
      height: intersection.height,
    });
  }

  return remainder.filter((rect) => rect.width > 1 && rect.height > 1);
}

function intersectRect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function createDensityMap(canvas: { width: number; height: number }): DensityMap {
  const cols = DENSITY_COLS;
  const rows = DENSITY_ROWS;
  return {
    cols,
    rows,
    cellWidth: canvas.width / cols,
    cellHeight: canvas.height / rows,
    values: new Array(cols * rows).fill(0),
  };
}

function sampleDensity(map: DensityMap, rect: { x: number; y: number; width: number; height: number }) {
  let total = 0;
  let samples = 0;
  const startCol = Math.max(0, Math.floor(rect.x / map.cellWidth));
  const endCol = Math.min(map.cols - 1, Math.floor((rect.x + rect.width) / map.cellWidth));
  const startRow = Math.max(0, Math.floor(rect.y / map.cellHeight));
  const endRow = Math.min(map.rows - 1, Math.floor((rect.y + rect.height) / map.cellHeight));

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      samples += 1;
      total += map.values[row * map.cols + col] ?? 0;
    }
  }
  return samples === 0 ? 0 : Math.min(1, total / samples);
}

function applyDensity(map: DensityMap, rect: { x: number; y: number; size: number }) {
  const width = rect.size;
  const height = rect.size;
  const startCol = Math.max(0, Math.floor(rect.x / map.cellWidth));
  const endCol = Math.min(map.cols - 1, Math.floor((rect.x + width) / map.cellWidth));
  const startRow = Math.max(0, Math.floor(rect.y / map.cellHeight));
  const endRow = Math.min(map.rows - 1, Math.floor((rect.y + height) / map.cellHeight));
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cellIndex = row * map.cols + col;
      const cellX1 = col * map.cellWidth;
      const cellY1 = row * map.cellHeight;
      const cellX2 = cellX1 + map.cellWidth;
      const cellY2 = cellY1 + map.cellHeight;

      const overlapWidth = Math.max(0, Math.min(rect.x + width, cellX2) - Math.max(rect.x, cellX1));
      const overlapHeight = Math.max(0, Math.min(rect.y + height, cellY2) - Math.max(rect.y, cellY1));
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea <= 0) continue;
      const cellArea = map.cellWidth * map.cellHeight;
      const contribution = overlapArea / cellArea;
      map.values[cellIndex] = Math.min(1, map.values[cellIndex] + contribution);
    }
  }
}

function createPocket(
  name: string,
  rect: { x: number; y: number; width: number; height: number },
  maxSize: number,
  priority = 1,
): Pocket {
  const boundedMax = Math.max(48, Math.min(maxSize, rect.width, rect.height));
  return {
    name,
    rect,
    maxSize: boundedMax,
    usage: 0,
    usedArea: 0,
    priority,
  };
}

function subdividePocket(pocket: Pocket) {
  const rect = pocket.rect;
  const segments: Pocket[] = [];
  const aspectRatio = rect.width / Math.max(1, rect.height);
  const inverseAspectRatio = rect.height / Math.max(1, rect.width);
  const maxSlices = 4;
  const targetSize = 260;
  const columns =
    aspectRatio > 1.2 ? Math.min(maxSlices, Math.max(1, Math.round(rect.width / targetSize) || 1)) : 1;
  const rows =
    inverseAspectRatio > 1.2 ? Math.min(maxSlices, Math.max(1, Math.round(rect.height / targetSize) || 1)) : 1;

  if (columns === 1 && rows === 1) {
    return [pocket];
  }

  const sliceWidth = rect.width / columns;
  const sliceHeight = rect.height / rows;
  const gapX = columns > 1 ? Math.min(22, sliceWidth * 0.18) : 0;
  const gapY = rows > 1 ? Math.min(22, sliceHeight * 0.18) : 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const width = sliceWidth - gapX;
      const height = sliceHeight - gapY;
      if (width < 60 || height < 60) {
        continue;
      }
      const segmentRect = {
        x: rect.x + col * sliceWidth + gapX / 2,
        y: rect.y + row * sliceHeight + gapY / 2,
        width,
        height,
      };
      segments.push(
        createPocket(`${pocket.name}-${segments.length}`, segmentRect, pocket.maxSize, pocket.priority + 0.05),
      );
    }
  }

  return segments.length > 0 ? segments : [pocket];
}

function keepOutsideSingleZone(
  rect: { x: number; y: number; size: number },
  safeZone: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
) {
  const paddedZone = padSafeZone(safeZone, SAFE_ZONE_PADDING, canvas);
  const candidate = clampRect(rect, canvas);
  if (!rectsOverlap(candidate, paddedZone)) {
    return candidate;
  }

  const spaces = [
    {
      name: 'left',
      available: paddedZone.x,
      compute: () => ({
        x: Math.max(0, paddedZone.x - candidate.size - SAFE_ZONE_PADDING),
        y: clamp(candidate.y, SAFE_ZONE_PADDING, canvas.height - candidate.size - SAFE_ZONE_PADDING),
      }),
    },
    {
      name: 'right',
      available: canvas.width - (paddedZone.x + paddedZone.width),
      compute: () => ({
        x: Math.min(
          canvas.width - candidate.size - SAFE_ZONE_PADDING,
          paddedZone.x + paddedZone.width + SAFE_ZONE_PADDING,
        ),
        y: clamp(candidate.y, SAFE_ZONE_PADDING, canvas.height - candidate.size - SAFE_ZONE_PADDING),
      }),
    },
    {
      name: 'top',
      available: paddedZone.y,
      compute: () => ({
        x: clamp(candidate.x, SAFE_ZONE_PADDING, canvas.width - candidate.size - SAFE_ZONE_PADDING),
        y: Math.max(0, paddedZone.y - candidate.size - SAFE_ZONE_PADDING),
      }),
    },
    {
      name: 'bottom',
      available: canvas.height - (paddedZone.y + paddedZone.height),
      compute: () => ({
        x: clamp(candidate.x, SAFE_ZONE_PADDING, canvas.width - candidate.size - SAFE_ZONE_PADDING),
        y: Math.min(
          canvas.height - candidate.size - SAFE_ZONE_PADDING,
          paddedZone.y + paddedZone.height + SAFE_ZONE_PADDING,
        ),
      }),
    },
  ];

  const candidates = spaces
    .filter((space) => space.available > SAFE_ZONE_PADDING)
    .map((space) => {
      const next = space.compute();
      const sizeLimit = Math.min(candidate.size, space.available - SAFE_ZONE_PADDING / 2);
      const size = Math.max(48, Math.min(candidate.size, sizeLimit));
      return {
        rect: clampRect({ x: next.x, y: next.y, size }, canvas),
        clearance: space.available,
      };
    })
    .filter((option) => option.rect.size >= 48 && !rectsOverlap(option.rect, paddedZone));

  if (candidates.length > 0) {
    const best = candidates.reduce((prev, current) => (current.clearance > prev.clearance ? current : prev));
    return best.rect;
  }

  if (candidate.size <= 48) {
    const fallback = clampRect(
      {
        x: SAFE_ZONE_PADDING,
        y: SAFE_ZONE_PADDING,
        size: candidate.size,
      },
      canvas,
    );
    if (!rectsOverlap(fallback, paddedZone)) {
      return fallback;
    }
    return clampRect(
      {
        x: canvas.width - candidate.size - SAFE_ZONE_PADDING,
        y: SAFE_ZONE_PADDING,
        size: candidate.size,
      },
      canvas,
    );
  }

  return keepOutsideSingleZone(
    {
      x: candidate.x,
      y: candidate.y,
      size: Math.max(48, candidate.size * 0.85),
    },
    safeZone,
    canvas,
  );
}

function keepOutsideSafeZones(
  rect: { x: number; y: number; size: number },
  safeZones: SafeZone[],
  canvas: { width: number; height: number },
) {
  if (safeZones.length === 0) {
    return clampRect(rect, canvas);
  }
  let candidate = clampRect(rect, canvas);
  const paddedZones = safeZones.map((zone) => padSafeZone(zone, SAFE_ZONE_PADDING, canvas));
  for (let attempt = 0; attempt < Math.max(1, paddedZones.length) * 2; attempt += 1) {
    let moved = false;
    for (const zone of paddedZones) {
      const next = keepOutsideSingleZone(candidate, zone, canvas);
      if (next.x !== candidate.x || next.y !== candidate.y) {
        moved = true;
      }
      candidate = next;
    }
    if (!paddedZones.some((zone) => rectsOverlap(candidate, zone))) {
      return candidate;
    }
    if (!moved) {
      break;
    }
  }
  return candidate;
}

function selectPocket(pockets: Pocket[], index: number, seed: string, density: DensityMap) {
  if (pockets.length === 0) {
    return createPocket(
      'fallback',
      {
        x: 16,
        y: 16,
        width: 240,
        height: 240,
      },
      160,
      1,
    );
  }

  const scored = pockets
    .map((pocket) => {
      const area = pocket.rect.width * pocket.rect.height;
      const freeArea = Math.max(1, area - pocket.usedArea);
      const usagePenalty = pocket.usage * pocket.maxSize * 120;
      const saturationPenalty = pocket.usedArea / Math.max(1, area);
      const noise = randomFromHash(`${seed}-${pocket.name}-jitter`, -40, 40);
      const densityFactor = 1 - sampleDensity(density, pocket.rect);
      const score = freeArea * pocket.priority * densityFactor - usagePenalty - saturationPenalty * 120 + noise;
      return { pocket, score };
    })
    .sort((a, b) => b.score - a.score);

  const candidatePool = scored.slice(0, Math.min(4, scored.length));
  const randomPickIndex = Math.floor(
    randomFromHash(`${seed}-pocket-choice-${index}`, 0, 0.999) * candidatePool.length,
  );
  return candidatePool[randomPickIndex]?.pocket ?? scored[0].pocket;
}

function randomFromHash(seed: string, min = 0, max = 1) {
  const hash = hashString(seed);
  const fraction = Math.abs(Math.sin(hash) * 10000) % 1;
  return min + (max - min) * fraction;
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const MAX_OVERLAP_RATIO = 0.03;

function resolveOverlaps(
  rect: { x: number; y: number; size: number },
  existing: { x: number; y: number; size: number }[],
  safeZones: SafeZone[],
  canvas: { width: number; height: number },
  seed = '',
  respectSafeZone = true,
) {
  if (existing.length === 0) {
    return rect;
  }

  let size = rect.size;
  let bestCandidate = rect;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let shrink = 0; shrink < 6; shrink += 1) {
    const shift = size * (0.6 - shrink * 0.06);
    const offsets = [{ dx: 0, dy: 0 }, { dx: shift, dy: 0 }, { dx: -shift, dy: 0 }, { dx: 0, dy: shift }, { dx: 0, dy: -shift }];
    const steps = 14;
    for (let i = 0; i < steps; i += 1) {
      const angle =
        (i / steps) * Math.PI * 2 + randomFromHash(`${seed}-overlap-${rect.x}-${rect.y}-${shrink}-${i}`, 0, Math.PI / 6);
      offsets.push({
        dx: Math.cos(angle) * shift,
        dy: Math.sin(angle) * shift,
      });
    }

    for (const offset of offsets) {
      let candidate = clampRect(
        {
          x: rect.x + offset.dx,
          y: rect.y + offset.dy,
        size,
      },
      canvas,
    );
    if (respectSafeZone) {
      candidate = keepOutsideSafeZones(candidate, safeZones, canvas);
    }
    const score = overlapScore(candidate, existing);
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
      }
      if (score <= MAX_OVERLAP_RATIO) {
        return candidate;
      }
    }

    size = Math.max(44, size * 0.86);
  }

  return findLowOverlapPlacement(bestCandidate, existing, safeZones, canvas, seed, respectSafeZone);
}

function clampRect(rect: { x: number; y: number; size: number }, canvas: { width: number; height: number }) {
  return {
    x: clamp(rect.x, 0, canvas.width - rect.size),
    y: clamp(rect.y, 0, canvas.height - rect.size),
    size: rect.size,
  };
}

function isAcceptable(
  rect: { x: number; y: number; size: number },
  existing: { x: number; y: number; size: number }[],
) {
  return existing.every((placed) => overlapRatio(rect, placed) <= MAX_OVERLAP_RATIO);
}

function overlapArea(
  a: { x: number; y: number; size: number },
  b: { x: number; y: number; size: number },
) {
  const width = Math.max(
    0,
    Math.min(a.x + a.size, b.x + b.size) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y),
  );
  return width * height;
}

function overlapRatio(
  a: { x: number; y: number; size: number },
  b: { x: number; y: number; size: number },
) {
  const overlap = overlapArea(a, b);
  if (overlap === 0) return 0;
  const areaA = a.size * a.size;
  const areaB = b.size * b.size;
  return overlap / Math.min(areaA, areaB);
}

function overlapScore(candidate: { x: number; y: number; size: number }, existing: { x: number; y: number; size: number }[]) {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((placed) => overlapRatio(candidate, placed)));
}

function findLowOverlapPlacement(
  seedCandidate: { x: number; y: number; size: number },
  existing: { x: number; y: number; size: number }[],
  safeZones: SafeZone[],
  canvas: { width: number; height: number },
  seed: string,
  respectSafeZone = true,
) {
  let best = seedCandidate;
  let bestScore = overlapScore(seedCandidate, existing);
  const attempts = 42;
  if (bestScore <= MAX_OVERLAP_RATIO) {
    return seedCandidate;
  }

  const widthLimit = canvas.width - seedCandidate.size;
  const heightLimit = canvas.height - seedCandidate.size;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const offsetSeed = `${seed}-fallback-${attempt}`;
    const randomColumn = randomFromHash(`${offsetSeed}-x`, 0, widthLimit);
    const randomRow = randomFromHash(`${offsetSeed}-y`, 0, heightLimit);
    let candidate = clampRect({ x: randomColumn, y: randomRow, size: seedCandidate.size }, canvas);
    if (respectSafeZone) {
      candidate = keepOutsideSafeZones(candidate, safeZones, canvas);
    }
    const score = overlapScore(candidate, existing);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (score <= MAX_OVERLAP_RATIO * 0.8) {
      return candidate;
    }
  }

  return best;
}

function padSafeZone(
  safeZone: { x: number; y: number; width: number; height: number },
  padding: number,
  canvas: { width: number; height: number },
) {
  const x = clamp(safeZone.x - padding, 0, canvas.width);
  const y = clamp(safeZone.y - padding, 0, canvas.height);
  const width = Math.min(canvas.width - x, safeZone.width + padding * 2);
  const height = Math.min(canvas.height - y, safeZone.height + padding * 2);
  return { x, y, width, height };
}

function rectsOverlap(
  a: { x: number; y: number; width?: number; height?: number; size?: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const widthA = typeof a.size === 'number' ? a.size : a.width ?? 0;
  const heightA = typeof a.size === 'number' ? a.size : a.height ?? 0;
  return a.x < b.x + b.width && a.x + widthA > b.x && a.y < b.y + b.height && a.y + heightA > b.y;
}

export default OverlayPage;
