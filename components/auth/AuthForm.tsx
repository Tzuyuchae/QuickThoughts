"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight, Eye, EyeOff, AlertTriangle, Lock } from "lucide-react"
import { toast } from "sonner"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

type AuthMode = "login" | "signup"

interface AuthFormProps {
  mode: AuthMode
}

// ---------------------------------------------------------------------------
// Config — must match server values in /api/auth/login/route.ts
// ---------------------------------------------------------------------------
const MAX_CLIENT_ATTEMPTS = 5   // After this many failures, start enforcing backoff
const BASE_BACKOFF_MS = 2000    // 2s → 4s → 8s → 16s → 32s (doubles each failure)
const MAX_BACKOFF_MS = 30_000   // Cap at 30s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function getPasswordRequirementError(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters."
  if (!/[a-z]/.test(pw)) return "Password must include at least 1 lowercase letter."
  if (!/[A-Z]/.test(pw)) return "Password must include at least 1 uppercase letter."
  if (!/\d/.test(pw)) return "Password must include at least 1 number."
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) {
    return "Password must include at least 1 special character."
  }
  return null
}

function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_SITE_URL ?? ""
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000)
  if (totalSecs >= 60) {
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  return `${totalSecs}s`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const isSignup = mode === "signup"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Signup verification
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form")
  const [code, setCode] = useState("")

  const [loading, setLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Brute-force protection state (login mode only)
  // ---------------------------------------------------------------------------
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [backoffUntil, setBackoffUntil] = useState<number | null>(null)   // timestamp ms
  const [countdown, setCountdown] = useState(0)                            // remaining ms
  const [serverLockoutSeconds, setServerLockoutSeconds] = useState<number | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // Tick the countdown every second
  useEffect(() => {
    if (backoffUntil === null) return

    const tick = () => {
      const remaining = backoffUntil - Date.now()
      if (remaining <= 0) {
        setBackoffUntil(null)
        setCountdown(0)
        if (countdownRef.current) clearInterval(countdownRef.current)
        return
      }
      setCountdown(remaining)
    }

    tick()
    countdownRef.current = setInterval(tick, 500)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [backoffUntil])

  // Reset all brute-force state when switching modes
  useEffect(() => {
    setSignupStep("form")
    setCode("")
    setShowPassword(false)
    setShowConfirmPassword(false)
    setFailedAttempts(0)
    setBackoffUntil(null)
    setCountdown(0)
    setServerLockoutSeconds(null)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [mode])

  const isLockedOut = backoffUntil !== null && countdown > 0
  const attemptsRemaining = Math.max(0, MAX_CLIENT_ATTEMPTS - failedAttempts)

  // ---------------------------------------------------------------------------
  // Register a failed login attempt and compute next backoff
  // ---------------------------------------------------------------------------
  function registerFailure(serverRetryAfterSeconds?: number) {
    const next = failedAttempts + 1
    setFailedAttempts(next)

    if (serverRetryAfterSeconds) {
      // Server told us exactly how long — honour that
      setServerLockoutSeconds(serverRetryAfterSeconds)
      setBackoffUntil(Date.now() + serverRetryAfterSeconds * 1000)
      return
    }

    if (next >= MAX_CLIENT_ATTEMPTS) {
      // Exponential backoff: 2^(attempts - MAX) * BASE, capped at MAX_BACKOFF_MS
      const exponent = next - MAX_CLIENT_ATTEMPTS
      const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, exponent), MAX_BACKOFF_MS)
      setBackoffUntil(Date.now() + delay)
    }
  }

  // ---------------------------------------------------------------------------
  // Login (via server route for rate-limit enforcement)
  // ---------------------------------------------------------------------------
  async function attemptLogin(cleanEmail: string, pw: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: pw }),
    })

    const data = await res.json()

    if (!res.ok) {
      if (res.status === 429) {
        registerFailure(data.retryAfterSeconds)
        toast.error(data.error || "Too many attempts. Please wait before trying again.")
        return false
      }

      registerFailure()
      toast.error(data.error || "Invalid email or password.")
      return false
    }

    return true
  }

  async function checkEmailExists(cleanEmail: string) {
    const res = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || "Unable to check email.")
    }

    return Boolean(data.exists)
  }

// ---------------------------------------------------------------------------
// Form submit
// ---------------------------------------------------------------------------
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const cleanEmail = email.trim()

    if (!isValidEmail(cleanEmail)) {
      toast.error("Enter a valid email.")
      return
    }

    // Client-side lockout gate
    if (!isSignup && isLockedOut) {
      toast.error(`Please wait ${formatCountdown(countdown)} before trying again.`)
      return
    }

    if (isSignup) {
      // ── Signup step 1: collect credentials, send OTP ─────────────────────
      if (signupStep === "form") {
        const pwReqError = getPasswordRequirementError(password)
        if (pwReqError) { toast.error(pwReqError); return }
        if (password !== confirmPassword) { toast.error("Passwords do not match."); return }

        setLoading(true)
        try {
          const exists = await checkEmailExists(cleanEmail)
          if (exists) {
            toast.error("An account with that email already exists.")
            return
          }

          const { error } = await supabase.auth.signInWithOtp({
            email: cleanEmail,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: `${getOrigin()}/auth/callback`,
            },
          })

          if (error) { toast.error(error.message); return }

          toast.success("We emailed you a verification code!")
          setSignupStep("verify")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Unable to check email.")
        } finally {
          setLoading(false)
        }
        return
      }

      // ── Signup step 2: verify OTP, set password ───────────────────────────
      const trimmed = code.trim()
      if (!/^\d{6,8}$/.test(trimmed)) {
        toast.error("Enter the verification code from your email.")
        return
      }

      setLoading(true)
      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: trimmed,
          type: "email",
        })
        if (verifyError) { toast.error(verifyError.message); return }

        const { error: pwError } = await supabase.auth.updateUser({ password })
        if (pwError) { toast.error(pwError.message); return }

        toast.success("Account created successfully!")
        router.push("/onboarding")
        router.refresh()
      } finally {
        setLoading(false)
      }
      return
    }

    // ── Login ──────────────────────────────────────────────────────────────
    setLoading(true)
    try {
      const ok = await attemptLogin(cleanEmail, password)
      if (!ok) return

      toast.success("Logged in successfully!")
      router.push("/")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Misc handlers
  // ---------------------------------------------------------------------------
  async function resendCode() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: `${getOrigin()}/auth/callback` },
      })
      if (error) { toast.error(error.message); return }
      toast.success("Verification code resent!")
    } finally {
      setLoading(false)
    }
  }

  async function onForgotPassword() {
    const cleanEmail = email.trim()
    if (!isValidEmail(cleanEmail)) { toast.error("Enter your email above first."); return }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${getOrigin()}/reset-password`,
      })
      if (error) { toast.error(error.message); return }
      toast.success("Password reset email sent! Check your inbox.")
    } finally {
      setLoading(false)
    }
  }

  function goBackToForm() {
    setSignupStep("form")
    setCode("")
  }

  // ---------------------------------------------------------------------------
  // Derived UI values
  // ---------------------------------------------------------------------------
  const submitDisabled = loading || (!isSignup && isLockedOut)

  // Warning shown after first failure, before lockout
  const showAttemptsWarning =
    !isSignup && failedAttempts > 0 && failedAttempts < MAX_CLIENT_ATTEMPTS && !isLockedOut

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/auth-background.jpg')" }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-0 bg-background/45" aria-hidden="true" />
      <div className="relative z-0">
        <DotGridBackground />
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <div className="size-[600px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      {/* ── Verification Step ─────────────────────────────────────────────── */}
      {isSignup && signupStep === "verify" ? (
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/45 px-6 py-8 shadow-2xl backdrop-blur-md">
          <div className="mb-10 flex justify-center">
            <Image
              src="/images/qtlogo.png"
              alt="Quick Thoughts logo"
              width={220}
              height={64}
              priority
              className="h-14 w-auto"
            />
          </div>
          <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-white text-balance md:text-5xl">
            Verify Your Email
          </h1>
          <p className="mb-10 text-center text-base text-white/75 text-pretty">
            We sent an 8-digit code to <strong>{email}</strong>
          </p>

          <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="code" className="text-sm text-muted-foreground">
                Verification Code
              </Label>
              <Input
                id="code"
                type="text"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
                className="h-12 rounded-xl border-border bg-secondary/40 px-4 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
                maxLength={8}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
              size="lg"
            >
              <span>{loading ? "Verifying..." : "Verify Code"}</span>
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-center text-sm">
            <button
              type="button"
              onClick={resendCode}
              disabled={loading}
              className="text-muted-foreground transition-colors hover:text-accent"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={goBackToForm}
              disabled={loading}
              className="text-muted-foreground transition-colors hover:text-accent"
            >
              Use a different email
            </button>
          </div>

          <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-white/60">
            {"By continuing, you agree to our "}
            <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
              Terms of Service
            </a>
            {" and "}
            <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>

      ) : (

        /* ── Login / Signup Form ────────────────────────────────────────────── */
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/45 px-6 py-8 shadow-2xl backdrop-blur-md">
          <div className="mb-10 flex justify-center">
            <Image
              src="/images/qtlogo.png"
              alt="Quick Thoughts logo"
              width={220}
              height={64}
              priority
              className="h-14 w-auto"
            />
          </div>
          <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-white text-balance md:text-5xl">
            {isSignup ? "Get Started" : "Welcome Back"}
          </h1>
          <p className="mb-10 text-center text-base text-white/75 text-pretty">
            {isSignup
              ? "Create an account to start capturing your thoughts"
              : "Sign in to access your voice memos and transcriptions"}
          </p>

          {/* ── Lockout banner ─────────────────────────────────────────────── */}
          {isLockedOut && (
            <div className="mb-6 w-full flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Account temporarily locked</p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  {serverLockoutSeconds
                    ? `Too many failed attempts. Try again in `
                    : `Too many failed attempts. Please wait `}
                  <span className="font-mono font-semibold">{formatCountdown(countdown)}</span>.
                </p>
              </div>
            </div>
          )}

          {/* ── Attempts-remaining warning ──────────────────────────────────── */}
          {!isSignup && failedAttempts > 0 && !isLockedOut && (
      <div className="mb-6 w-full flex items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Repeated failed attempts will temporarily lock your account.</p>
      </div>
          )}

          <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(isSignup ? e.target.value.slice(0, 100) : e.target.value)}
                autoComplete="email"
                required
                disabled={isLockedOut}
                className="h-12 rounded-xl border-border bg-secondary/40 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent disabled:opacity-50"
                maxLength={isSignup ? 100 : undefined}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isSignup ? "Create a password" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  required
                  disabled={isLockedOut}
                  className="h-12 rounded-xl border-border bg-secondary/40 pr-12 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {isSignup && (
                <p className="text-xs text-muted-foreground">
                  Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
                </p>
              )}
              {!isSignup && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading || isLockedOut}
                  className="self-end text-xs text-muted-foreground transition-colors hover:text-accent disabled:opacity-60"
                >
                  Forgot password?
                </button>
              )}
            </div>

            {isSignup && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password" className="text-sm text-muted-foreground">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="h-12 rounded-xl border-border bg-secondary/40 pr-12 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitDisabled}
              className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90 disabled:opacity-60"
              size="lg"
            >
              {isLockedOut ? (
                <>
                  <Lock className="mr-2 size-4" />
                  Locked — wait {formatCountdown(countdown)}
                </>
              ) : (
                <>
                  <span>
                    {loading
                      ? isSignup ? "Creating account..." : "Signing in..."
                      : isSignup ? "Create Account" : "Sign In"}
                  </span>
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "New to Quick Thoughts? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-medium text-accent underline-offset-4 transition-colors hover:text-accent/80 hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>

          <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-white/60">
            {"By continuing, you agree to our "}
            <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
              Terms of Service
            </a>
            {" and "}
            <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      )}
    </main>
  )
}