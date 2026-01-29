/**
 * Capture Page: 
 * Handles recording audio and uploading files to save them to the global list.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Play, Pause, Calendar, Upload, FileAudio } from "lucide-react";
import { Navbar } from "@/components/ui/navbar";
import { useMemos } from "@/app/context/MemoContext";

export default function HomePage() {
  const { memos, addMemo } = useMemos();
  
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [playbackSpeeds, setPlaybackSpeeds] = useState<Record<string, number>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        addMemo({
          id: Date.now().toString(),
          title: `Recorded Memo ${memos.length + 1}`,
          status: "ready",
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          audioUrl,
          category: "Personal"
        });
        
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError("Please upload a valid audio file.");
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    addMemo({
      id: Date.now().toString(),
      title: file.name.replace(/\.[^/.]+$/, ""), // Use filename without extension
      status: "ready",
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      audioUrl,
      category: "Upload"
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const togglePlay = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;
    if (playingId && playingId !== id) audioRefs.current[playingId]?.pause();
    if (audio.paused) {
      audio.play().catch(() => setError("Playback failed"));
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
    setPlaybackSpeeds(prev => ({ ...prev, [id]: newSpeed }));
    audio.playbackRate = newSpeed;
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
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            {/* Recording Card */}
            <Card className="border-2">
              <CardHeader><CardTitle>Record a Memo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Up to 2 minutes.</p>
                <Button className="w-full" onClick={recording ? stopRecording : startRecording} variant={recording ? "destructive" : "default"}>
                  {recording ? <><Square className="mr-2 h-4 w-4" /> Stop ({formatTime(recordingTime)})</> : <><Mic className="mr-2 h-4 w-4" /> Start Recording</>}
                </Button>
              </CardContent>
            </Card>

            {/* Upload Card */}
            <Card className="border-2 border-dashed">
              <CardHeader><CardTitle className="text-sm">Or Upload Audio</CardTitle></CardHeader>
              <CardContent>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="audio/*" 
                  className="hidden" 
                />
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload File
                </Button>
                {error && <p className="text-[10px] text-destructive mt-2">{error}</p>}
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
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {m.category === "Upload" ? <FileAudio className="h-4 w-4 text-muted-foreground" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                        <h3 className="text-sm font-semibold truncate max-w-[150px]">{m.title}</h3>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{m.category}</Badge>
                    </div>
                    {m.audioUrl && (
                      <>
                        <audio 
                          ref={el => { audioRefs.current[m.id] = el; }} 
                          src={m.audioUrl} 
                          onEnded={() => setPlayingId(null)} 
                          onTimeUpdate={(e) => {
                            const time = e.currentTarget.currentTime;
                            setCurrentTimes(prev => ({ ...prev, [m.id]: time }));
                          }}
                          hidden 
                        />
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => togglePlay(m.id)}>
                            {playingId === m.id ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                            {playingId === m.id ? "Pause" : "Play"}
                          </Button>
                          <span className="text-xs ml-auto font-mono text-muted-foreground">
                             {formatTime(currentTimes[m.id] || 0)}
                          </span>
                        </div>
                      </>
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