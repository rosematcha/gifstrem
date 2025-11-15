export type SafeZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResolutionSafeZone = {
  zone: SafeZone;
  size: { width: number; height: number };
  enabled?: boolean;
};

export type StreamerSettings = {
  safeZones: Record<string, ResolutionSafeZone>;
  animation: { type: string; durationMs: number };
  showSafeZoneOverlay?: boolean;
  preferredResolution?: '720p' | '1080p' | '2160p' | 'custom';
  customResolution?: { width: number; height: number };
};

export type Streamer = {
  id: string;
  username: string;
  displayName: string;
  slug: string;
  overlayToken: string;
  settings: StreamerSettings | null;
  createdAt: string;
  updatedAt: string;
};

export type Submission = {
  id: string;
  uploaderName: string;
  message?: string | null;
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'approved' | 'denied';
  expiresAt: string;
  createdAt: string;
  approvedAt?: string | null;
  deniedAt?: string | null;
  layout?: Record<string, unknown> | null;
};
