"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight, ArrowLeft, Check } from "lucide-react"
import { toast } from "sonner"
import { DotGridBackground } from "@/components/ui/dot-grid-background"
import { Checkbox } from "@/components/ui/checkbox"

const DEFAULT_FOLDERS = [
  "Ideas",
  "School",
  "Work",
  "Projects",
  "Reminders",
  "Follow Ups",
  "Meetings & Conversations",
  "Content Creation",
  "Fitness & Health",
  "Personal Growth",
  "Money & Finances",
  "Relationships",
  "Music & Creative",
  "Research & Learning",
  "Miscellaneous",
]

type Step = "username" | "folders"

export default function OnboardingPage() {
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

      <OnboardingForm />
    </main>
  )
}

function OnboardingForm() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>("username")
  const [loading, setLoading] = useState(false)

  const [username, setUsername] = useState("")
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_FOLDERS.map((f) => [f, true]))
  )

  const chosenFolders = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  )

  // Ensure user is logged in
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) router.replace("/login")
    })()
  }, [router, supabase])

  async function saveUsername() {
    const clean = username.trim()

    if (clean.length < 3) {
      toast.error("Username must be at least 3 characters.")
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      toast.error("Username can only contain letters, numbers, and underscores.")
      return
    }

    setLoading(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes.user
      if (!user) {
        router.replace("/login")
        return
      }

      // Create profile row if missing, then set username
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            username: clean,
            onboarding_complete: false,
          },
          { onConflict: "user_id" }
        )

      if (upsertErr) {
        toast.error(upsertErr.message)
        return
      }

      toast.success("Username saved!")
      setStep("folders")
    } finally {
      setLoading(false)
    }
  }

  async function finishOnboarding() {
    if (chosenFolders.length === 0) {
      toast.error("Select at least one folder.")
      return
    }

    setLoading(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes.user
      if (!user) {
        router.replace("/login")
        return
      }

      // Always ensure "Unsorted" exists (not shown during onboarding)
      const foldersToInsert = Array.from(new Set(["Unsorted", ...chosenFolders]))

      const { error: folderErr } = await supabase.from("folders").insert(
        foldersToInsert.map((name) => ({
          user_id: user.id,
          name,
        }))
      )

      if (folderErr) {
        // If user refreshes and tries again, it may complain about duplicates
        const msg = folderErr.message.toLowerCase()
        if (!msg.includes("duplicate") && !msg.includes("unique")) {
          toast.error(folderErr.message)
          return
        }
      }

      // Mark onboarding complete
      const { error: profErr } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            onboarding_complete: true,
          },
          { onConflict: "user_id" }
        )

      if (profErr) {
        toast.error(profErr.message)
        return
      }

      toast.success("Setup complete! Welcome to Quick Thoughts! 🎉")
      router.replace("/")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (step === "folders") {
    return (
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6">
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

        {/* Progress indicator */}
        <div className="mb-8 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
            <Check className="size-4" />
          </div>
          <div className="h-px w-12 bg-accent" />
          <div className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
            2
          </div>
        </div>

        {/* Heading */}
        <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl">
          Choose Your Folders
        </h1>
        <p className="mb-10 text-center text-base text-muted-foreground text-pretty max-w-lg">
          Select the folders you want to organize your thoughts into. You can always add more later.
        </p>

        {/* Folders Grid */}
        <div className="mb-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEFAULT_FOLDERS.map((name) => (
            <label
              key={name}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/40 px-5 py-4 transition-all hover:bg-secondary/60 hover:border-accent/50"
            >
              <Checkbox
                checked={!!selected[name]}
                onCheckedChange={() =>
                  setSelected((s) => ({ ...s, [name]: !s[name] }))
                }
              />
              <span className="text-sm font-medium text-foreground">{name}</span>
            </label>
          ))}
        </div>

        {/* Selected count */}
        <p className="mb-6 text-sm text-muted-foreground">
          {chosenFolders.length} folder{chosenFolders.length !== 1 ? "s" : ""} selected
        </p>

        {/* Buttons */}
        <div className="flex w-full flex-col gap-3">
          <Button
            onClick={finishOnboarding}
            disabled={loading}
            className="group h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
            size="lg"
          >
            <span>{loading ? "Finishing..." : "Finish Setup"}</span>
            <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>

          <Button
            type="button"
            onClick={() => setStep("username")}
            disabled={loading}
            variant="outline"
            className="h-12 w-full rounded-xl border-border"
            size="lg"
          >
            <ArrowLeft className="mr-2 size-4" />
            <span>Back</span>
          </Button>
        </div>
      </div>
    )
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

      {/* Progress indicator */}
      <div className="mb-8 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
          1
        </div>
        <div className="h-px w-12 bg-border" />
        <div className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary/40 text-sm font-bold text-muted-foreground">
          2
        </div>
      </div>

      {/* Heading */}
      <h1 className="mb-2 text-center font-heading text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl">
        Welcome to Quick Thoughts
      </h1>
      <p className="mb-10 text-center text-base text-muted-foreground text-pretty">
        Let's get you set up in just a few steps
      </p>

      {/* Info List */}
      <div className="mb-8 w-full space-y-3 rounded-xl border border-border bg-secondary/20 p-6">
        <div className="flex items-start gap-3 text-sm text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
            1
          </span>
          <span>Record your thoughts</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
            2
          </span>
          <span>Let us extract and organize your thoughts</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
            3
          </span>
          <span>View your organized thoughts in your notes</span>
        </div>
      </div>

      {/* Username Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveUsername()
        }}
        className="flex w-full flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="username" className="text-sm text-muted-foreground">
            Choose a username
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="e.g. mo_quickthoughts"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="nickname"
            required
            className="h-12 rounded-xl border-border bg-secondary/40 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
          />
          <p className="text-xs text-muted-foreground">
            Letters, numbers, and underscores only (min 3 characters)
          </p>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="group mt-2 h-12 w-full rounded-xl bg-accent text-accent-foreground font-semibold transition-all hover:bg-accent/90"
          size="lg"
        >
          <span>{loading ? "Saving..." : "Continue"}</span>
          <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </form>
    </div>
  )
}