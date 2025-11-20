import type { PagesFunction } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { createRepositories, Repositories } from './_lib/repositories';
import { serializeSubmission, serializeUser } from './_lib/serializers';
import { createOverlayToken, generateAccessToken, hashPassword, verifyAccessToken, verifyPassword } from './_lib/security';
import type { GifstremBindings, UserRow } from './_lib/types';
import { saveSubmissionFileToR2, deleteSubmissionFileFromR2 } from './_lib/storage';
import { sanitizeDisplayName, sanitizeSlug, sanitizeMessage, sanitizeText, validateNoSqlInjection } from './_lib/sanitize';
import { ensureSettings } from './_lib/settings';

type AppBindings = GifstremBindings;
type AppVariables = {
  repos: Repositories;
  user?: UserRow;
};

const MAX_SUBMISSIONS_PER_STREAMER = 64;

const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));
app.use('*', async (c, next) => {
  c.set('repos', createRepositories(c.env));
  await next();
});

const signupSchema = z.object({
  displayName: z.string().min(2).max(64).transform(sanitizeDisplayName).refine(val => val.length >= 2, 'Display name too short after sanitization'),
  slug: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphen').transform(sanitizeSlug).refine(val => val.length >= 3, 'Slug too short after sanitization'),
  password: z.string().min(8).max(128).transform(sanitizeText).refine(val => validateNoSqlInjection(val), 'Invalid password format'),
});

const loginSchema = z.object({
  slug: z.string().transform(sanitizeSlug),
  password: z.string().transform(sanitizeText),
});

const safeZoneBoundsSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(10),
  height: z.number().min(10),
});

const safeZoneSchema = z
  .object({
    resolution: z.enum(['720p', '1080p', '2160p', 'custom']),
    size: z.object({
      width: z.number().min(100),
      height: z.number().min(100),
    }),
    zones: z.array(safeZoneBoundsSchema).min(1).max(6).optional(),
    zone: safeZoneBoundsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (payload) => Boolean(payload.zone || (payload.zones && payload.zones.length > 0)),
    { message: 'At least one safe zone is required', path: ['zones'] },
  );

const submissionSchema = z.object({
  slug: z.string().min(3).transform(sanitizeSlug),
  uploaderName: z.string().min(1).max(64).transform(sanitizeDisplayName).refine(val => val.length >= 1, 'Uploader name required after sanitization'),
  message: z.string().max(240).optional().transform(val => val ? sanitizeMessage(val) : undefined),
});

app.get('/api/healthz', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/auth/signup', async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.format() }, 400);
  }
  const repos = c.get('repos');
  const { displayName, slug, password } = parsed.data;
  if (await repos.users.findBySlug(slug)) {
    return c.json({ error: 'Slug already in use' }, 409);
  }
  const user = await repos.users.create({
    username: slug, // Use slug as username for backward compatibility
    passwordHash: await hashPassword(password),
    displayName,
    slug,
    overlayToken: createOverlayToken(),
  });
  const token = await generateAccessToken(c.env, user);
  return c.json({ token, user: serializeUser(user) }, 201);
});

app.post('/api/auth/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  const repos = c.get('repos');
  const existing = await repos.users.findBySlug(parsed.data.slug);
  if (!existing) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const valid = await verifyPassword(existing.password_hash, parsed.data.password);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const token = await generateAccessToken(c.env, existing);
  return c.json({ token, user: serializeUser(existing) });
});

app.get('/api/auth/me', requireAuth, async (c) => {
  return c.json({ user: serializeUser(c.get('user')!) });
});

app.get('/api/public/streamers/:slug', async (c) => {
  const slug = c.req.param('slug');
  const repos = c.get('repos');
  const streamer = await repos.users.findBySlug(slug);
  if (!streamer) {
    return c.json({ error: 'Streamer not found' }, 404);
  }
  return c.json({ streamer: serializeUser(streamer) });
});

app.get('/api/overlay/feed', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Missing token' }, 400);
  }
  const repos = c.get('repos');
  const streamer = await repos.users.findByOverlayToken(token);
  if (!streamer) {
    return c.json({ error: 'Unknown overlay token' }, 404);
  }
  await removeExpiredForStreamer(c.env, repos, streamer.id);
  const submissions = (await repos.submissions.listActiveForOverlay(streamer.id)).map(serializeSubmission);
  return c.json({ streamer: serializeUser(streamer), submissions });
});

const SUPPORTED_FILE_TYPES = new Set(['image/gif', 'image/png', 'image/jpeg', 'image/jpg']);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

app.post('/api/submissions/public', async (c) => {
  const form = await c.req.formData();
  const payload = submissionSchema.safeParse({
    slug: form.get('slug'),
    uploaderName: form.get('uploaderName'),
    message: form.get('message') ?? undefined,
  });
  if (!payload.success) {
    return c.json({ error: 'Invalid payload', details: payload.error.format() }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ error: 'Media file is required.' }, 400);
  }
  if (!SUPPORTED_FILE_TYPES.has(file.type)) {
    return c.json({ error: 'Only GIF, PNG, or JPEG uploads are supported right now.' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File exceeds the 4MB limit.' }, 400);
  }
  const repos = c.get('repos');
  const streamer = await repos.users.findBySlug(payload.data.slug);
  if (!streamer) {
    return c.json({ error: 'Streamer not found' }, 404);
  }

  try {
    console.info('[submission] uploading to R2', {
      slug: streamer.slug,
      file: { name: file.name, size: file.size, type: file.type },
    });
    const stored = await saveSubmissionFileToR2(c.env, file, streamer.slug);

    if (stored.sanitizationWarnings && stored.sanitizationWarnings.length > 0) {
      console.info('[submission] Sanitization warnings', {
        slug: streamer.slug,
        fileName: file.name,
        warnings: stored.sanitizationWarnings,
      });
    }
    
    const submission = await repos.submissions.create({
      streamerId: streamer.id,
      uploaderName: payload.data.uploaderName,
      message: payload.data.message,
      fileKey: stored.key,
      fileUrl: stored.url,
      fileName: file.name,
      fileSize: file.size,
      expiresInHours: 12,
    });

    await enforceSubmissionCap(c.env, repos, streamer.id);

    return c.json({ submission: serializeSubmission(submission) }, 201);
  } catch (error) {
    console.error('[submission] Unexpected failure while uploading', error);
    return c.json({ error: 'Unable to save submission', details: (error as Error).message }, 500);
  }
});

app.get('/api/submissions/pending', requireAuth, async (c) => {
  const user = c.get('user')!;
  const repos = c.get('repos');
  const submissions = (await repos.submissions.listByStatus(user.id, 'pending')).map(serializeSubmission);
  return c.json({ submissions });
});

app.get('/api/submissions/approved', requireAuth, async (c) => {
  const user = c.get('user')!;
  const repos = c.get('repos');
  const submissions = (await repos.submissions.listByStatus(user.id, 'approved')).map(serializeSubmission);
  return c.json({ submissions });
});

const deleteSubmissionFiles = async (env: AppBindings, keys: string | string[]) => {
  try {
    await deleteSubmissionFileFromR2(env, keys);
  } catch (error) {
    console.warn('Failed to delete R2 file', error);
  }
};

app.post('/api/submissions/:id/review', requireAuth, async (c) => {
  const payload = z.object({ action: z.enum(['approve', 'deny']) }).safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  const repos = c.get('repos');
  const submission = await repos.submissions.findById(c.req.param('id'));
  const user = c.get('user')!;
  if (!submission || submission.streamer_id !== user.id) {
    return c.json({ error: 'Submission not found' }, 404);
  }
  await repos.submissions.updateStatus(submission.id, payload.data.action === 'approve' ? 'approved' : 'denied');
  if (payload.data.action === 'deny') {
    await deleteSubmissionFiles(c.env, submission.file_key);
  }
  const updated = await repos.submissions.findById(submission.id);
  return c.json({ submission: serializeSubmission(updated!) });
});

app.delete('/api/submissions/:id', requireAuth, async (c) => {
  const repos = c.get('repos');
  const submission = await repos.submissions.findById(c.req.param('id'));
  const user = c.get('user')!;
  if (!submission || submission.streamer_id !== user.id) {
    return c.json({ error: 'Submission not found' }, 404);
  }
  try {
    await deleteSubmissionFileFromR2(c.env, submission.file_key);
  } catch (error) {
    // ignore best-effort cleanup
  }
  await repos.submissions.delete(submission.id);
  return c.body(null, 204);
});

app.get('/api/settings', requireAuth, async (c) => {
  return c.json({ user: serializeUser(c.get('user')!) });
});

app.put('/api/settings/safe-zone', requireAuth, async (c) => {
  const result = safeZoneSchema.safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload', details: result.error.format() }, 400);
  }
  const user = c.get('user')!;
  const settings = ensureSettings(user.settings);
  const zones = result.data.zones ?? (result.data.zone ? [result.data.zone] : []);
  settings.safeZones[result.data.resolution] = {
    zones,
    size: result.data.size,
    enabled: result.data.enabled ?? true,
  };
  await c.get('repos').users.updateSettings(user.id, settings);
  const updated = await c.get('repos').users.findById(user.id);
  return c.json({ user: serializeUser(updated!) });
});

app.post('/api/settings/overlay-token/rotate', requireAuth, async (c) => {
  const user = c.get('user')!;
  const newToken = createOverlayToken();
  await c.get('repos').users.updateOverlayToken(user.id, newToken);
  return c.json({ token: newToken });
});

app.put('/api/settings/show-safe-zone', requireAuth, async (c) => {
  const result = z.object({ show: z.boolean() }).safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  const user = c.get('user')!;
  const settings = ensureSettings(user.settings);
  settings.showSafeZoneOverlay = result.data.show;
  await c.get('repos').users.updateSettings(user.id, settings);
  const updated = await c.get('repos').users.findById(user.id);
  return c.json({ user: serializeUser(updated!) });
});

app.put('/api/settings/rotation', requireAuth, async (c) => {
  const result = z.object({ enabled: z.boolean() }).safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  const user = c.get('user')!;
  const settings = ensureSettings(user.settings);
  settings.rotationEnabled = result.data.enabled;
  await c.get('repos').users.updateSettings(user.id, settings);
  const updated = await c.get('repos').users.findById(user.id);
  return c.json({ user: serializeUser(updated!) });
});

app.put('/api/settings/resolution', requireAuth, async (c) => {
  const result = z
    .object({
      resolution: z.enum(['720p', '1080p', '2160p', 'custom']),
      customSize: z
        .object({
          width: z.number().min(640),
          height: z.number().min(360),
        })
        .optional(),
    })
    .safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  if (result.data.resolution === 'custom' && !result.data.customSize) {
    return c.json({ error: 'Custom size required for custom resolution' }, 400);
  }
  const user = c.get('user')!;
  const settings = ensureSettings(user.settings);
  settings.preferredResolution = result.data.resolution;
  if (result.data.resolution === 'custom') {
    settings.customResolution = result.data.customSize!;
  } else {
    delete settings.customResolution;
  }
  await c.get('repos').users.updateSettings(user.id, settings);
  const updated = await c.get('repos').users.findById(user.id);
  return c.json({ user: serializeUser(updated!) });
});

app.put('/api/settings/profile', requireAuth, async (c) => {
  const result = z
    .object({
      displayName: z.string().min(2).max(64).transform(sanitizeDisplayName).refine(val => val.length >= 2, 'Display name too short after sanitization'),
      slug: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphen').transform(sanitizeSlug).refine(val => val.length >= 3, 'Slug too short after sanitization'),
    })
    .safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload', details: result.error.format() }, 400);
  }
  const user = c.get('user')!;
  const repos = c.get('repos');
  
  // Check if slug is being changed and if new slug is available
  if (result.data.slug !== user.slug) {
    const existing = await repos.users.findBySlug(result.data.slug);
    if (existing && existing.id !== user.id) {
      return c.json({ error: 'Slug already in use' }, 409);
    }
  }
  
  await repos.users.updateProfile(user.id, result.data.displayName, result.data.slug);
  const updated = await repos.users.findById(user.id);
  return c.json({ user: serializeUser(updated!) });
});

app.put('/api/settings/password', requireAuth, async (c) => {
  const result = z
    .object({
      currentPassword: z.string().transform(sanitizeText),
      newPassword: z.string().min(8).max(128).transform(sanitizeText).refine(val => validateNoSqlInjection(val), 'Invalid password format'),
    })
    .safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ error: 'Invalid payload' }, 400);
  }
  const user = c.get('user')!;
  
  // Verify current password
  const valid = await verifyPassword(user.password_hash, result.data.currentPassword);
  if (!valid) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }
  
  // Update password
  const newHash = await hashPassword(result.data.newPassword);
  await c.get('repos').users.updatePassword(user.id, newHash);
  
  return c.json({ success: true });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Unexpected server error' }, 500);
});

async function requireAuth(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  next: Next,
) {
  const header = c.req.header('authorization');
  if (!header) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  const token = header.replace(/Bearer\s+/i, '').trim();
  try {
    const payload = await verifyAccessToken(c.env, token);
    const user = await c.get('repos').users.findById(payload.userId);
    if (!user) {
      return c.json({ error: 'Unknown user' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

async function removeExpiredForStreamer(env: AppBindings, repos: Repositories, streamerId: string) {
  const expired = await repos.submissions.listExpired(streamerId);
  if (expired.length === 0) {
    return;
  }
  try {
    await deleteSubmissionFileFromR2(env, expired.map((submission) => submission.file_key));
  } catch (error) {
    console.warn('Failed to delete expired R2 files', error);
  }
  await repos.submissions.deleteMany(expired.map((submission) => submission.id));
}

async function enforceSubmissionCap(env: AppBindings, repos: Repositories, streamerId: string) {
  const excess = await repos.submissions.oldestBeyondLimit(streamerId, MAX_SUBMISSIONS_PER_STREAMER);
  if (excess.length === 0) {
    return;
  }
  try {
    await deleteSubmissionFileFromR2(env, excess.map((submission) => submission.file_key));
  } catch (error) {
    console.warn('Failed to delete R2 files while enforcing submission cap', error);
  }
  await repos.submissions.deleteMany(excess.map((submission) => submission.id));
}

export const onRequest: PagesFunction<AppBindings> = (context) => {
  return app.fetch(context.request, context.env, context);
};
