"use client"

import { useState } from "react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

type FormMode = "login" | "signup"

export default function LoginPage() {
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

      <LoginForm />
    </main>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<FormMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    toast.success("Signed in successfully")
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
        {mode === "login" ? "Welcome Back" : "Get Started"}
      </h1>
      <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
        {mode === "login"
          ? "Sign in to access your voice memos and transcriptions"
          : "Create an account to start capturing your thoughts"}
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
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
          {mode === "login" && (
            <button
              type="button"
              className="self-end text-xs text-muted-foreground transition-colors hover:text-accent"
            >
              Forgot password?
            </button>
          )}
        </div>

        <Button
          type="submit"
          className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
          size="lg"
        >
          <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
          <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </form>

      {/* Mode toggle */}
      <p className="mt-8 text-sm text-muted-foreground">
        {mode === "login" ? "New to Quick Thoughts? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="font-medium text-accent underline-offset-4 transition-colors hover:text-accent/80 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
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