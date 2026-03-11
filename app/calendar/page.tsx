"use client"

import { useEffect, useMemo, useState, useCallback, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Navbar } from "@/components/ui/navbar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  List,
  Clock,
  CheckCircle2,
  Circle,
  AlarmClock,
  StickyNote,
  CalendarCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Memo {
  id: string
  title: string
  content: string | null
  reminder_at: string // ISO timestamp
  reminder_completed: boolean
  folder_id: string | null
  folder_name?: string | null
  created_at: string
}

type CalendarView = "month" | "week" | "day" | "agenda"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

function memoUrgency(memo: Memo): "overdue" | "today" | "soon" | "upcoming" {
  if (memo.reminder_completed) return "upcoming"
  const now = new Date()
  const d = new Date(memo.reminder_at)
  if (d < startOfDay(now)) return "overdue"
  if (isSameDay(d, now)) return "today"
  const diff = (startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000
  if (diff <= 3) return "soon"
  return "upcoming"
}

const urgencyStyles: Record<string, string> = {
  overdue: "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25",
  today:   "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/30 hover:bg-amber-500/25",
  soon:    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-400/30 hover:bg-blue-500/25",
  upcoming:"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-400/30 hover:bg-emerald-500/25",
}

const urgencyDot: Record<string, string> = {
  overdue:  "bg-destructive",
  today:    "bg-amber-500",
  soon:     "bg-blue-500",
  upcoming: "bg-emerald-500",
}

// ─── Memo chip ────────────────────────────────────────────────────────────────

function MemoChip({
  memo,
  onClick,
}: {
  memo: Memo
  onClick?: (e?: MouseEvent<HTMLButtonElement>) => void
}) {
  const u = memoUrgency(memo)
  return (
    <button
      onClick={(e) => onClick?.(e)}
      className={cn(
        "w-full text-left text-xs px-2 py-0.5 rounded border truncate transition-colors",
        urgencyStyles[u],
        memo.reminder_completed && "opacity-50 line-through"
      )}
    >
      {formatTime(memo.reminder_at)} {memo.title}
    </button>
  )
}

// ─── Memo modal ───────────────────────────────────────────────────────────────

function MemoModal({
  memo,
  open,
  onClose,
  onToggleComplete,
}: {
  memo: Memo | null
  open: boolean
  onClose: () => void
  onToggleComplete: (memo: Memo) => void
}) {
  if (!memo) return null
  const u = memoUrgency(memo)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span
              className={cn(
                "inline-flex size-2 rounded-full shrink-0",
                urgencyDot[u]
              )}
            />
            <span className={memo.reminder_completed ? "line-through opacity-60" : ""}>
              {memo.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlarmClock className="size-4 shrink-0" />
            <span>{formatDate(memo.reminder_at)} at {formatTime(memo.reminder_at)}</span>
          </div>

          {/* Folder */}
          {memo.folder_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StickyNote className="size-4 shrink-0" />
              <span>{memo.folder_name}</span>
            </div>
          )}

          {/* Status badge */}
          <div>
            {memo.reminder_completed ? (
              <Badge variant="secondary" className="gap-1 text-emerald-600 bg-emerald-500/10">
                <CheckCircle2 className="size-3" /> Completed
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className={cn(
                  "gap-1",
                  u === "overdue" && "text-destructive bg-destructive/10",
                  u === "today"   && "text-amber-600 bg-amber-500/10",
                  u === "soon"    && "text-blue-600 bg-blue-500/10",
                  u === "upcoming"&& "text-emerald-600 bg-emerald-500/10",
                )}
              >
                <Clock className="size-3" />
                {u === "overdue" ? "Overdue" : u === "today" ? "Due today" : u === "soon" ? "Due soon" : "Upcoming"}
              </Badge>
            )}
          </div>

          {/* Content */}
          {memo.content && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm text-foreground whitespace-pre-wrap">
              {memo.content}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant={memo.reminder_completed ? "outline" : "default"}
              size="sm"
              className="gap-2"
              onClick={() => onToggleComplete(memo)}
            >
              {memo.reminder_completed ? (
                <><Circle className="size-4" /> Mark incomplete</>
              ) : (
                <><CheckCircle2 className="size-4" /> Mark complete</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const today = useMemo(() => new Date(), [])

  const [view, setView] = useState<CalendarView>("month")
  const [cursor, setCursor] = useState<Date>(startOfDay(today)) // the "current" date/week/month
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // ── Fetch memos with reminders ──────────────────────────────────────────────
  const fetchMemos = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace("/login"); return }

    // Use the decrypting RPC so titles are readable (they're stored encrypted)
    const { data, error } = await supabase.rpc("get_user_memos_decrypted")

    if (!error && data) {
      // Filter to only memos that have a reminder, map to calendar Memo shape
      const withReminders = data
        .filter((m: any) => m.reminder_at != null)
        .map((m: any) => ({
          id: m.id,
          title: m.title ?? "Untitled",
          content: m.transcription ?? null,   // transcription is the memo body
          reminder_at: m.reminder_at,
          reminder_completed: m.reminder_completed ?? false,
          folder_id: null,                    // not returned by RPC, not needed for calendar
          folder_name: m.category !== "Unsorted" ? m.category : null,
          created_at: m.created_at,
        }))
        .sort((a: any, b: any) =>
          new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime()
        )

      setMemos(withReminders)
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { void fetchMemos() }, [fetchMemos])

  // ── Toggle complete ────────────────────────────────────────────────────────
  async function handleToggleComplete(memo: Memo) {
    const next = !memo.reminder_completed

    // Optimistic update
    setMemos((prev) => prev.map((m) => m.id === memo.id ? { ...m, reminder_completed: next } : m))
    setSelectedMemo((prev) => prev?.id === memo.id ? { ...prev, reminder_completed: next } : prev)

    const { error } = await supabase
      .from("memos")
      .update({ reminder_completed: next })
      .eq("id", memo.id)

    // Roll back on failure
    if (error) {
      setMemos((prev) => prev.map((m) => m.id === memo.id ? { ...m, reminder_completed: !next } : m))
      setSelectedMemo((prev) => prev?.id === memo.id ? { ...prev, reminder_completed: !next } : prev)
    }
  }

  // ── Open modal ─────────────────────────────────────────────────────────────
  function openMemo(memo: Memo) {
    setSelectedMemo(memo)
    setModalOpen(true)
  }

  // ── Memos for a given day ──────────────────────────────────────────────────
  function memosForDay(day: Date): Memo[] {
    return memos.filter((m) => isSameDay(new Date(m.reminder_at), day))
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigate(dir: -1 | 1) {
    setCursor((prev) => {
      const d = new Date(prev)
      if (view === "month") d.setMonth(d.getMonth() + dir)
      else if (view === "week") d.setDate(d.getDate() + dir * 7)
      else if (view === "day") d.setDate(d.getDate() + dir)
      else d.setMonth(d.getMonth() + dir) // agenda
      return d
    })
  }

  function goToday() { setCursor(startOfDay(today)) }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date()
    const overdue = memos.filter((m) => !m.reminder_completed && new Date(m.reminder_at) < startOfDay(now)).length
    const dueToday = memos.filter((m) => !m.reminder_completed && isSameDay(new Date(m.reminder_at), now)).length
    const upcoming = memos.filter((m) => !m.reminder_completed && new Date(m.reminder_at) > now).length
    const done = memos.filter((m) => m.reminder_completed).length
    return { overdue, dueToday, upcoming, done }
  }, [memos])

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = useMemo(() => {
    if (view === "month" || view === "agenda")
      return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === "week") {
      const start = new Date(cursor)
      start.setDate(cursor.getDate() - cursor.getDay())
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      if (start.getMonth() === end.getMonth())
        return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
      return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`
    }
    return `${WEEKDAYS_LONG[cursor.getDay()]}, ${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`
  }, [view, cursor])

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW RENDERERS
  // ─────────────────────────────────────────────────────────────────────────

  // ── Month view ─────────────────────────────────────────────────────────────
  function renderMonth() {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrev = new Date(year, month, 0).getDate()

    const cells: { date: Date; isCurrentMonth: boolean }[] = []

    // Padding from prev month
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false })
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
    }
    // Padding to fill grid (6 rows × 7 = 42)
    while (cells.length < 42) {
      cells.push({ date: new Date(year, month + 1, cells.length - daysInMonth - firstDay + 1), isCurrentMonth: false })
    }

    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
          {cells.map(({ date, isCurrentMonth }, i) => {
            const dayMemos = memosForDay(date)
            const isToday = isSameDay(date, today)
            const isCursor = isSameDay(date, cursor)

            return (
              <div
                key={i}
                onClick={() => { setCursor(date); if (dayMemos.length > 0) setView("day") }}
                className={cn(
                  "border-b border-r border-border p-1 min-h-0 flex flex-col gap-0.5 cursor-pointer transition-colors",
                  !isCurrentMonth && "bg-muted/30",
                  isCurrentMonth && "hover:bg-secondary/30",
                  isCursor && !isToday && "bg-secondary/50",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0 self-end",
                    !isCurrentMonth && "text-muted-foreground/50",
                    isCurrentMonth && !isToday && "text-foreground",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {date.getDate()}
                </span>

                <div className="flex flex-col gap-0.5 overflow-hidden min-h-0">
                  {dayMemos.slice(0, 3).map((m) => (
                    <MemoChip
                      key={m.id}
                      memo={m}
                      onClick={(e: any) => { e.stopPropagation(); openMemo(m) }}
                    />
                  ))}
                  {dayMemos.length > 3 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCursor(date); setView("day") }}
                      className="text-xs text-muted-foreground hover:text-foreground text-left px-1"
                    >
                      +{dayMemos.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Week view ──────────────────────────────────────────────────────────────
  function renderWeek() {
    const weekStart = new Date(cursor)
    weekStart.setDate(cursor.getDate() - cursor.getDay())

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-background z-10">
          {days.map((day, i) => (
            <div
              key={i}
              className={cn(
                "py-2 text-center border-r border-border last:border-r-0",
                isSameDay(day, today) && "bg-primary/5"
              )}
            >
              <p className="text-xs text-muted-foreground">{WEEKDAYS[i]}</p>
              <button
                onClick={() => { setCursor(day); setView("day") }}
                className={cn(
                  "text-sm font-semibold w-8 h-8 rounded-full mx-auto flex items-center justify-center transition-colors hover:bg-secondary",
                  isSameDay(day, today) && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {day.getDate()}
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayMemos = memosForDay(day)
            return (
              <div
                key={i}
                className={cn(
                  "border-r border-border last:border-r-0 min-h-48 p-2 space-y-1",
                  isSameDay(day, today) && "bg-primary/5"
                )}
              >
                {dayMemos.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center mt-4">—</p>
                )}
                {dayMemos.map((m) => (
                  <MemoChip key={m.id} memo={m} onClick={() => openMemo(m)} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Day view ───────────────────────────────────────────────────────────────
  function renderDay() {
    const dayMemos = memosForDay(cursor)

    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          {dayMemos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <CalendarCheck className="size-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No reminders for this day.</p>
              <p className="text-xs text-muted-foreground/60">
                Set a reminder on any memo to see it here.
              </p>
            </div>
          ) : (
            dayMemos.map((m) => {
              const u = memoUrgency(m)
              return (
                <button
                  key={m.id}
                  onClick={() => openMemo(m)}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-colors",
                    urgencyStyles[u],
                    m.reminder_completed && "opacity-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-medium text-sm", m.reminder_completed && "line-through")}>
                        {m.title}
                      </p>
                      {m.content && (
                        <p className="text-xs mt-1 opacity-70 line-clamp-2">{m.content}</p>
                      )}
                      {m.folder_name && (
                        <p className="text-xs mt-1 opacity-60">{m.folder_name}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-mono">{formatTime(m.reminder_at)}</span>
                      {m.reminder_completed && (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // ── Agenda view ────────────────────────────────────────────────────────────
  function renderAgenda() {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
    const daysWithMemos = days.map((d) => ({ date: d, memos: memosForDay(d) })).filter((x) => x.memos.length > 0)

    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {daysWithMemos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <CalendarCheck className="size-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No reminders this month.</p>
            </div>
          ) : (
            daysWithMemos.map(({ date, memos: dayMemos }) => (
              <div key={date.toISOString()}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "flex flex-col items-center justify-center w-10 h-10 rounded-xl text-xs font-bold shrink-0",
                    isSameDay(date, today)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  )}>
                    <span className="leading-none">{WEEKDAYS[date.getDay()].slice(0, 1)}</span>
                    <span className="leading-none text-sm">{date.getDate()}</span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-2 pl-12">
                  {dayMemos.map((m) => {
                    const u = memoUrgency(m)
                    return (
                      <button
                        key={m.id}
                        onClick={() => openMemo(m)}
                        className={cn(
                          "w-full text-left rounded-lg border px-3 py-2 flex items-center gap-3 transition-colors",
                          urgencyStyles[u],
                          m.reminder_completed && "opacity-50"
                        )}
                      >
                        <span className={cn("size-2 rounded-full shrink-0", urgencyDot[u])} />
                        <span className={cn("flex-1 text-sm font-medium truncate", m.reminder_completed && "line-through")}>
                          {m.title}
                        </span>
                        <span className="text-xs font-mono shrink-0 opacity-70">{formatTime(m.reminder_at)}</span>
                        {m.reminder_completed && <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container mx-auto px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading calendar...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col container mx-auto px-4 py-6 gap-4">

        {/* ── Stats bar ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Overdue",  value: stats.overdue,  dot: "bg-destructive",  dim: stats.overdue  === 0 },
            { label: "Due Today",value: stats.dueToday, dot: "bg-amber-500",    dim: stats.dueToday === 0 },
            { label: "Upcoming", value: stats.upcoming, dot: "bg-emerald-500",  dim: stats.upcoming === 0 },
            { label: "Completed",value: stats.done,     dot: "bg-muted-foreground", dim: false },
          ].map(({ label, value, dot, dim }) => (
            <div
              key={label}
              className={cn(
                "rounded-xl border border-border bg-secondary/20 px-4 py-3 flex items-center gap-3",
                dim && "opacity-50"
              )}
            >
              <span className={cn("size-2.5 rounded-full shrink-0", dot)} />
              <div>
                <p className="text-lg font-bold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Calendar panel ─────────────────────────────────────────────────── */}
        <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-0">

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border flex-wrap gap-y-2">
            {/* Left: nav */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
                Today
              </Button>
              <h2 className="text-sm font-semibold ml-1 hidden sm:block">{title}</h2>
            </div>

            {/* Right: view switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
              {(
                [
                  { key: "month",  label: "Month",  Icon: LayoutGrid    },
                  { key: "week",   label: "Week",   Icon: CalendarDays  },
                  { key: "day",    label: "Day",    Icon: Clock         },
                  { key: "agenda", label: "Agenda", Icon: List          },
                ] as { key: CalendarView; label: string; Icon: any }[]
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    view === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile title */}
          <p className="sm:hidden text-sm font-semibold px-4 py-2 border-b border-border">{title}</p>

          {/* View content */}
          {view === "month"  && renderMonth()}
          {view === "week"   && renderWeek()}
          {view === "day"    && renderDay()}
          {view === "agenda" && renderAgenda()}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {[
            { dot: "bg-destructive",    label: "Overdue"  },
            { dot: "bg-amber-500",      label: "Today"    },
            { dot: "bg-blue-500",       label: "Due soon (≤3 days)" },
            { dot: "bg-emerald-500",    label: "Upcoming" },
          ].map(({ dot, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", dot)} /> {label}
            </span>
          ))}
        </div>
      </main>

      {/* Memo modal */}
      <MemoModal
        memo={selectedMemo}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onToggleComplete={handleToggleComplete}
      />
    </div>
  )
}