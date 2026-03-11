/**
 * File that keeps all the recorded memos in a React Context.
 * It manages the shared memo list, handles adding/deleting/updating memos,
 * and provides the data to both the Home and Memos pages.
 *
 * This version loads memo text through a decrypting RPC and writes memo text
 * through an encrypting RPC so plaintext memo content is not persisted via
 * direct table insert/update calls from the client.
 */

"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type MemoStatus = "ready" | "classifying" | "error";

export type Memo = {
  id: string;
  title: string;
  status: MemoStatus;
  date: string;
  audioUrl?: string;
  duration?: number;
  category?: string; // folder name in UI
  transcription?: string;
  createdAt?: string;
  reminder_at?: string | null; // ISO timestamp — null means no reminder
};

type MemoUpdate = {
  title?: string;
  /**
   * The memo text in the UI. Today this maps to the `transcription` column in Supabase.
   * (We also accept `content` as an alias so UI code can be more readable.)
   */
  transcription?: string;
  content?: string;
  category?: string; // folder name in UI
  reminder_at?: string | null;
};

interface MemoContextType {
  memos: Memo[];
  addMemo: (memo: Memo) => void;
  deleteMemo: (id: string) => void;
  updateMemo: (id: string, updates: MemoUpdate) => void;
}

const MemoContext = createContext<MemoContextType | undefined>(undefined);

type FolderRow = { id: string; name: string };

type MemoRow = {
  id: string;
  title: string | null;
  transcription: string | null;
  category: string | null;
  created_at: string | null;
  updated_at?: string | null;
  reminder_at?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDateLabel(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MemoProvider({ children }: { children: React.ReactNode }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;

      setSessionUserId((prev) => {
        if (prev !== newUserId) {
          setMemos([]);
          setFolders([]);
          setFoldersLoaded(false);
        }
        return newUserId;
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const folderIdByName = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.name, f.id));
    return map;
  }, [folders]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setFolders([]);
          setMemos([]);
          setFoldersLoaded(true);
        }
        return;
      }

      // Load folders first (and keep a local copy for mapping)
      const { data: folderRows, error: folderErr } = await supabase
        .from("folders")
        .select("id,name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      const localFolders = (folderRows ?? []) as FolderRow[];

      if (!cancelled) {
        if (folderErr) {
          console.error("Failed to load folders", folderErr);
          setFolders([]);
        } else {
          setFolders(localFolders);
        }
        setFoldersLoaded(true);
      }

      // Load memos through a decrypting RPC instead of selecting plaintext columns directly
      const { data: memoRows, error: memoErr } = await supabase.rpc("get_user_memos_decrypted");

      if (memoErr) {
        console.error("Failed to load decrypted memos", JSON.stringify(memoErr, null, 2));
        if (!cancelled) setMemos([]);
        return;
      }

      const mapped: Memo[] = ((memoRows ?? []) as MemoRow[]).map((r) => {
        const category = r.category ?? "Unsorted";
        const createdAt = r.created_at ?? undefined;
        return {
          id: r.id,
          title: (r.title ?? "Voice Memo") as string,
          status: "ready",
          date: formatDateLabel(createdAt),
          category,
          transcription: r.transcription ?? undefined,
          createdAt,
          reminder_at: r.reminder_at ?? null,
        };
      });

      if (!cancelled) setMemos(mapped);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, sessionUserId]);

  const addMemo = (newMemo: Memo) => {
    const optimistic: Memo = {
      ...newMemo,
      category: newMemo.category || "Unsorted",
      status: "ready",
      createdAt: newMemo.createdAt,
      date: newMemo.date || formatDateLabel(newMemo.createdAt),
      reminder_at: newMemo.reminder_at ?? null,
    };

    setMemos((prev) => [optimistic, ...prev]);

    void (async (_snapshotFolderIdByName: Map<string, string>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const category = optimistic.category || "Unsorted";
      const persistedId = isUuid(optimistic.id) ? optimistic.id : crypto.randomUUID();

      const { error } = await supabase.rpc("upsert_encrypted_memo", {
        p_id: persistedId,
        p_user_id: user.id,
        p_title: optimistic.title,
        p_category: category,
        p_transcription: optimistic.transcription ?? "",
        p_reminder_at: optimistic.reminder_at ?? null,  // ← NEW
      });

      if (error) {
        console.error("Failed to insert encrypted memo", JSON.stringify(error), {
          id: optimistic.id,
          title: optimistic.title,
          category,
        });
        return;
      }

      if (persistedId !== optimistic.id) {
        setMemos((prev) =>
          prev.map((m) =>
            m.id === optimistic.id
              ? {
                  ...m,
                  id: persistedId,
                }
              : m
          )
        );
      }
    })(new Map(folderIdByName));
  };

  const deleteMemo = (id: string) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("memos").delete().eq("id", id).eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete memo", JSON.stringify(error), { id });
      }
    })();
  };

  const updateMemo = (id: string, updates: MemoUpdate) => {
    // Support `content` as an alias for `transcription`
    const nextTranscription =
      typeof updates.transcription === "string"
        ? updates.transcription
        : typeof updates.content === "string"
          ? updates.content
          : undefined;

    // optimistic update with a stable snapshot for rollback
    let prevSnapshot: Memo[] = [];
    setMemos((cur) => {
      prevSnapshot = cur;
      return cur.map((m) =>
        m.id === id
          ? {
              ...m,
              title: typeof updates.title === "string" ? updates.title : m.title,
              transcription: typeof nextTranscription === "string" ? nextTranscription : m.transcription,
              category: typeof updates.category === "string" ? updates.category : m.category,
              reminder_at: "reminder_at" in updates ? (updates.reminder_at ?? null) : m.reminder_at,
            }
          : m
      );
    });

    void (async (_snapshotFolderIdByName: Map<string, string>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const nextTitle = typeof updates.title === "string" ? updates.title : undefined;
      const nextCategory = typeof updates.category === "string" ? updates.category || "Unsorted" : undefined;
      const existingMemo = prevSnapshot.find((m) => m.id === id);

      const titleToSave = nextTitle ?? existingMemo?.title ?? "Voice Memo";
      const categoryToSave = nextCategory ?? existingMemo?.category ?? "Unsorted";
      const transcriptionToSave =
        typeof nextTranscription === "string"
          ? nextTranscription
          : existingMemo?.transcription ?? "";
      const reminderAtToSave =
        "reminder_at" in updates
          ? (updates.reminder_at ?? null)
          : (existingMemo?.reminder_at ?? null);

      if (!existingMemo && typeof nextTitle !== "string" && typeof nextCategory !== "string" && typeof nextTranscription !== "string") return;

      const { error } = await supabase.rpc("upsert_encrypted_memo", {
        p_id: id,
        p_user_id: user.id,
        p_title: titleToSave,
        p_category: categoryToSave,
        p_transcription: transcriptionToSave,
        p_reminder_at: reminderAtToSave,  // ← NEW
      });

      if (error) {
        console.error("Failed to update encrypted memo", JSON.stringify(error), { id });
        setMemos(prevSnapshot);
      }
    })(new Map(folderIdByName));
  };

  return (
    <MemoContext.Provider value={{ memos, addMemo, deleteMemo, updateMemo }}>
      {children}
    </MemoContext.Provider>
  );
}

export function useMemos() {
  const context = useContext(MemoContext);
  if (!context) throw new Error("useMemos must be used within a MemoProvider");
  return context;
}