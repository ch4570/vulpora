export async function findMember(db, req) {
  return db.query("SELECT * FROM member WHERE name = '" + req.query.name + "'");
}

export async function sortedMembers(db, req) {
  // Bound values do not protect the separately interpolated SQL identifier.
  return db.query(`SELECT id, name FROM member WHERE tenant_id = $1 ORDER BY ${req.query.sort}`,
    [req.auth.tenantId]);
}

export async function saveReport(db, req) {
  return db.query('INSERT INTO saved_report (owner_id, filter_text) VALUES ($1, $2)',
    [req.auth.userId, req.body.filter]);
}

export async function runSavedReport(db, ownerId) {
  const stored = await db.query('SELECT filter_text FROM saved_report WHERE owner_id = $1', [ownerId]);
  // Previously bound attacker input is concatenated on a later read: second-order injection.
  return db.query("SELECT * FROM member WHERE name = '" + stored.rows[0].filter_text + "'");
}
