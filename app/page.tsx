/**
 * Capture Page:
 * Handles recording audio and uploading files to save them to the global list.
 * Features:
 *   - Voice-to-text only mode (uses Web Speech API, bypasses Gemini)
 *   - Rate limiting: max 10 Gemini calls per day (resets at midnight)
 *   - Post-recording folder selection + memo title naming with confirmation
 *   - Mobile: no getUserMedia permission priming — goes straight to
 *     recognition.start(). Priming was causing its own mic-conflict errors
 *     on Android Chrome when mic permission is already granted.
 *   - Auto single-retry on transient service-not-allowed errors.
 *   - Safari iOS: detected early with a clear unsupported message.
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Mic,
  Square,
  Loader2,
  Sparkles,
  Calendar,
  Folder,
  AlertTriangle,
  CheckCircle2,
  PenLine,
} from "lucide-react"
import { Navbar } from "@/components/ui/navbar"
import { useMemos } from "@/app/context/MemoContext"
import { createClient } from "@/lib/supabase/browser"
import { Progress } from "@/components/ui/progress"
import { DotGridBackground } from "@/components/ui/dot-grid-background"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Rate-limit helpers (localStorage, resets daily)
// ---------------------------------------------------------------------------
const RATE_LIMIT_KEY = "gemini_rate_limit"
const DAILY_LIMIT = 10

interface RateLimitRecord {
  date: string // "YYYY-MM-DD"
  count: number
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function getRateLimitRecord(): RateLimitRecord {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    if (raw) {
      const parsed: RateLimitRecord = JSON.parse(raw)
      if (parsed.date === getTodayString()) return parsed
    }
  } catch {
    // ignore
  }
  return { date: getTodayString(), count: 0 }
}

function incrementRateLimit(): RateLimitRecord {
  const record = getRateLimitRecord()
  const updated = { date: getTodayString(), count: record.count + 1 }
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
  return updated
}

function isRateLimited(): boolean {
  return getRateLimitRecord().count >= DAILY_LIMIT
}

// ---------------------------------------------------------------------------
// Helper: detect Safari on iOS (Web Speech API not supported there)
// ---------------------------------------------------------------------------
function isSafariIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return (
    /iP(hone|od|ad)/.test(ua) &&
    /WebKit/.test(ua) &&
    !/CriOS/.test(ua) &&
    !/FxiOS/.test(ua)
  )
}

// ---------------------------------------------------------------------------
// Helper: human-readable SpeechRecognition error messages
// ---------------------------------------------------------------------------
function speechErrorMessage(code: string): string {
  switch (code) {
    case "service-not-allowed":
    case "not-allowed":
      return "Speech recognition was blocked. Please ensure microphone permission is allowed for this site in your browser settings, then try again."
    case "no-speech":
      return "No speech detected. Please try again."
    case "network":
      return "A network error occurred with the speech service. Please check your connection and try again."
    case "aborted":
      return "Recording was cancelled."
    case "audio-capture":
      return "No microphone was found. Please check your device settings."
    default:
      return `Speech recognition error (${code}). Please try again.`
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HomePage() {
  const { memos, addMemo } = useMemos()

  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Voice-to-text only mode
  const [voiceOnlyMode, setVoiceOnlyMode] = useState(false)

  // Post-recording confirmation state (voice-only)
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>("Unsorted")
  const [memoTitle, setMemoTitle] = useState<string>("")
  const [confirmed, setConfirmed] = useState(false)

  // Rate limit state
  const [rateLimitCount, setRateLimitCount] = useState(0)

  const supabase = createClient()
  const [username, setUsername] = useState<string | null>(null)
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<any>(null)
  // Tracks whether we've already attempted one auto-retry for service-not-allowed
  const speechRetryAttempted = useRef(false)

  useEffect(() => {
    setRateLimitCount(getRateLimitRecord().count)

    let mounted = true

    ;(async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const user = userRes.user
        if (!user) return

        const [{ data: profile }, { data: folderRows }] = await Promise.all([
          supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("folders")
            .select("id,name")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true }),
        ])

        if (!mounted) return

        setUsername(profile?.username ?? null)
        // Filter out any folder literally named "Unsorted" (case-insensitive) to prevent duplicates
        const nextFolders = ((folderRows ?? []) as Array<{ id: string; name: string }>).filter(
          (f) => f.name.toLowerCase() !== "unsorted"
        )
        setFolders(nextFolders)
      } catch {
        // ignore
      }
    })()

    return () => {
      mounted = false
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Core: start a SpeechRecognition session
  // Called initially and once on auto-retry.
  // No getUserMedia here — mic permission is already granted (AI mode proves
  // this), and opening a competing stream causes its own errors on Android.
  // ---------------------------------------------------------------------------
  const startSpeechRecognition = (transcriptAccumulator: { value: string }) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.lang = "en-US"
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = true

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcriptAccumulator.value += event.results[i][0].transcript + " "
        }
      }
    }

    recognition.onerror = (event: any) => {
      // Auto-retry once on service-not-allowed — this fires transiently on
      // Android Chrome's first attempt while the speech service warms up.
      if (event.error === "service-not-allowed" && !speechRetryAttempted.current) {
        speechRetryAttempted.current = true
        try { recognition.stop() } catch { /* ignore */ }
        setTimeout(() => {
          try {
            startSpeechRecognition(transcriptAccumulator)
          } catch {
            setError(speechErrorMessage("service-not-allowed"))
            setRecording(false)
            setRecordingTime(0)
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
            if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
          }
        }, 500)
        return
      }

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
      setError(speechErrorMessage(event.error))
      setRecording(false)
      setRecordingTime(0)
    }

    recognition.onend = () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)

      const finalText = transcriptAccumulator.value.trim()

      if (finalText) {
        setPendingTranscript(finalText)
        setRecording(false)
        setRecordingTime(0)
      } else if (!speechRetryAttempted.current || recognitionRef.current === recognition) {
        // Only show "no speech" if we're not mid-retry
        setError("No speech detected. Please try again.")
        setRecording(false)
        setRecordingTime(0)
      }
    }

    recognition.start()
  }

  // ---------------------------------------------------------------------------
  // Confirm and save pending voice-only memo
  // ---------------------------------------------------------------------------
  const confirmAndSaveMemo = () => {
    if (!pendingTranscript) return

    const dateLabel = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })

    const finalTitle = memoTitle.trim() || `Voice Memo ${memos.length + 1}`

    addMemo({
      id: `${Date.now()}`,
      title: finalTitle,
      status: "ready",
      date: dateLabel,
      category: selectedFolder,
      transcription: pendingTranscript,
    })

    setConfirmed(true)

    setTimeout(() => {
      setPendingTranscript(null)
      setSelectedFolder("Unsorted")
      setMemoTitle("")
      setConfirmed(false)
    }, 2200)
  }

  const discardPendingMemo = () => {
    setPendingTranscript(null)
    setSelectedFolder("Unsorted")
    setMemoTitle("")
    setConfirmed(false)
  }

  // ---------------------------------------------------------------------------
  // Gemini processing
  // ---------------------------------------------------------------------------
  const processAudioWithGemini = async (audioBlob: Blob, fileName?: string) => {
    if (isRateLimited()) {
      setError(`Daily AI limit of ${DAILY_LIMIT} uses reached. Switch to Voice-to-Text Only mode or try again tomorrow.`)
      return
    }

    setIsProcessing(true)
    setError(null)

    const formData = new FormData()
    formData.append("audio", audioBlob, fileName || "recording.webm")

    try {
      const response = await fetch("/api/gemini", { method: "POST", body: formData })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process audio")
      }

      const updated = incrementRateLimit()
      setRateLimitCount(updated.count)

      const data = await response.json()

      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })

      const thoughts: Array<{ text: string; label?: string; folder?: string }> = Array.isArray(data?.thoughts)
        ? data.thoughts
        : []

      const safeThoughts = thoughts
        .map((t) => ({
          text: String(t?.text ?? "").trim(),
          label: String(t?.label ?? "").trim(),
          folder: String(t?.folder ?? "Unsorted").trim() || "Unsorted",
        }))
        .filter((t) => t.text.length > 0)
        .slice(0, 10)

      if (safeThoughts.length === 0) {
        addMemo({
          id: `${Date.now()}`,
          title: data?.label || `Memo ${memos.length + 1}`,
          status: "ready",
          date: dateLabel,
          category: "Unsorted",
          ...(data?.transcription && { transcription: String(data.transcription) }),
        })
        return
      }

      safeThoughts.forEach((t, idx) => {
        addMemo({
          id: `${Date.now()}-${idx}`,
          title: t.label || `Memo ${memos.length + 1 + idx}`,
          status: "ready",
          date: dateLabel,
          category: t.folder,
          transcription: t.text,
        })
      })
    } catch (error: any) {
      console.error("Error processing audio:", error)
      setError(error.message || "Failed to process audio")
    } finally {
      setIsProcessing(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Recording controls
  // ---------------------------------------------------------------------------
  const startRecording = async () => {
    try {
      setError(null)
      setPendingTranscript(null)
      setMemoTitle("")
      setConfirmed(false)
      speechRetryAttempted.current = false

      if (voiceOnlyMode) {
        // Safari iOS: Web Speech API not supported
        if (isSafariIOS()) {
          setError(
            "Voice-to-Text is not supported in Safari on iOS. Please use Chrome on Android, or switch to AI mode instead."
          )
          return
        }

        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

        if (!SpeechRecognition) {
          setError(
            "Your browser doesn't support Voice-to-Text. Try Chrome on Android or desktop, or use AI mode instead."
          )
          return
        }

        const transcriptAccumulator = { value: "" }

        setRecording(true)
        recordingTimerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000)
        recordingTimeoutRef.current = setTimeout(() => stopRecording(), 120000)

        startSpeechRecognition(transcriptAccumulator)
        return
      }

      // Normal AI mode
      if (isRateLimited()) {
        setError(`Daily AI limit of ${DAILY_LIMIT} uses reached. Switch to Voice-to-Text Only mode or try again tomorrow.`)
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        await processAudioWithGemini(audioBlob)
        setRecording(false)
        setRecordingTime(0)
      }

      mediaRecorder.start()
      setRecording(true)
      recordingTimerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000)
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") stopRecording()
      }, 120000)
    } catch (err) {
      setError("Microphone access denied.")
      setRecording(false)
    }
  }

  const stopRecording = () => {
    if (voiceOnlyMode) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
    } else {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progress = (recordingTime / 120) * 100
  const rateLimitExceeded = rateLimitCount >= DAILY_LIMIT
  const rateLimitProgress = Math.min((rateLimitCount / DAILY_LIMIT) * 100, 100)

  const showRecordButton = !pendingTranscript && !confirmed

  return (
    <div className="relative min-h-screen bg-background">
      <DotGridBackground />
      <Navbar />
      <main className="relative z-10 container mx-auto px-4 py-8">
        {username && (
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
              Welcome back, {username}!
            </h1>
            <p className="text-muted-foreground">
              Ready to capture your thoughts? Start recording below.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Recording Card */}
          <div className="w-full">
            <Card className="border-2 border-border bg-secondary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="flex size-10 items-center justify-center rounded-full bg-accent/20">
                    <Mic className="size-5 text-accent" />
                  </div>
                  Record a Memo
                </CardTitle>
                <CardDescription>
                  Record up to 2 minutes. AI will transcribe and organize automatically.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Voice-only toggle */}
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Mic className="size-4 text-accent" />
                      </div>
                      <div className="flex-1 text-sm">
                        <Label
                          htmlFor="voice-only-toggle"
                          className="font-medium text-foreground mb-0.5 block cursor-pointer"
                        >
                          Voice-to-Text Only
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Bypass AI — transcribe with your browser. No API usage.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="voice-only-toggle"
                      checked={voiceOnlyMode}
                      onCheckedChange={(val) => {
                        setVoiceOnlyMode(val)
                        setError(null)
                        setPendingTranscript(null)
                        setSelectedFolder("Unsorted")
                        setMemoTitle("")
                        setConfirmed(false)
                      }}
                      disabled={recording}
                      className="ring-2 ring-orange-500 ring-offset-2 ring-offset-background transition-all [&>span]:bg-orange-500"
                    />
                  </div>
                </div>

                {/* Rate limit bar (AI mode only) */}
                {!voiceOnlyMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3 text-accent" />
                        Daily AI uses
                      </span>
                      <span className={rateLimitExceeded ? "text-destructive font-semibold" : ""}>
                        {rateLimitCount} / {DAILY_LIMIT}
                      </span>
                    </div>
                    <Progress
                      value={rateLimitProgress}
                      className={`h-1.5 ${rateLimitExceeded ? "[&>div]:bg-destructive" : ""}`}
                    />
                    {rateLimitExceeded && (
                      <p className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="size-3" />
                        Daily limit reached. Enable Voice-to-Text Only or wait until tomorrow.
                      </p>
                    )}
                  </div>
                )}

                {/* Info banners */}
                {showRecordButton && !voiceOnlyMode && (
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Sparkles className="size-4 text-accent" />
                      </div>
                      <div className="flex-1 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">AI-Powered Organization</p>
                        <p className="text-xs leading-relaxed">
                          Your memo will be automatically split into thoughts and sorted into your
                          existing folders using AI.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {showRecordButton && voiceOnlyMode && (
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Mic className="size-4 text-accent" />
                      </div>
                      <div className="flex-1 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Browser Transcription</p>
                        <p className="text-xs leading-relaxed">
                          After recording, you'll name your memo and choose which folder to save it to.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recording progress */}
                {recording && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Recording in progress...</span>
                      <span className="font-mono font-medium text-accent">{formatTime(recordingTime)}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {120 - recordingTime}s remaining
                    </p>
                  </div>
                )}

                {/* Post-recording confirmation panel */}
                {pendingTranscript && !confirmed && (
                  <div className="rounded-xl border-2 border-accent/30 bg-gradient-to-b from-accent/5 to-transparent overflow-hidden">
                    <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-accent/15">
                      <div className="flex size-6 items-center justify-center rounded-full bg-accent/20">
                        <CheckCircle2 className="size-3.5 text-accent" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Memo captured</p>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="rounded-lg bg-muted/60 border border-border px-3 py-2.5">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Transcript
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3 italic">
                          "{pendingTranscript}"
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <PenLine className="size-3 text-accent" />
                          Memo title
                        </Label>
                        <Input
                          value={memoTitle}
                          onChange={(e) => setMemoTitle(e.target.value)}
                          placeholder={`Voice Memo ${memos.length + 1}`}
                          className="h-9 text-sm bg-background"
                          maxLength={80}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Leave blank to use the default name.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <Folder className="size-3 text-accent" />
                          Save to folder
                        </Label>
                        <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                          <SelectTrigger className="w-full h-9 text-sm bg-background">
                            <SelectValue placeholder="Select a folder" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Unsorted">
                              <span className="flex items-center gap-2">
                                <Folder className="size-3.5 text-muted-foreground" />
                                Unsorted
                              </span>
                            </SelectItem>
                            {folders.map((f) => (
                              <SelectItem key={f.id} value={f.name}>
                                <span className="flex items-center gap-2">
                                  <Folder className="size-3.5 text-accent" />
                                  {f.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button className="flex-1 h-9 text-sm font-semibold" onClick={confirmAndSaveMemo}>
                          Save memo
                        </Button>
                        <Button variant="outline" className="h-9 px-4 text-sm" onClick={discardPendingMemo}>
                          Discard
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success confirmation */}
                {confirmed && (
                  <div className="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                    <div>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        Memo saved!
                      </p>
                      <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
                        "{memoTitle.trim() || `Voice Memo ${memos.length}`}" → {selectedFolder}
                      </p>
                    </div>
                  </div>
                )}

                {/* Record / Stop button */}
                {showRecordButton && (
                  <div className="pt-1">
                    <Button
                      className="w-full h-16 rounded-xl text-base font-semibold"
                      onClick={recording ? stopRecording : startRecording}
                      variant={recording ? "destructive" : "default"}
                      disabled={isProcessing || (!voiceOnlyMode && rateLimitExceeded && !recording)}
                      size="lg"
                    >
                      {recording ? (
                        <>
                          <Square className="mr-2 h-5 w-5 fill-current" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Start Recording
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {isProcessing && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-accent/10 p-4 text-sm text-accent">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-medium">Processing with AI...</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Memos */}
          <div className="w-full">
            <Card className="border-2 border-border bg-secondary/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Recent Memos</CardTitle>
                  <CardDescription className="mt-1">Your latest captured thoughts</CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono text-base px-3 py-1">
                  {memos.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {memos.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center">
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                      <Mic className="size-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No memos yet</p>
                    <p className="text-xs text-muted-foreground">
                      Start recording to create your first memo
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {memos.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border-2 border-border bg-background p-4 space-y-3 transition-all hover:border-accent/50"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 mt-0.5">
                              <Mic className="size-4 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <h3 className="text-sm font-semibold truncate text-foreground">
                                {m.title}
                              </h3>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="size-3" />
                                <span>{m.date}</span>
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-xs border-accent/50 text-accent"
                          >
                            <Folder className="size-3 mr-1" />
                            {m.category}
                          </Badge>
                        </div>

                        {m.transcription && (
                          <div className="rounded-lg border border-border bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {m.transcription}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}