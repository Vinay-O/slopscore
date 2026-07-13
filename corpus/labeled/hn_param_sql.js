function handler(req) {
  const q = "SELECT id FROM users WHERE id = $1";
  return db.query(q, [req.query.id]);
}
module.exports = handler;
