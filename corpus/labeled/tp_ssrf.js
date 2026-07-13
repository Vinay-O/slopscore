async function h(req) {
  return fetch(req.query.url);
}
module.exports = h;
