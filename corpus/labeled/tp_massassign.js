function h(req) {
  return new User(req.body);
}
module.exports = h;
