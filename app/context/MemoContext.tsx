/**
 * File that keeps all the recorded memos in a React Context.
 * It manages the shared memo list, handles adding/deleting/updating memos,
 * and provides the data to both the Home and Memos pages.
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
  created_at: string | null;
  folder_id: string | null;
};

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

      // Load memos
      const { data: memoRows, error: memoErr } = await supabase
        .from("memos")
        .select("id,title,transcription,created_at,folder_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (memoErr) {
        console.error("Failed to update memo", JSON.stringify(memoErr, null, 2));
        if (!cancelled) setMemos([]);
        return;
      }

      // Map using the SAME folder rows we just loaded
      const folderMap = new Map(localFolders.map((f) => [f.id, f.name]));

      const mapped: Memo[] = ((memoRows ?? []) as MemoRow[]).map((r) => {
        const category = r.folder_id ? folderMap.get(r.folder_id) ?? "Unsorted" : "Unsorted";
        const createdAt = r.created_at ?? undefined;
        return {
          id: r.id,
          title: (r.title ?? "Voice Memo") as string,
          status: "ready",
          date: formatDateLabel(createdAt),
          category,
          transcription: r.transcription ?? undefined,
          createdAt,
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
    };

    setMemos((prev) => [optimistic, ...prev]);

    void (async (snapshotFolderIdByName: Map<string, string>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const desiredFolderName = optimistic.category || "Unsorted";
      const unsortedId = snapshotFolderIdByName.get("Unsorted");
      const folderId = snapshotFolderIdByName.get(desiredFolderName) || unsortedId;

      const payload: any = {
        user_id: user.id,
        title: optimistic.title,
        transcription: optimistic.transcription ?? null,
        folder_id: folderId ?? null,
        status: "ready",
      };

      const { data: inserted, error } = await supabase
        .from("memos")
        .insert(payload)
        .select("id,created_at")
        .single();

      if (error) {
        console.error("Failed to insert memo", JSON.stringify(error), { payload });
        return;
      }

      if (inserted?.id && inserted.id !== optimistic.id) {
        setMemos((prev) =>
          prev.map((m) =>
            m.id === optimistic.id
              ? {
                  ...m,
                  id: inserted.id,
                  createdAt: inserted.created_at ?? m.createdAt,
                  date: formatDateLabel(inserted.created_at ?? m.createdAt),
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
            }
          : m
      );
    });

    // Snapshot folderIdByName at call time to avoid stale closure inside the async IIFE
    void (async (snapshotFolderIdByName: Map<string, string>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const payload: any = {};
      if (typeof updates.title === "string") payload.title = updates.title;

      // Allow editing the memo text itself (stored as `transcription` in DB)
      if (typeof nextTranscription === "string") payload.transcription = nextTranscription;

      if (typeof updates.category === "string") {
        const targetName = updates.category || "Unsorted";
        const unsortedId = snapshotFolderIdByName.get("Unsorted") ?? null;
        payload.folder_id = snapshotFolderIdByName.get(targetName) ?? unsortedId;
      }

      // Nothing to update
      if (Object.keys(payload).length === 0) return;

      const { error } = await supabase
        .from("memos")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to update memo", JSON.stringify(error), { id, payload });
        // rollback if it fails
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