import { SignJWT, jwtVerify } from 'jose';
import { scrypt } from 'scrypt-js';
import { GifstremBindings, UserRow } from './types';

const encoder = new TextEncoder();

export type TokenPayload = {
  userId: string;
  username: string;
  slug: string;
};

const SCRYPT_PARAMS = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  dkLen: 32,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await scrypt(encoder.encode(password), salt, SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, SCRYPT_PARAMS.dkLen);
  return `${toHex(salt)}:${toHex(derived)}`;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const [saltHex, hashHex] = hash.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const derived = await scrypt(encoder.encode(password), salt, SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, SCRYPT_PARAMS.dkLen);
  return timingSafeEqual(fromHex(hashHex), derived);
}

export async function generateAccessToken(env: GifstremBindings, user: UserRow): Promise<string> {
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    slug: user.slug,
  };
  const ttl = Number(env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(encoder.encode(env.JWT_SECRET));
}

export async function verifyAccessToken(env: GifstremBindings, token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET));
  return payload as TokenPayload;
}

export function createOverlayToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return result;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
