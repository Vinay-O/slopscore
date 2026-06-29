import { useUsers } from "@/hooks/use-users";
import { Pencil } from "lucide-react";

export default function Dashboard() {
  const { users, error } = useUsers();

  if (error) {
    return <p role="alert">Couldn&apos;t load your team. Check your connection and retry.</p>;
  }

  return (
    <section className="bg-surface-1">
      <h1 className="text-ink">Your team</h1>
      <img src="/hero.png" alt="A team collaborating at a shared desk" />
      <button type="button" aria-label="Edit profile">
        <Pencil aria-hidden /> Edit profile
      </button>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </section>
  );
}
