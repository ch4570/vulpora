export function showMessage(element, untrustedMessage) {
  element.textContent = untrustedMessage;
}

const allowedSort = new Map([['name', 'name'], ['created', 'created_at']]);

export async function findMembers(db, principal, input) {
  const column = allowedSort.get(input.sort);
  if (!column) throw new Error('Unsupported sort field');
  return db.query(`SELECT id, name FROM member WHERE tenant_id = $1 AND name = $2 ORDER BY ${column}`,
    [principal.tenantId, input.name]);
}

export function installApi(app, db) {
  app.post('/api/members/search', async (req, res) => {
    // No session middleware, cookie token or ambient credentials accepted.
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return res.sendStatus(401);
    const principal = await verifyBearerToken(authorization.slice(7));
    if (!principal) return res.sendStatus(401);
    res.json((await findMembers(db, principal, req.body)).rows);
  });
}

export function installCookieRoute(app, db) {
  app.post('/settings', authenticatedSession, async (req, res) => {
    // Session middleware supplies a server-generated, unpredictable CSRF token.
    const suppliedToken = req.headers['x-csrf-token'];
    if (typeof suppliedToken !== 'string' || !req.session.csrfToken ||
        suppliedToken !== req.session.csrfToken) return res.sendStatus(403);
    await db.query('UPDATE member SET display_name = $1 WHERE id = $2',
      [req.body.displayName, req.session.userId]);
    res.sendStatus(204);
  });
}

export function logAuthenticationResult(logger, principal, accepted) {
  logger.info({ event: 'authentication', memberId: principal?.id, accepted });
}
import { authenticatedSession, verifyBearerToken } from './authentication.js';
