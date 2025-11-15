import { SubmissionRow, UserRow } from './types';

export function serializeUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    slug: user.slug,
    overlayToken: user.overlay_token,
    settings: safeParse(user.settings),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function serializeSubmission(submission: SubmissionRow) {
  return {
    id: submission.id,
    uploaderName: submission.uploader_name,
    message: submission.message,
    fileKey: submission.file_key,
    fileUrl: submission.file_url,
    fileName: submission.file_name,
    fileSize: submission.file_size,
    status: submission.status,
    expiresAt: submission.expires_at,
    createdAt: submission.created_at,
    approvedAt: submission.approved_at,
    deniedAt: submission.denied_at,
    layout: submission.layout ? safeParse(submission.layout) : null,
  };
}

function safeParse(payload: string) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}
