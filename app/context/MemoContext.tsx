/**
 * File that keeps all the recorded memos in a React Context. 
 * It manages the shared memo list, handles adding/deleting memos, 
 * and provides the data to both the Home and Memos pages. 
 * Using this while we set up database schemas.
 */

"use client";


import React, { createContext, useContext, useState } from "react";

export type MemoStatus = "ready" | "classifying" | "error";

export type Memo = {
  id: string;
  title: string;
  status: MemoStatus;
  date: string;
  audioUrl?: string;
  duration?: number;
  category?: string;
  transcription?: string;
};

interface MemoContextType {
  memos: Memo[];
  addMemo: (memo: Memo) => void;
  deleteMemo: (id: string) => void;
}

const MemoContext = createContext<MemoContextType | undefined>(undefined);

export function MemoProvider({ children }: { children: React.ReactNode }) {
  const [memos, setMemos] = useState<Memo[]>([

  ]);

  const addMemo = (newMemo: Memo) => {
    setMemos((prev) => [newMemo, ...prev]);
  };

  const deleteMemo = (id: string) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <MemoContext.Provider value={{ memos, addMemo, deleteMemo }}>
      {children}
    </MemoContext.Provider>
  );
}

export function useMemos() {
  const context = useContext(MemoContext);
  if (!context) throw new Error("useMemos must be used within a MemoProvider");
  return context;
}