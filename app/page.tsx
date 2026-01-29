"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Play, Pause, Calendar } from "lucide-react";
import { Navbar } from "@/components/ui/navbar";

type MemoStatus = "ready" | "classifying" | "error";

type Memo = {
  id: string;
  title: string;
  status: MemoStatus;
  date: string;
  audioUrl?: string;
  duration?: number;
  category?: string;
};

export default function HomePage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [playbackSpeeds, setPlaybackSpeeds] = useState<Record<string, number>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      
      memos.forEach((memo) => {
        if (memo.audioUrl) {
          URL.revokeObjectURL(memo.audioUrl);
        }
      });

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, [memos]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const newMemo: Memo = {
          id: Date.now().toString(),
          title: "New memo",
          status: "classifying",
          date: "Today",
          audioUrl,
        };
        
        setMemos((prev) => [newMemo, ...prev]);
        setPlaybackSpeeds((prev) => ({ ...prev, [newMemo.id]: 1 }));
        
        setRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setError("Recording failed. Please try again.");
        setRecording(false);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          stopRecording();
        }
      }, 2 * 60 * 1000);
      
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Could not access microphone. Please check permissions.");
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const togglePlay = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (playingId && playingId !== id) {
      const prevAudio = audioRefs.current[playingId];
      if (prevAudio) {
        prevAudio.pause();
      }
    }

    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("Error playing audio:", err);
        setError("Could not play audio.");
      });
      setPlayingId(id);
    } else {
      audio.pause();
      setPlayingId(null);
    }
  };

  const toggleSpeed = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    const current = playbackSpeeds[id] || 1;
    const newSpeed = current === 1 ? 1.5 : current === 1.5 ? 2 : 1;
    setPlaybackSpeeds((prev) => ({ ...prev, [id]: newSpeed }));
    audio.playbackRate = newSpeed;
  };

  const handleAudioEnded = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    }
  };

  const handleTimeUpdate = (id: string, currentTime: number) => {
    setCurrentTimes((prev) => ({ ...prev, [id]: currentTime }));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case "Work":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "Personal":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "Tasks":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Recording Card */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Record a Memo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Up to 2 minutes. We'll transcribe and organize it.
              </p>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={recording ? stopRecording : startRecording}
                variant={recording ? "destructive" : "default"}
              >
                {recording ? (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    Stop Recording ({formatTime(recordingTime)})
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    Start Recording
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Memos */}
          <Card className="border-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Memos</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Your latest voice captures
                </p>
              </div>
              <Badge variant="secondary" className="font-mono">
                {memos.length}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {memos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No memos yet. Record your first one!
                </p>
              ) : (
                memos.map((m) => (
                  <div
                    key={m.id}
                    className="group relative flex flex-col rounded-xl border-2 p-4 space-y-3 hover:border-primary/50 transition-all duration-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{m.title}</h3>
                          {m.category && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${getCategoryColor(m.category)}`}
                            >
                              {m.category}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{m.date}</span>
                        </div>
                      </div>
                      <Badge
                        variant={m.status === "ready" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {m.status}
                      </Badge>
                    </div>

                    {m.audioUrl && (
                      <div className="flex flex-col gap-2 pt-2 border-t">
                        <audio
                          ref={(el) => {
                            audioRefs.current[m.id] = el;
                            if (el) {
                              el.playbackRate = playbackSpeeds[m.id] || 1;
                            }
                          }}
                          src={m.audioUrl}
                          onEnded={() => handleAudioEnded(m.id)}
                          onTimeUpdate={(e) =>
                            handleTimeUpdate(m.id, e.currentTarget.currentTime)
                          }
                          onLoadedMetadata={(e) => {
                            const duration = e.currentTarget.duration;
                            setMemos((prev) =>
                              prev.map((memo) =>
                                memo.id === m.id ? { ...memo, duration } : memo
                              )
                            );
                          }}
                          style={{ display: "none" }}
                        />
                        
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePlay(m.id)}
                            className="transition-all hover:scale-105"
                          >
                            {playingId === m.id ? (
                              <Pause className="h-3 w-3 mr-1" />
                            ) : (
                              <Play className="h-3 w-3 mr-1" />
                            )}
                            {playingId === m.id ? "Pause" : "Play"}
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleSpeed(m.id)}
                            className="font-mono"
                          >
                            {playbackSpeeds[m.id] || 1}x
                          </Button>
                          
                          <span className="text-xs text-muted-foreground ml-auto font-mono">
                            {formatTime(currentTimes[m.id] || 0)}
                            {m.duration && ` / ${formatTime(m.duration)}`}
                          </span>
                        </div>
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