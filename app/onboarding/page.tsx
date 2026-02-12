"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const DEFAULT_FOLDERS = [
  "Ideas",
  "School",
  "Work",
  "Projects",
  "Reminders",
  "Follow Ups",
  "Meetings & Conversations",
  "Content Creation",
  "Fitness & Health",
  "Personal Growth",
  "Money & Finances",
  "Relationships",
  "Music & Creative",
  "Research & Learning",
  "Miscellaneous",
];

type Step = "username" | "folders";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("username");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_FOLDERS.map((f) => [f, true]))
  );

  const chosenFolders = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  // Ensure user is logged in (onboarding is protected anyway, but this helps)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace("/login");
    })();
  }, [router, supabase]);

  async function saveUsername() {
    setError(null);

    const clean = username.trim();

    if (clean.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }

    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // create profile row if missing, then set username
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            username: clean,
            onboarding_complete: false,
          },
          { onConflict: "user_id" }
        );

      if (upsertErr) {
        setError(upsertErr.message);
        return;
      }

      setStep("folders");
    } finally {
      setLoading(false);
    }
  }

  async function finishOnboarding() {
    setError(null);

    if (chosenFolders.length === 0) {
      setError("Select at least one folder.");
      return;
    }

    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // Always ensure "Unsorted" exists (not shown during onboarding)
      const foldersToInsert = Array.from(
        new Set(["Unsorted", ...chosenFolders])
      );

      const { error: folderErr } = await supabase.from("folders").insert(
        foldersToInsert.map((name) => ({
          user_id: user.id,
          name,
        }))
      );

      if (folderErr) {
        // If user refreshes and tries again, it may complain about duplicates; you can ignore that
        const msg = folderErr.message.toLowerCase();
        if (!msg.includes("duplicate") && !msg.includes("unique")) {
          setError(folderErr.message);
          return;
        }
      }

      // Mark onboarding complete
      const { error: profErr } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            onboarding_complete: true,
          },
          { onConflict: "user_id" }
        );

      if (profErr) {
        setError(profErr.message);
        return;
      }

      router.replace("/memos");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>
        Welcome to Quick Thoughts 👋
      </h1>

      <ol style={{ lineHeight: 1.9, marginBottom: 18, opacity: 0.9 }}>
        <li>Record your Thoughts</li>
        <li>Let us extract and organize your Thoughts</li>
        <li>View your organized thoughts in your notes</li>
      </ol>

      {step === "username" && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Choose a username
          </h2>

          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. mo_quickthoughts"
              autoComplete="nickname"
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid #ccc",
              }}
            />
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
            onClick={saveUsername}
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </>
      )}

      {step === "folders" && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Pick your preferred folders
          </h2>

          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            {DEFAULT_FOLDERS.map((name) => (
              <label
                key={name}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid #ddd",
                  padding: 12,
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selected[name]}
                  onChange={() =>
                    setSelected((s) => ({ ...s, [name]: !s[name] }))
                  }
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
            onClick={finishOnboarding}
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Finishing..." : "Finish setup"}
          </button>

          <button
            type="button"
            onClick={() => setStep("username")}
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 10,
              padding: 12,
              borderRadius: 12,
              background: "transparent",
              cursor: "pointer",
              fontWeight: 600,
              border: "1px solid #ddd",
            }}
          >
            Back
          </button>
        </>
      )}
    </main>
  );
}