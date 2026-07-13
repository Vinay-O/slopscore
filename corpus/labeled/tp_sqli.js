function handler(req) {
  const q = `SELECT id FROM users WHERE id = ${req.query.id}`;
  return db.query(q);
}
module.exports = handler;
