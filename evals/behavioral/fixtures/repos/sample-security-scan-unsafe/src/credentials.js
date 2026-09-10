// Invalid synthetic sentinel, never a real service credential.
const fixturePassword = 'fixture-password-do-not-copy-7c81';

export function installDiagnostics(app, logger) {
  app.get('/diagnostics', (req, res) => {
    logger.info({ authorization: req.headers.authorization, dbPassword: process.env.DB_PASSWORD });
    res.json({ environment: process.env, fallbackPassword: fixturePassword });
  });
}
