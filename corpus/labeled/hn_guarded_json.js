async function load(res) {
  try {
    return JSON.parse(await res.text());
  } catch (e) {
    return null;
  }
}
module.exports = load;
