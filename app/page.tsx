/**
 * Capture Page:
 * Handles recording audio and uploading files to save them to the global list.
 * Features:
 *   - Voice-to-text only mode (uses Web Speech API, bypasses Gemini)
 *   - Rate limiting: max 10 Gemini calls per day (enforced server-side in DB, resets at midnight)
 *   - Post-recording folder selection + memo title naming with confirmation
 *   - Empty/silent memo prevention: guards in voice-only, AI, and confirm paths
 *   - Session timeout integration: cancels active recording before sign-out
 *
 * Mobile fix for Voice-to-Text Only mode:
 *   continuous=true  → holds a persistent connection to Google's speech servers
 *                       → Android Chrome's background service restrictions kill it
 *                       → results in "service-not-allowed"
 *   continuous=false → makes short one-shot requests per utterance
 *                       → we auto-restart in onend while user is still recording
 *                       → avoids the persistent connection that gets blocked
 *   no-speech error  → benign with continuous=false (quiet moment) — just restart
 *   transcript       → stored in a ref so rapid restarts never lose accumulated text
 */

"use client"

import { useState, useRef, useEffect, useCallback } from "react"
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
  X,
  Clock3,
  Brain,
  FileText,
} from "lucide-react"
import { Navbar } from "@/components/ui/navbar"
import { useMemos } from "@/app/context/MemoContext"
import { useSessionTimeout } from "@/components/sessiontimeoutcontext"
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
// Constants
// ---------------------------------------------------------------------------
const DAILY_LIMIT = 10

// Minimum meaningful transcript length — filters out stray sounds like "um",
// "uh", a single word, etc. that the speech API picks up as speech.
const MIN_TRANSCRIPT_LENGTH = 3

// Minimum audio blob size in bytes before we bother sending to Gemini.
// A real utterance at webm/opus quality is always several KB; anything smaller
// is effectively silence or mic noise.
// NOTE: The API route enforces this same check server-side — this is a
// client-side fast-path to avoid the round trip entirely.
const MIN_AUDIO_BYTES = 1500

// Minimum recording duration in seconds before we allow sending to Gemini.
// This catches the case where a user taps Start then immediately taps Stop
// before making any sound — the blob may technically exceed MIN_AUDIO_BYTES
// (because webm headers are included) but contain no real audio data.
const MIN_RECORDING_SECONDS = 2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when a transcript contains enough real words to be worth saving. */
function isTranscriptMeaningful(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < MIN_TRANSCRIPT_LENGTH) return false
  const words = trimmed.split(/\s+/).filter((w) => w.length > 1)
  return words.length >= 1
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HomePage() {
  const { memos, addMemo } = useMemos()
  const { setRecordingActiveCallback, setCancelRecordingCallback } = useSessionTimeout()

  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [micTestStatus, setMicTestStatus] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)

  const [voiceOnlyMode, setVoiceOnlyMode] = useState(false)

  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>("Unsorted")
  const [memoTitle, setMemoTitle] = useState<string>("")
  const [confirmed, setConfirmed] = useState(false)

  const [rateLimitCount, setRateLimitCount] = useState(0)
  const [rateLimitLoading, setRateLimitLoading] = useState(true)

  const supabase = createClient()
  const [username, setUsername] = useState<string | null>(null)
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<any>(null)
  const isCancellingRef = useRef(false)
  const isRecordingActiveRef = useRef(false)
  const transcriptRef = useRef("")
  const recordingStartTimeRef = useRef<number>(0)

  // Expose recording state to the session timeout provider
  const recordingRef = useRef(false)

  const micTestStreamRef = useRef<MediaStream | null>(null)
  const micTestAudioContextRef = useRef<AudioContext | null>(null)
  const micTestAnalyserRef = useRef<AnalyserNode | null>(null)
  const micTestAnimationFrameRef = useRef<number | null>(null)

  // ---------------------------------------------------------------------------
  // cancelRecording — stable reference used by session timeout
  // ---------------------------------------------------------------------------
  const cancelRecording = useCallback(() => {
    stopMicrophoneTest()
    isCancellingRef.current = true
    setError(null)
    setMicTestStatus(null)
    setPendingTranscript(null)
    setMemoTitle("")
    setConfirmed(false)
    setRecordingTime(0)

    if (voiceOnlyMode) {
      transcriptRef.current = ""
      isRecordingActiveRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
    } else {
      audioChunksRef.current = []
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      } else {
        isCancellingRef.current = false
        setRecording(false)
        recordingRef.current = false
      }
    }

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
    setRecording(false)
    recordingRef.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOnlyMode])

  // ---------------------------------------------------------------------------
  // Register callbacks with session timeout provider
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setRecordingActiveCallback(() => recordingRef.current)
    setCancelRecordingCallback(cancelRecording)

    return () => {
      setRecordingActiveCallback(null)
      setCancelRecordingCallback(null)
    }
  }, [setRecordingActiveCallback, setCancelRecordingCallback, cancelRecording])

  // Keep recordingRef in sync with recording state
  useEffect(() => {
    recordingRef.current = recording
  }, [recording])

  // ---------------------------------------------------------------------------
  // Fetch real rate limit count from the database
  // ---------------------------------------------------------------------------
  const fetchRateLimitCount = async () => {
    try {
      const res = await fetch("/api/gemini/usage")
      if (res.ok) {
        const data = await res.json()
        setRateLimitCount(data.count ?? 0)
      }
    } catch {
      // ignore
    } finally {
      setRateLimitLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      fetchRateLimitCount()

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
      isRecordingActiveRef.current = false

      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)

      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }

      if (micTestAnimationFrameRef.current) {
        cancelAnimationFrame(micTestAnimationFrameRef.current)
      }

      if (micTestStreamRef.current) {
        micTestStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      if (micTestAudioContextRef.current) {
        void micTestAudioContextRef.current.close()
      }
    }
  }, [])

  const stopMicrophoneTest = () => {
    if (micTestAnimationFrameRef.current) {
      cancelAnimationFrame(micTestAnimationFrameRef.current)
      micTestAnimationFrameRef.current = null
    }

    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((track) => track.stop())
      micTestStreamRef.current = null
    }

    if (micTestAudioContextRef.current) {
      void micTestAudioContextRef.current.close()
      micTestAudioContextRef.current = null
    }

    micTestAnalyserRef.current = null
    setIsTestingMic(false)
    setMicLevel(0)
  }

  const requestMicrophoneAccess = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone access.")
    }

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err: any) {
      const permissionName = "microphone" as PermissionName
      const permissionsApiAvailable =
        typeof navigator !== "undefined" && !!navigator.permissions?.query

      if (permissionsApiAvailable) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: permissionName })

          if (permissionStatus.state === "prompt") {
            return await navigator.mediaDevices.getUserMedia({ audio: true })
          }
        } catch {
          // ignore permissions api issues
        }
      }

      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        throw new Error(
          "Microphone permission is blocked. Please allow microphone access in your browser and try again."
        )
      }

      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        throw new Error("No microphone was found on this device.")
      }

      throw new Error("Unable to access your microphone. Please try again.")
    }
  }

  const testMicrophone = async () => {
    if (isTestingMic) {
      stopMicrophoneTest()
      setMicTestStatus("Microphone test stopped.")
      return
    }

    setMicTestStatus(null)
    setError(null)
    setMicLevel(0)

    try {
      const stream = await requestMicrophoneAccess()
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.85
      source.connect(analyser)

      micTestStreamRef.current = stream
      micTestAudioContextRef.current = audioContext
      micTestAnalyserRef.current = analyser

      setIsTestingMic(true)
      setMicTestStatus(
        "Listening... speak to test your microphone, then press Stop Test when you're done."
      )

      const dataArray = new Uint8Array(analyser.fftSize)

      const updateMicLevel = () => {
        const activeAnalyser = micTestAnalyserRef.current
        if (!activeAnalyser) return

        activeAnalyser.getByteTimeDomainData(dataArray)

        let sumSquares = 0
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128
          sumSquares += normalized * normalized
        }

        const rms = Math.sqrt(sumSquares / dataArray.length)
        setMicLevel(rms * 100)

        micTestAnimationFrameRef.current = requestAnimationFrame(updateMicLevel)
      }

      updateMicLevel()
    } catch (err: any) {
      stopMicrophoneTest()
      setMicTestStatus(null)
      setError(err?.message || "Microphone test failed.")
    }
  }

  // ---------------------------------------------------------------------------
  // SpeechRecognition — continuous=false + restart strategy
  // ---------------------------------------------------------------------------
  const attachRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.lang = "en-US"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcriptRef.current += event.results[i][0].transcript + " "
        }
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        if (isRecordingActiveRef.current) {
          try { attachRecognition() } catch {}
        }
        return
      }

      isRecordingActiveRef.current = false
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)

      const messages: Record<string, string> = {
        "service-not-allowed": "Speech recognition is not available in this browser. Try updating Chrome or using a different browser.",
        "not-allowed": "Microphone access was denied. Please allow microphone permission and try again.",
        "network": "Network error with speech service. Please check your connection.",
        "audio-capture": "No microphone found. Please check your device.",
        "aborted": "Recording was cancelled.",
      }

      setError(messages[event.error] ?? `Speech error: ${event.error}. Please try again.`)
      setRecording(false)
      recordingRef.current = false
      setRecordingTime(0)
    }

    recognition.onend = () => {
      if (isCancellingRef.current) {
        isCancellingRef.current = false
        transcriptRef.current = ""
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
        setPendingTranscript(null)
        setRecording(false)
        recordingRef.current = false
        setRecordingTime(0)
        return
      }

      if (isRecordingActiveRef.current) {
        try { attachRecognition() } catch {}
        return
      }

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)

      const finalText = transcriptRef.current.trim()

      if (!finalText || !isTranscriptMeaningful(finalText)) {
        setError(
          finalText.length > 0
            ? "Recording was too short or unclear. Please speak for longer and try again."
            : "No speech detected. Please try again."
        )
        setRecording(false)
        recordingRef.current = false
        setRecordingTime(0)
        return
      }

      setPendingTranscript(finalText)
      setRecording(false)
      recordingRef.current = false
      setRecordingTime(0)
    }

    recognition.start()
  }

  const confirmAndSaveMemo = () => {
    if (!pendingTranscript) return

    if (!isTranscriptMeaningful(pendingTranscript)) {
      setError("Transcript appears to be empty. Please record again.")
      discardPendingMemo()
      return
    }

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
    stopMicrophoneTest()
    setPendingTranscript(null)
    setSelectedFolder("Unsorted")
    setMemoTitle("")
    setConfirmed(false)
    setMicTestStatus(null)
  }

  const processAudioWithGemini = async (audioBlob: Blob, durationSeconds: number, fileName?: string) => {
    if (durationSeconds < MIN_RECORDING_SECONDS) {
      setError("Recording was too short. Please hold the button and speak, then tap Stop.")
      setRecording(false)
      recordingRef.current = false
      setRecordingTime(0)
      return
    }

    if (audioBlob.size < MIN_AUDIO_BYTES) {
      setError("Recording was too short or silent. Please speak clearly and try again.")
      setRecording(false)
      recordingRef.current = false
      setRecordingTime(0)
      return
    }

    setIsProcessing(true)
    setError(null)

    const formData = new FormData()
    formData.append("audio", audioBlob, fileName || "recording.webm")
    formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)
    formData.append("timezoneOffset", String(new Date().getTimezoneOffset()))

    try {
      const response = await fetch("/api/gemini", { method: "POST", body: formData })

      if (!response.ok) {
        const errorData = await response.json()

        if (response.status === 429) {
          setRateLimitCount(errorData.count ?? DAILY_LIMIT)
          throw new Error(errorData.error || `Daily AI limit of ${DAILY_LIMIT} uses reached. Try again tomorrow.`)
        }

        if (response.status === 422 && errorData.noContent) {
          await fetchRateLimitCount()
          throw new Error(errorData.error || "No speech detected. This has not been counted against your daily limit.")
        }

        throw new Error(errorData.error || "Failed to process audio")
      }

      const data = await response.json()

      setRateLimitCount((prev) => Math.min(prev + 1, DAILY_LIMIT))
      fetchRateLimitCount()

      const rawTranscription = String(data?.transcription ?? "").trim()
      const thoughts: Array<{ text: string; label?: string; folder?: string; reminder_at?: string | null }> =
        Array.isArray(data?.thoughts) ? data.thoughts : []

      const safeThoughts = thoughts
        .map((t) => ({
          text: String(t?.text ?? "").trim(),
          label: String(t?.label ?? "").trim(),
          folder: String(t?.folder ?? "Unsorted").trim() || "Unsorted",
          reminder_at: t?.reminder_at ?? null,
        }))
        .filter((t) => isTranscriptMeaningful(t.text))
        .slice(0, 10)

      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })

      if (safeThoughts.length === 0) {
        addMemo({
          id: `${Date.now()}`,
          title: data?.label || `Memo ${memos.length + 1}`,
          status: "ready",
          date: dateLabel,
          category: "Unsorted",
          transcription: rawTranscription,
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
          reminder_at: t.reminder_at ?? null,
        })
      })
    } catch (error: any) {
      console.error("Error processing audio:", error)
      setError(error.message || "Failed to process audio")
    } finally {
      setIsProcessing(false)
    }
  }

  const startRecording = async () => {
    try {
      stopMicrophoneTest()
      setError(null)
      setMicTestStatus(null)
      setPendingTranscript(null)
      setMemoTitle("")
      setConfirmed(false)
      isCancellingRef.current = false

      if (voiceOnlyMode) {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

        if (!SpeechRecognition) {
          setError("Voice-to-Text is not supported in this browser. Try Chrome on desktop or Android, or use AI mode instead.")
          return
        }

        transcriptRef.current = ""
        isRecordingActiveRef.current = true

        setRecording(true)
        recordingRef.current = true
        recordingTimerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000)
        recordingTimeoutRef.current = setTimeout(() => stopRecording(), 120000)

        attachRecognition()
        return
      }

      if (rateLimitCount >= DAILY_LIMIT) {
        setError(`Daily AI limit of ${DAILY_LIMIT} uses reached. Switch to Voice-to-Text Only mode or try again tomorrow.`)
        return
      }

      const stream = await requestMicrophoneAccess()
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      recordingStartTimeRef.current = Date.now()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())

        if (isCancellingRef.current) {
          isCancellingRef.current = false
          audioChunksRef.current = []
          setRecording(false)
          recordingRef.current = false
          setRecordingTime(0)
          return
        }

        const durationSeconds = (Date.now() - recordingStartTimeRef.current) / 1000
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        await processAudioWithGemini(audioBlob, durationSeconds)
        setRecording(false)
        recordingRef.current = false
        setRecordingTime(0)
      }

      mediaRecorder.start()
      setRecording(true)
      recordingRef.current = true
      recordingTimerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000)
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") stopRecording()
      }, 120000)
    } catch (err: any) {
      setError(err?.message || "Microphone access denied.")
      setRecording(false)
      recordingRef.current = false
    }
  }

  const stopRecording = () => {
    if (voiceOnlyMode) {
      isRecordingActiveRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
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
  const micLevelPercent = Math.min(Math.max(micLevel * 2.2, 0), 100)

  const now = new Date()
  const oneWeekFromNow = new Date(now)
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7)

  const upcomingMemos = memos.filter((memo) => {
    if (!memo.reminder_at) return false
    const reminderDate = new Date(memo.reminder_at)
    return !Number.isNaN(reminderDate.getTime()) && reminderDate > now
  })

  const upcomingMemosNextWeek = upcomingMemos.filter((memo) => {
    const reminderDate = new Date(memo.reminder_at as string)
    return reminderDate <= oneWeekFromNow
  })

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

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-2 border-border bg-secondary/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Upcoming Memos</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{upcomingMemos.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Memos with reminders scheduled in the future
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/20">
                  <Calendar className="size-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border bg-secondary/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Upcoming Within 7 Days
                  </p>
                  <p className="mt-2 text-3xl font-bold text-foreground">
                    {upcomingMemosNextWeek.length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reminder-based memos due within the next week
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/20">
                  <Clock3 className="size-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border bg-secondary/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">AI API Usages Today</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">
                    {rateLimitLoading ? "…" : rateLimitCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Out of {DAILY_LIMIT} daily AI requests
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/20">
                  <Brain className="size-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border bg-secondary/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Memos Created</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{memos.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Total memos currently stored in your workspace
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/20">
                  <FileText className="size-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
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
                        setMicTestStatus(null)
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

                {/* Microphone test */}
                <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Mic className="size-4 text-accent" />
                      </div>
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-foreground mb-0.5">Microphone Test</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Speak and watch the input bar respond, then stop the test when you're done.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={isTestingMic ? "destructive" : "outline"}
                      size="sm"
                      className="shrink-0"
                      onClick={testMicrophone}
                      disabled={recording || isProcessing}
                    >
                      {isTestingMic ? (
                        <>
                          <Square className="mr-2 h-4 w-4 fill-current" />
                          Stop Test
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-4 w-4" />
                          Start Test
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{isTestingMic ? "Listening for your voice..." : "Mic input level"}</span>
                      <span className="font-mono">{Math.round(micLevelPercent)}%</span>
                    </div>
                    <Progress value={micLevelPercent} className="h-3" />
                    <p className="text-[11px] text-muted-foreground">
                      Talk normally and watch the bar move. Little or no movement usually means the browser is not receiving mic audio.
                    </p>
                  </div>

                  {micTestStatus && (
                    <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400 flex items-start gap-2">
                      <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                      <span>{micTestStatus}</span>
                    </div>
                  )}
                </div>

                {!voiceOnlyMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3 text-accent" />
                        Daily AI uses
                      </span>
                      <span className={rateLimitExceeded ? "text-destructive font-semibold" : ""}>
                        {rateLimitLoading ? "…" : `${rateLimitCount} / ${DAILY_LIMIT}`}
                      </span>
                    </div>
                    <Progress
                      value={rateLimitLoading ? 0 : rateLimitProgress}
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

                {recording && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Recording in progress... Stop to save or Cancel to discard.
                      </span>
                      <span className="font-mono font-medium text-accent">{formatTime(recordingTime)}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {120 - recordingTime}s remaining
                    </p>
                  </div>
                )}

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

                {showRecordButton && (
                  <div className="pt-1">
                    {recording ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          className="h-16 rounded-xl text-base font-semibold"
                          onClick={stopRecording}
                          variant="destructive"
                          size="lg"
                        >
                          <Square className="mr-2 h-5 w-5 fill-current" />
                          Stop Recording
                        </Button>
                        <Button
                          className="h-16 rounded-xl text-base font-semibold"
                          onClick={cancelRecording}
                          variant="outline"
                          size="lg"
                        >
                          <X className="mr-2 h-5 w-5" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full h-16 rounded-xl text-base font-semibold"
                        onClick={startRecording}
                        variant="default"
                        disabled={isProcessing || (!voiceOnlyMode && rateLimitExceeded)}
                        size="lg"
                      >
                        <Mic className="mr-2 h-5 w-5" />
                        Start Recording
                      </Button>
                    )}
                  </div>
                )}

                {isProcessing && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-accent/10 p-4 text-sm text-accent">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-medium">Processing with AI...</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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