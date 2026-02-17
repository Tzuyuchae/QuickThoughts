"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

type AuthMode = "login" | "signup"

interface AuthFormProps {
  mode: AuthMode
}

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

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const isSignup = mode === "signup"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Signup verification (6-digit code)
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form")
  const [code, setCode] = useState("")

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSignupStep("form")
    setCode("")
    setShowPassword(false)
    setShowConfirmPassword(false)
  }, [mode])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const cleanEmail = email.trim()

    if (!isValidEmail(cleanEmail)) {
      toast.error("Enter a valid email.")
      return
    }

    if (isSignup) {
      // Step 1: collect email + password + confirm, then send code
      if (signupStep === "form") {
        const pwReqError = getPasswordRequirementError(password)
        if (pwReqError) {
          toast.error(pwReqError)
          return
        }
        if (password !== confirmPassword) {
          toast.error("Passwords do not match.")
          return
        }

        setLoading(true)
        try {
          // Send a 6-digit code email and create user if needed
          const { error } = await supabase.auth.signInWithOtp({
            email: cleanEmail,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })

          if (error) {
            toast.error(error.message)
            return
          }

          toast.success("We emailed you a verification code!")
          setSignupStep("verify")
        } finally {
          setLoading(false)
        }

        return
      }

      // Step 2: verify code, then set password, then go to onboarding
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

        if (verifyError) {
          toast.error(verifyError.message)
          return
        }

        // After OTP verification, the user is signed in — now set their password
        const { error: pwError } = await supabase.auth.updateUser({
          password,
        })

        if (pwError) {
          toast.error(pwError.message)
          return
        }

        toast.success("Account created successfully!")
        router.push("/onboarding")
        router.refresh()
      } finally {
        setLoading(false)
      }

      return
    }

    // LOGIN
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Logged in successfully!")
      router.push("/")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function resendCode() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Verification code resent!")
    } finally {
      setLoading(false)
    }
  }

  function goBackToForm() {
    setSignupStep("form")
    setCode("")
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-4">
      <DotGridBackground />

      {/* Radial glow behind the form */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <div className="size-[600px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      {/* Verification Step */}
      {isSignup && signupStep === "verify" ? (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6">
          {/* Logo */}
          <div className="mb-10">
            <Image
              src="/images/logo.png"
              alt="Quick Thoughts logo"
              width={220}
              height={64}
              priority
              className="h-14 w-auto"
            />
          </div>

          {/* Heading */}
          <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl">
            Verify Your Email
          </h1>
          <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>

          {/* Verification Form */}
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

          {/* Helper links */}
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

          {/* Terms */}
          <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
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
        /* Login/Signup Form */
        <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6">
          {/* Logo */}
          <div className="mb-10">
            <Image
              src="/images/logo.png"
              alt="Quick Thoughts logo"
              width={220}
              height={64}
              priority
              className="h-14 w-auto"
            />
          </div>

          {/* Heading */}
          <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl">
            {isSignup ? "Get Started" : "Welcome Back"}
          </h1>
          <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
            {isSignup
              ? "Create an account to start capturing your thoughts"
              : "Sign in to access your voice memos and transcriptions"}
          </p>

          {/* Form */}
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
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-12 rounded-xl border-border bg-secondary/40 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
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
                  className="h-12 rounded-xl border-border bg-secondary/40 pr-12 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
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
                  className="self-end text-xs text-muted-foreground transition-colors hover:text-accent"
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
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
              size="lg"
            >
              <span>
                {loading
                  ? isSignup
                    ? "Creating account..."
                    : "Signing in..."
                  : isSignup
                  ? "Create Account"
                  : "Sign In"}
              </span>
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>

          {/* Mode toggle */}
          <p className="mt-8 text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "New to Quick Thoughts? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-medium text-accent underline-offset-4 transition-colors hover:text-accent/80 hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>

          {/* Terms */}
          <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
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