import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, mapRowToUser } from './db.ts';
import type { PortalUser } from '../src/types/portal.ts';

const SESSION_COOKIE_NAME = 'portal_institucional_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AuthenticatedRequest extends Request {
  portalUser?: PortalUser;
  authMethod?: 'cookie' | 'bearer';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function verifyEnvAdminPasscode(input: string): boolean {
  const envPasscode = process.env.PORTAL_ADMIN_PASSCODE?.trim();
  if (!envPasscode) return false;
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(envPasscode, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasClaimedAdmin(): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND password_hash IS NOT NULL`
    )
    .get() as { cnt: number };
  return row.cnt > 0;
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return { token, expiresAt };
}

export function revokeSession(token: string): void {
  const tokenHash = hashToken(token);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) return {};
  const result: Record<string, string> = {};
  for (const part of headerValue.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin ?? '').startsWith('https://');

  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin ?? '').startsWith('https://');

  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractTokenFromRequest(req: Request): {
  token: string | null;
  method: 'cookie' | 'bearer' | null;
} {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return { token, method: 'bearer' };
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return { token: cookies[SESSION_COOKIE_NAME], method: 'cookie' };
  }
  return { token: null, method: null };
}

function validateCsrfForCookieMutation(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { token, method } = extractTokenFromRequest(req);
  if (!token || !method) {
    res.status(401).json({ error: 'Sesión institucional requerida.' });
    return;
  }

  if (method === 'cookie' && !validateCsrfForCookieMutation(req)) {
    res.status(403).json({ error: 'Solicitud bloqueada por validación de origen.' });
    return;
  }

  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(401).json({ error: 'Sesión inválida o expirada.' });
    return;
  }

  const expiresAt = Date.parse(String(row.expires_at));
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
    return;
  }

  const user = mapRowToUser(row);
  if (!user.isActive) {
    res.status(403).json({ error: 'Tu cuenta institucional se encuentra inactiva.' });
    return;
  }

  req.portalUser = user;
  req.authMethod = method;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.portalUser) {
    res.status(401).json({ error: 'No autenticado.' });
    return;
  }
  if (req.portalUser.role !== 'admin') {
    res.status(403).json({
      error:
        'Acceso denegado. Se requiere rol de Administrador para modificar el catálogo o permisos.',
    });
    return;
  }
  next();
}
