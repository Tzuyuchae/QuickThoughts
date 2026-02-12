/**
 * Capture Page: 
 * Handles recording audio and uploading files to save them to the global list.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Loader2 } from "lucide-react";
import { Navbar } from "@/components/ui/navbar";
import { useMemos } from "@/app/context/MemoContext";
import { createClient } from "@/lib/supabase/browser";

export default function HomePage() {
  const { memos, addMemo } = useMemos();
  
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const supabase = createClient();
  const [username, setUsername] = useState<string | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return;

        const [{ data: profile }, { data: folderRows }] = await Promise.all([
          supabase
            .from("profiles")
            .select("username")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("folders")
            .select("id,name")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true }),
        ]);

        if (!mounted) return;

        setUsername(profile?.username ?? null);
        const nextFolders = (folderRows ?? []) as Array<{ id: string; name: string }>;
        setFolders(nextFolders);

      } catch {
        // ignore; page can still render
      }
    })();

    return () => {
      mounted = false;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processAudioWithGemini = async (audioBlob: Blob, fileName?: string) => {
    setIsProcessing(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('audio', audioBlob, fileName || 'recording.webm');

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process audio');
      }

      const data = await response.json();
      
      const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const thoughts: Array<{ text: string; label?: string; folder?: string }> = Array.isArray(data?.thoughts)
        ? data.thoughts
        : [];

      const safeThoughts = thoughts
        .map((t) => ({
          text: String(t?.text ?? '').trim(),
          label: String(t?.label ?? '').trim(),
          folder: String(t?.folder ?? 'Unsorted').trim() || 'Unsorted',
        }))
        .filter((t) => t.text.length > 0)
        .slice(0, 10);

      // If no thoughts returned, fall back to a single memo using the full transcription
      if (safeThoughts.length === 0) {
        addMemo({
          id: `${Date.now()}`,
          title: data?.label || `Memo ${memos.length + 1}`,
          status: "ready",
          date: dateLabel,
          category: "Unsorted",
          ...(data?.transcription && { transcription: String(data.transcription) }),
        });
        return;
      }

      // Create a memo per extracted thought, categorized by the folder name returned by the API.
      safeThoughts.forEach((t, idx) => {
        addMemo({
          id: `${Date.now()}-${idx}`,
          title: t.label || `Memo ${memos.length + 1 + idx}`,
          status: "ready",
          date: dateLabel,
          category: t.folder,
          transcription: t.text,
        });
      });

    } catch (error: any) {
      console.error('Error processing audio:', error);
      setError(error.message || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Process with Gemini
        await processAudioWithGemini(audioBlob);
        
        setRecording(false);
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") stopRecording();
      }, 120000);

    } catch (err) {
      setError("Microphone access denied.");
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        {username && (
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{username}</span>
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            {/* Recording Card */}
            <Card className="border-2">
              <CardHeader><CardTitle>Record a Memo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Up to 2 minutes. AI will transcribe automatically.</p>
                <p className="text-xs text-muted-foreground">
                  Your memo will be automatically split into thoughts and sorted into your existing folders.
                </p>
                <Button 
                  className="w-full" 
                  onClick={recording ? stopRecording : startRecording} 
                  variant={recording ? "destructive" : "default"}
                  disabled={isProcessing}
                >
                  {recording ? (
                    <>
                      <Square className="mr-2 h-4 w-4" /> Stop ({formatTime(recordingTime)})
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" /> Start Recording
                    </>
                  )}
                </Button>
                {isProcessing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing with AI...</span>
                  </div>
                )}
                {error && <p className="text-xs text-destructive mt-2">{error}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Recent Memos */}
          <Card className="border-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Memos</CardTitle>
              <Badge variant="secondary" className="font-mono">{memos.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {memos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No memos yet.</p>
              ) : (
                memos.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex flex-col rounded-xl border-2 p-4 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Mic className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{m.title}</h3>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">{m.category}</Badge>
                    </div>
                    
                    {m.transcription && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        <p className="line-clamp-3">{m.transcription}</p>
                      </div>
                    )}
                    
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}