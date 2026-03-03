"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

function getPasswordRequirementError(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters."
  if (!/[a-z]/.test(pw)) return "Password must include at least 1 lowercase letter."
  if (!/[A-Z]/.test(pw)) return "Password must include at least 1 uppercase letter."
  if (!/\d/.test(pw)) return "Password must include at least 1 number."
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?`~]/.test(pw)) {
    return "Password must include at least 1 special character."
  }
  return null
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function bootstrapFromUrl() {
      try {
        // Supabase recovery links often include a PKCE `code` (query param) or tokens in the hash.
        // Exchanging the `code` makes the session available for `updateUser`.
        const code = searchParams.get("code")

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            // If exchange fails we still continue to session check below.
            console.warn("exchangeCodeForSession error:", exchangeError.message)
          }
        }

        const { data, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          setHasSession(false)
        } else {
          setHasSession(!!data.session)
        }
      } finally {
        if (mounted) setChecking(false)
      }
    }

    bootstrapFromUrl()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setHasSession(!!session)
      setChecking(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, searchParams])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

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
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Password updated! Please sign in again.")
      await supabase.auth.signOut()

      router.push("/login")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-4">
      <DotGridBackground />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <div className="size-[600px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6">
        <div className="mb-10">
          <Image
            src="/images/qtlogo.png"
            alt="Quick Thoughts logo"
            width={220}
            height={64}
            priority
            className="h-14 w-auto"
          />
        </div>

        <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl">
          Reset Password
        </h1>
        <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
          Choose a new password for your account.
        </p>

        {checking ? (
          <div className="w-full rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            Checking reset link...
          </div>
        ) : !hasSession ? (
          <div className="w-full rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            This reset link is invalid or expired. Please go back to {" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              login
            </button>
            {" "}and request a new reset email.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="h-12 rounded-xl border-border bg-secondary/40 pr-12 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password" className="text-sm text-muted-foreground">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm new password"
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
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
              size="lg"
            >
              <span>{loading ? "Updating..." : "Update Password"}</span>
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}