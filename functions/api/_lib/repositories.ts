import { GifstremBindings, SubmissionRow, UserRow } from './types';

export type CreateUserInput = {
  username: string;
  passwordHash: string;
  displayName: string;
  slug: string;
  overlayToken: string;
};

export type CreateSubmissionInput = {
  streamerId: string;
  uploaderName: string;
  message?: string;
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  expiresInHours: number;
};

export type UpdateSubmissionLayoutInput = {
  id: string;
  layout: Record<string, unknown>;
};

const INITIAL_SETTINGS = JSON.stringify({
  safeZones: {},
  animation: { type: 'pop', durationMs: 600 },
});

export function createRepositories(env: GifstremBindings) {
  return {
    users: {
      async create(input: CreateUserInput): Promise<UserRow> {
        const now = new Date().toISOString();
        const result = await env.DB.prepare(
          `INSERT INTO users (id, username, password_hash, display_name, slug, overlay_token, settings, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
          .bind(
            crypto.randomUUID(),
            input.username,
            input.passwordHash,
            input.displayName,
            input.slug,
            input.overlayToken,
            INITIAL_SETTINGS,
            now,
            now,
          )
          .first<UserRow>();
        if (!result) {
          throw new Error('Failed to create user');
        }
        return result;
      },
      async findByUsername(username: string): Promise<UserRow | undefined> {
        const record = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
        return record ?? undefined;
      },
      async findBySlug(slug: string): Promise<UserRow | undefined> {
        const record = await env.DB.prepare('SELECT * FROM users WHERE slug = ?').bind(slug).first<UserRow>();
        return record ?? undefined;
      },
      async findByOverlayToken(token: string): Promise<UserRow | undefined> {
        const record = await env.DB.prepare('SELECT * FROM users WHERE overlay_token = ?')
          .bind(token)
          .first<UserRow>();
        return record ?? undefined;
      },
      async updateOverlayToken(userId: string, overlayToken: string): Promise<void> {
        await env.DB.prepare('UPDATE users SET overlay_token = ?, updated_at = ? WHERE id = ?')
          .bind(overlayToken, new Date().toISOString(), userId)
          .run();
      },
      async updateSettings(userId: string, settings: unknown): Promise<void> {
        await env.DB.prepare('UPDATE users SET settings = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(settings), new Date().toISOString(), userId)
          .run();
      },
      async findById(id: string): Promise<UserRow | undefined> {
        const record = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
        return record ?? undefined;
      },
    },
    submissions: {
      async create(input: CreateSubmissionInput): Promise<SubmissionRow> {
        const now = new Date();
        const expires = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000).toISOString();
        const record = await env.DB.prepare(
          `INSERT INTO submissions (
            id, streamer_id, uploader_name, message, file_key, file_url, file_name, file_size, status,
            expires_at, created_at, updated_at, approved_at, denied_at, layout
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, NULL, NULL)
          RETURNING *`,
        )
          .bind(
            crypto.randomUUID(),
            input.streamerId,
            input.uploaderName,
            input.message ?? null,
            input.fileKey,
            input.fileUrl,
            input.fileName,
            input.fileSize,
            expires,
            now.toISOString(),
            now.toISOString(),
          )
          .first<SubmissionRow>();
        if (!record) {
          throw new Error('Failed to save submission');
        }
        return record;
      },
      async listByStatus(streamerId: string, status: 'pending' | 'approved' | 'denied'): Promise<SubmissionRow[]> {
        const { results } = await env.DB.prepare(
          'SELECT * FROM submissions WHERE streamer_id = ? AND status = ? ORDER BY created_at DESC',
        )
          .bind(streamerId, status)
          .all<SubmissionRow>();
        return (results ?? []) as SubmissionRow[];
      },
      async listActiveForOverlay(streamerId: string): Promise<SubmissionRow[]> {
        const { results } = await env.DB.prepare(
          `SELECT * FROM submissions
           WHERE streamer_id = ? AND status = 'approved' AND expires_at > ?
           ORDER BY approved_at ASC`,
        )
          .bind(streamerId, new Date().toISOString())
          .all<SubmissionRow>();
        return (results ?? []) as SubmissionRow[];
      },
      async listExpired(streamerId: string): Promise<SubmissionRow[]> {
        const { results } = await env.DB.prepare(
          'SELECT * FROM submissions WHERE streamer_id = ? AND expires_at <= ?',
        )
          .bind(streamerId, new Date().toISOString())
          .all<SubmissionRow>();
        return (results ?? []) as SubmissionRow[];
      },
      async findById(id: string): Promise<SubmissionRow | undefined> {
        const record = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first<SubmissionRow>();
        return record ?? undefined;
      },
      async updateStatus(id: string, status: 'pending' | 'approved' | 'denied'): Promise<void> {
        const now = new Date().toISOString();
        if (status === 'pending') {
          await env.DB.prepare(
            `UPDATE submissions
             SET status = 'pending', updated_at = ?, approved_at = NULL, denied_at = NULL
             WHERE id = ?`,
          )
            .bind(now, id)
            .run();
          return;
        }
        const field = status === 'approved' ? 'approved_at' : 'denied_at';
        await env.DB.prepare(
          `UPDATE submissions
           SET status = ?, updated_at = ?, ${field} = ?
           WHERE id = ?`,
        )
          .bind(status, now, now, id)
          .run();
      },
      async delete(id: string): Promise<void> {
        await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
      },
      async deleteMany(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(', ');
        await env.DB.prepare(`DELETE FROM submissions WHERE id IN (${placeholders})`).bind(...ids).run();
      },
      async updateLayout({ id, layout }: UpdateSubmissionLayoutInput): Promise<void> {
        await env.DB.prepare('UPDATE submissions SET layout = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(layout), new Date().toISOString(), id)
          .run();
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
