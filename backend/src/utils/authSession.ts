import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getSecurityConfig, isProduction } from './security';

/**
 * Stateless login sessions.
 *
 * The login state lives in an HMAC-signed cookie instead of server memory, so
 * sessions survive restarts (Cloud Run scales to zero) and work across several
 * instances without a shared store. The signing key is derived from
 * SESSION_SECRET *and* the login password: changing either signs everyone out.
 *
 * Token: base64url(JSON {sid, exp}) + "." + base64url(HMAC-SHA256(payload)).
 * `sid` is a random id for this login; it stays the same when the token is refreshed.
 *
 * A separate long-lived, signed device cookie identifies the browser. Saved chats
 * are scoped to it, so they survive logout / re-login and the 24 h login expiry.
 * It grants no access on its own: every API call still needs a valid login.
 */

export const AUTH_COOKIE = 'baseflow.auth';
export const DEVICE_COOKIE = 'baseflow.device';
const DEVICE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;

export interface AuthState {
  loggedIn: boolean;
  /** Id of this login ('' when not logged in) */
  sid: string;
  /** Stable id of this browser, kept across logins (scopes saved chats) */
  deviceId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth: AuthState;
  }
}

interface TokenPayload {
  sid: string;
  exp: number;
}

function signingKey(): Buffer {
  const { sessionSecret, password } = getSecurityConfig();
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  return crypto.createHmac('sha256', sessionSecret).update(`baseflow-auth:${passwordHash}`).digest();
}

function sign(data: string): string {
  return crypto.createHmac('sha256', signingKey()).update(data).digest('base64url');
}

export function issueToken(sid: string = crypto.randomBytes(16).toString('hex'), now = Date.now()): string {
  const payload: TokenPayload = { sid, exp: now + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: unknown, now = Date.now()): TokenPayload | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.sid !== 'string' || !/^[a-f0-9]{32}$/.test(payload.sid)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

// Device ids are signed with SESSION_SECRET only, so a password change keeps saved chats.
function signDevice(id: string): string {
  const key = crypto.createHmac('sha256', getSecurityConfig().sessionSecret).update('baseflow-device').digest();
  return crypto.createHmac('sha256', key).update(id).digest('base64url');
}

export function verifyDeviceCookie(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  const [id, signature, extra] = value.split('.');
  if (!id || !signature || extra !== undefined || !/^[a-f0-9]{32}$/.test(id)) return null;
  const expected = Buffer.from(signDevice(id));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return id;
}

export function issueDeviceCookie(id: string = crypto.randomBytes(16).toString('hex')): string {
  return `${id}.${signDevice(id)}`;
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction && req.secure,
    maxAge: SESSION_TTL_MS,
    path: '/'
  };
}

export function setAuthCookie(req: Request, res: Response, sid?: string) {
  res.cookie(AUTH_COOKIE, issueToken(sid), cookieOptions(req));
}

export function clearAuthCookie(req: Request, res: Response) {
  const { maxAge: _maxAge, ...options } = cookieOptions(req);
  res.clearCookie(AUTH_COOKIE, options);
}

/**
 * Reads the auth cookie into req.auth (refreshing it when more than half-way to
 * expiry) and makes sure the browser has a device id.
 */
export function authSessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const payload = verifyToken(req.cookies?.[AUTH_COOKIE]);
  let deviceId = verifyDeviceCookie(req.cookies?.[DEVICE_COOKIE]);
  if (!deviceId) {
    const cookie = issueDeviceCookie();
    deviceId = cookie.split('.')[0];
    res.cookie(DEVICE_COOKIE, cookie, { ...cookieOptions(req), maxAge: DEVICE_TTL_MS });
  }
  req.auth = payload
    ? { loggedIn: true, sid: payload.sid, deviceId }
    : { loggedIn: false, sid: '', deviceId };
  if (payload && payload.exp - Date.now() < SESSION_TTL_MS - REFRESH_AFTER_MS) {
    setAuthCookie(req, res, payload.sid);
  }
  next();
}
