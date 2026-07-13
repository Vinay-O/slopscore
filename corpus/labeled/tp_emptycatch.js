function f() {
  try {
    risky();
  } catch (e) {}
}
module.exports = f;
