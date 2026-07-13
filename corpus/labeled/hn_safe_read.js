function h(configPath) {
  return fs.readFileSync(configPath, "utf8");
}
module.exports = h;
