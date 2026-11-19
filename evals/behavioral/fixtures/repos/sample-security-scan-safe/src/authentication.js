// Static specimen of an opaque-token boundary; no external auth adapter is required.
import { randomBytes } from 'node:crypto';

const sessions = new Map();
const bearerTokens = new Map();
const opaqueToken = () => randomBytes(32).toString('hex');

// Trusted server bootstrap only, never registered as an HTTP route. The caller has
// already authenticated the member; issued values go only to that member over TLS.
export function issueForAuthenticatedMember(principal, now = Date.now()) {
  const sessionId = opaqueToken();
  const bearerToken = opaqueToken();
  const csrfToken = opaqueToken();
  const expiresAt = now + 15 * 60 * 1000;
  sessions.set(sessionId, { userId: principal.id, csrfToken, expiresAt });
  bearerTokens.set(bearerToken, { principal, expiresAt });
  return { cookie: `session=${sessionId}; Secure; HttpOnly; SameSite=Lax; Path=/`,
    bearerToken, csrfToken };
}

export function verifyBearerToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const record = bearerTokens.get(token);
  return record && record.expiresAt > Date.now() ? record.principal : null;
}

export function authenticatedSession(req, res, next) {
  const cookies = String(req.headers.cookie ?? '').split(';').map(value => value.trim());
  const matches = cookies.filter(value => value.startsWith('session='));
  if (matches.length !== 1) return res.sendStatus(401);
  const sessionId = matches[0].slice('session='.length);
  if (!/^[a-f0-9]{64}$/.test(sessionId)) return res.sendStatus(401);
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) return res.sendStatus(401);
  req.session = session;
  next();
}
