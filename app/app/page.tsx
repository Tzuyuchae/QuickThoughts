import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppHome() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return (
    <main style={{ padding: 24 }}>
      <h1>Logged in ✅</h1>
      <p>{data.user.email}</p>
    </main>
  );
}