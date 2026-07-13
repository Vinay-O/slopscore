function h(req) {
  return new User({ name: req.body.name, email: req.body.email });
}
module.exports = h;
