function h(req) {
  return fs.readFileSync(req.params.file, "utf8");
}
module.exports = h;
