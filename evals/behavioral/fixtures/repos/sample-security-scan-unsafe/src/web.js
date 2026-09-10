// Static Express-like wiring. Dependencies are supplied by application bootstrap.
export function installWebRoutes(app, db, sessionMiddleware) {
  // This middleware authenticates only the ambient session cookie.
  app.use(sessionMiddleware({ cookie: { httpOnly: true, sameSite: 'none', secure: true } }));

  app.get('/preview', (req, res) => {
    res.type('html').send(`<main>${req.query.message}</main>`);
  });

  app.post('/profile', async (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);
    // No CSRF token, Origin or Referer validation on this cookie-authenticated write.
    await db.query('UPDATE member SET biography = $1 WHERE id = $2',
      [req.body.biography, req.session.userId]);
    res.sendStatus(204);
  });

  app.get('/profile/:id', async (req, res) => {
    const result = await db.query('SELECT biography FROM member WHERE id = $1', [req.params.id]);
    res.type('html').send(`<article>${result.rows[0].biography}</article>`);
  });
}
