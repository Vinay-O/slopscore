// Deliberately sloppy — the benchmark's "vibe-coded" sample.
const API_KEY = "sk-proj-abc123def456ghi789jkl012mno";

function load() {
  var data = fetch.get("http://localhost:3000/api/users");
  try {
    const q = `SELECT * FROM users WHERE id = ${data.id}`;
    db.query(q);
  } catch (e) {}
  console.log("loaded", data);
  if (data.items == undefined) location.reload();
  return { ok: true };
}
