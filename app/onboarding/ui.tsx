"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const DEFAULT_FOLDERS = ["Ideas", "Todo", "School", "Memories", "Work", "Family"] as const;

export default function OnboardingClient() {
  const router = useRouter();
  const supabase = createClient();

  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_FOLDERS.map((n) => [n, true]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(name: string) {
    setSelected((s) => ({ ...s, [name]: !s[name] }));
  }

  async function finish() {
    setLoading(true);
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      setLoading(false);
      setError("You must be logged in.");
      router.push("/login");
      return;
    }

    const userId = userRes.user.id;
    const chosen = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      // Insert folders (ignore duplicates)
      if (chosen.length > 0) {
        const { error: folderErr } = await supabase.from("folders").insert(
          chosen.map((name) => ({ user_id: userId, name }))
        );

        // If unique constraint complains because user revisits onboarding, you can safely ignore
        if (folderErr && !folderErr.message.toLowerCase().includes("duplicate")) {
          throw folderErr;
        }
      }

      // Mark onboarding complete
      const { error: profErr } = await supabase
        .from("profiles")
        .upsert({ id: userId, onboarding_complete: true });

      if (profErr) throw profErr;

      router.push("/memos");
      router.refresh();
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Something went wrong.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>
        Welcome to Quick Thoughts 👋
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 18 }}>
        Here’s how it works:
      </p>

      <ol style={{ lineHeight: 1.8, marginBottom: 20 }}>
        <li>Record your Thoughts</li>
        <li>Let us extract and organize your Thoughts</li>
        <li>View your organized thoughts in your notes</li>
      </ol>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
        Set up your folders
      </h2>

      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {DEFAULT_FOLDERS.map((name) => (
          <label
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={!!selected[name]}
              onChange={() => toggle(name)}
            />
            <span style={{ fontWeight: 600 }}>{name}</span>
          </label>
        ))}
      </div>

      {error && (
        <div
          style={{
            background: "#ffe5e5",
            border: "1px solid #ffb3b3",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={finish}
        disabled={loading}
        style={{
          padding: 12,
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
          width: "100%",
        }}
      >
        {loading ? "Saving..." : "Finish setup"}
      </button>
    </main>
  );
}