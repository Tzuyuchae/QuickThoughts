/**
 * SessionTimeoutContext
 *
 * Tracks user inactivity and automatically signs them out after a configurable
 * period of no interaction. Displays a warning modal before signing out so the
 * user can extend their session with a single click.
 *
 * Architecture:
 *  - A single `useEffect` attaches passive event listeners for mouse, keyboard,
 *    touch, and scroll events on the document. Every event resets the inactivity
 *    timer via a ref so we never trigger unnecessary re-renders during normal use.
 *  - Two timers run in sequence:
 *      1. WARNING_TIMER  — fires WARN_BEFORE_MS before the hard timeout, showing
 *                          the modal and starting a visible countdown.
 *      2. TIMEOUT_TIMER  — fires when inactivity exceeds TIMEOUT_MS and signs
 *                          the user out.
 *  - `onRecordingActive` callback: the capture page can register a function that
 *    returns true when a recording is in progress. If a recording is active when
 *    the timeout fires, we cancel the recording before signing out so the user
 *    does not lose data silently.
 *  - Session is only tracked when a Supabase user session exists. Anonymous /
 *    unauthenticated visitors are never affected.
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, LogOut, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Total inactivity time (ms) before the user is signed out. Default: 30 min */
const TIMEOUT_MS = 2 * 60 * 1000;

/**
 * How long before the hard timeout to show the warning modal.
 * Default: 1 minutes — gives the user enough time to respond.
 */
const WARN_BEFORE_MS = 1 * 60 * 1000;

/** How often the countdown in the modal ticks (ms). */
const COUNTDOWN_TICK_MS = 1000;

// ---------------------------------------------------------------------------
// Events that reset the inactivity timer
// ---------------------------------------------------------------------------
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "touchmove",
  "scroll",
  "wheel",
  "click",
  "focus",
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SessionTimeoutContextType {
  /**
   * Register a callback that returns `true` when a recording is currently
   * active. If set, the timeout logic will invoke this before signing out
   * so any pending recording can be gracefully cancelled.
   */
  setRecordingActiveCallback: (cb: (() => boolean) | null) => void;

  /**
   * Register a callback that the timeout can call to cancel an in-progress
   * recording before signing the user out.
   */
  setCancelRecordingCallback: (cb: (() => void) | null) => void;

  /** Manually reset the inactivity timer (e.g., after a programmatic action). */
  resetTimer: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(
  undefined
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionTimeoutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();

  // Whether to even run the timeout (only when logged in)
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Modal visibility
  const [showWarning, setShowWarning] = useState(false);

  // Seconds remaining in the countdown shown inside the modal
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARN_BEFORE_MS / 1000));

  // Callbacks registered by the capture page
  const recordingActiveCallbackRef = useRef<(() => boolean) | null>(null);
  const cancelRecordingCallbackRef = useRef<(() => void) | null>(null);

  // Timer refs so we can clear / reset without stale closures
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref to track whether the warning modal is currently open (avoids stale closure)
  const warningActiveRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Auth state — only activate timeout when a user is signed in
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    // Check initial state
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session?.user);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // ---------------------------------------------------------------------------
  // Sign-out logic
  // ---------------------------------------------------------------------------
  const handleSignOut = useCallback(async () => {
    // Cancel any in-progress recording first
    if (
      recordingActiveCallbackRef.current?.() &&
      cancelRecordingCallbackRef.current
    ) {
      cancelRecordingCallbackRef.current();
      // Small delay so the recording cancellation state settles
      await new Promise((r) => setTimeout(r, 300));
    }

    setShowWarning(false);
    warningActiveRef.current = false;

    await supabase.auth.signOut();
    router.push("/login");
  }, [supabase, router]);

  // ---------------------------------------------------------------------------
  // Countdown ticker (runs while the warning modal is open)
  // ---------------------------------------------------------------------------
  const startCountdown = useCallback(() => {
    setSecondsLeft(Math.floor(WARN_BEFORE_MS / 1000));

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, COUNTDOWN_TICK_MS);
  }, []);

  // ---------------------------------------------------------------------------
  // Timer management
  // ---------------------------------------------------------------------------
  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    warningTimerRef.current = null;
    timeoutTimerRef.current = null;
    countdownIntervalRef.current = null;
  }, []);

  const scheduleTimers = useCallback(() => {
    clearAllTimers();

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      warningActiveRef.current = true;
      startCountdown();

      timeoutTimerRef.current = setTimeout(() => {
        handleSignOut();
      }, WARN_BEFORE_MS);
    }, TIMEOUT_MS - WARN_BEFORE_MS);
  }, [clearAllTimers, handleSignOut, startCountdown]);

  // ---------------------------------------------------------------------------
  // Activity listener
  // ---------------------------------------------------------------------------
  const handleActivity = useCallback(() => {
    // If the warning is already shown, don't reset — the user must click a button
    if (warningActiveRef.current) return;
    scheduleTimers();
  }, [scheduleTimers]);

  // Start / stop timers based on auth state
  useEffect(() => {
    if (!isAuthenticated) {
      clearAllTimers();
      setShowWarning(false);
      warningActiveRef.current = false;
      return;
    }

    scheduleTimers();

    const opts: AddEventListenerOptions = { passive: true };
    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, handleActivity, opts);
    });

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, scheduleTimers, clearAllTimers, handleActivity]);

  // ---------------------------------------------------------------------------
  // "Stay signed in" handler — extends the session
  // ---------------------------------------------------------------------------
  const handleExtendSession = useCallback(() => {
    setShowWarning(false);
    warningActiveRef.current = false;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    scheduleTimers();
  }, [scheduleTimers]);

  // ---------------------------------------------------------------------------
  // Context API
  // ---------------------------------------------------------------------------
  const setRecordingActiveCallback = useCallback(
    (cb: (() => boolean) | null) => {
      recordingActiveCallbackRef.current = cb;
    },
    []
  );

  const setCancelRecordingCallback = useCallback(
    (cb: (() => void) | null) => {
      cancelRecordingCallbackRef.current = cb;
    },
    []
  );

  const resetTimer = useCallback(() => {
    if (!warningActiveRef.current) scheduleTimers();
  }, [scheduleTimers]);

  // ---------------------------------------------------------------------------
  // Warning Modal UI
  // ---------------------------------------------------------------------------
  const totalWarningSeconds = Math.floor(WARN_BEFORE_MS / 1000);
  const countdownProgress = ((totalWarningSeconds - secondsLeft) / totalWarningSeconds) * 100;

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0
      ? `${m}:${sec.toString().padStart(2, "0")}`
      : `${sec}s`;
  };

  const isRecordingActive = recordingActiveCallbackRef.current?.() ?? false;

  return (
    <SessionTimeoutContext.Provider
      value={{ setRecordingActiveCallback, setCancelRecordingCallback, resetTimer }}
    >
      {children}

      <Dialog open={showWarning} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md border-2 border-destructive/40 bg-background [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/15 shrink-0">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <DialogTitle className="text-lg font-semibold leading-tight">
                Session expiring soon
              </DialogTitle>
            </div>

            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {isRecordingActive ? (
                <>
                  You have an <span className="font-medium text-foreground">active recording</span>{" "}
                  in progress. If you don't respond, the recording will be cancelled and you'll be
                  signed out automatically.
                </>
              ) : (
                <>
                  You've been inactive for a while. For your security, you'll be signed out
                  automatically unless you choose to stay.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Countdown display */}
          <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                <span>Signing out in</span>
              </div>
              <span
                className={`font-mono font-bold text-lg tabular-nums ${
                  secondsLeft <= 30 ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatCountdown(secondsLeft)}
              </span>
            </div>

            <Progress
              value={countdownProgress}
              className={`h-2 ${
                secondsLeft <= 30
                  ? "[&>div]:bg-destructive"
                  : "[&>div]:bg-accent"
              }`}
            />

            {isRecordingActive && (
              <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3 shrink-0" />
                Active recording will be cancelled on sign-out
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Sign out now
            </Button>
            <Button
              className="flex-1 gap-2 font-semibold"
              onClick={handleExtendSession}
              autoFocus
            >
              <RefreshCw className="size-4" />
              Stay signed in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SessionTimeoutContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSessionTimeout() {
  const ctx = useContext(SessionTimeoutContext);
  if (!ctx) throw new Error("useSessionTimeout must be used within a SessionTimeoutProvider");
  return ctx;
}