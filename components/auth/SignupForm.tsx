"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

export default function SignupPage() {
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

      <SignupForm />
    </main>
  )
}

function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  function getPasswordRequirementError(pw: string) {
    if (pw.length < 8) return "Password must be at least 8 characters."
    if (!/[a-z]/.test(pw)) return "Password must include at least 1 lowercase letter."
    if (!/[A-Z]/.test(pw)) return "Password must include at least 1 uppercase letter."
    if (!/\d/.test(pw)) return "Password must include at least 1 number."
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw))
      return "Password must include 1 special character."
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!isValidEmail(email)) {
      toast.error("Enter a valid email.")
      return
    }

    const pwError = getPasswordRequirementError(password)
    if (pwError) {
      toast.error(pwError)
      return
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Account created! Check your email for verification.")
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }

  return (
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
        Get Started
      </h1>
      <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
        Create an account to start capturing your thoughts
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
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
              placeholder="Create a password"
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
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

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

        <Button
          type="submit"
          disabled={loading}
          className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
          size="lg"
        >
          <span>{loading ? "Creating account..." : "Create Account"}</span>
          <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </form>

      {/* Login link */}
      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline-offset-4 transition-colors hover:text-accent/80 hover:underline"
        >
          Sign in
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
  )
}