"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"

export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
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
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) return "Password must include 1 special character."
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
    <div className="max-w-md mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-center">Create Account</h1>
      <p className="text-center text-sm text-muted-foreground">
        Start capturing your thoughts today
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Label>Email</Label>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-12 rounded-xl px-4"
        />

        <Label>Password</Label>
        <Input
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="h-12 rounded-xl px-4"
        />

        <Label>Confirm Password</Label>
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="h-12 rounded-xl px-4"
        />

        <Button type="submit" size="lg" className="mt-2">
          <span>Create Account</span>
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </form>

      <p className="text-center text-sm mt-4">
        Already have an account? <a href="/login" className="text-accent underline">Log in</a>
      </p>
    </div>
  )
}
