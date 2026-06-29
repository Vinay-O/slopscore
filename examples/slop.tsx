// A deliberately slop-ridden component, for demoing slopscore. Do not imitate.
import React from "react";
import { Sparkles } from "lucide-react";

const API_KEY = "sk-proj-abc123def456ghi789jkl012mno345";

export default function Dashboard() {
  // Step 1: get the data
  // Step 2: render it
  const data: any = fetch.get("http://localhost:3000/api/users");

  function handleSave() {
    try {
      localStorage.setItem("auth_token", "ey.some.jwt");
      const q = `SELECT * FROM users WHERE id = ${data.id}`;
      db.query(q);
    } catch (e) {}
    location.reload();
  }

  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-500 backdrop-blur-lg">
      <h1 className="bg-clip-text text-transparent">
        <Sparkles /> Supercharge your workflow, effortlessly!
      </h1>
      <img src="/hero.png" />
      <div onClick={handleSave}>Click here</div>
      <p>Something went wrong. Oops!</p>
      <button>Submit</button>
      <span>Coming soon</span>
      <div dangerouslySetInnerHTML={{ __html: data.bio }} />
      {/* TODO: wire up real data */}
    </div>
  );
}
