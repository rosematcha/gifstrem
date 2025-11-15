export type GifstremBindings = {
  DB: D1Database;
  JWT_SECRET: string;
  SESSION_TTL_SECONDS?: string;
  GIF_BUCKET: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
};

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  slug: string;
  overlay_token: string;
  settings: string;
  created_at: string;
  updated_at: string;
};

export type SubmissionRow = {
  id: string;
  streamer_id: string;
  uploader_name: string;
  message: string | null;
  file_key: string;
  file_url: string;
  file_name: string;
  file_size: number;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  denied_at: string | null;
  layout: string | null;
};

export type SettingsShape = {
  safeZones: Record<
    string,
    {
      zone: { x: number; y: number; width: number; height: number };
      size: { width: number; height: number };
      enabled?: boolean;
    }
  >;
  animation: { type: string; durationMs: number };
  showSafeZoneOverlay?: boolean;
  preferredResolution?: '720p' | '1080p' | '2160p' | 'custom';
  customResolution?: { width: number; height: number };
};
