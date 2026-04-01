"use client"

import { useState, FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Mail, UserRound, MessageSquare, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react"
import { Navbar } from "@/components/ui/navbar"
import { DotGridBackground } from "@/components/ui/dot-grid-background"
import Image from "next/image"
import qtLogo from "@/public/images/qtlogo.png"

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_NAME_LENGTH = 100
const MAX_EMAIL_LENGTH = 254  // RFC 5321 maximum
const MAX_MESSAGE_LENGTH = 2000

// ─── Sanitization helpers ─────────────────────────────────────────────────────

/** Strips HTML / script tags and trims whitespace to prevent XSS payloads being
 *  stored and later rendered unsafely by other parts of the app. */
function sanitizeText(value: string): string {
  return value
    .trim()
    .replace(/<[^>]*>/g, "")          // strip all HTML tags
    .replace(/javascript:/gi, "")     // strip JS pseudo-protocol
    .replace(/on\w+\s*=/gi, "")       // strip inline event handlers  e.g. onerror=
}

/** RFC-5322-inspired email regex – catches the most common invalid formats. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContactPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Client-side validation — mirrors the server-side checks so users get
  // instant feedback without an extra round-trip.
  function validate(): string | null {
    if (!name.trim() || !email.trim() || !message.trim()) {
      return "Please fill out all fields."
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
    }
    if (!validateEmail(email.trim())) {
      return "Please enter a valid email address."
    }
    if (email.trim().length > MAX_EMAIL_LENGTH) {
      return "Email address is too long."
    }
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    }
    return null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    // Sanitize before sending so the payload reaching the server is already clean.
    const sanitizedName    = sanitizeText(name)
    const sanitizedEmail   = sanitizeText(email)
    const sanitizedMessage = sanitizeText(message)

    setLoading(true)
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:    sanitizedName,
          email:   sanitizedEmail,
          message: sanitizedMessage,
        }),
      })

      const result = await response.json().catch(() => null)

      if (response.status === 429) {
        setErrorMessage("Too many requests. Please wait a moment and try again.")
      } else if (!response.ok) {
        setErrorMessage(result?.error || "Failed to send your message.")
      } else {
        setName("")
        setEmail("")
        setMessage("")
        setSuccessMessage("Thank you! Your message has been sent.")
      }
    } catch (err) {
      console.error(err)
      setErrorMessage("Something went wrong. Please try again later.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <DotGridBackground />
      <Navbar />

      <main className="relative z-10 container mx-auto px-4 py-12 flex flex-col items-center">
        {/* Back to Home */}
        <Button
          variant="outline"
          className="mb-6 flex items-center gap-2 text-sm"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>

        {/* Logo */}
        <div className="mb-4 w-32">
          <Image
            src={qtLogo}
            alt="QT Logo"
            className="w-full rounded-xl"
            priority
          />
        </div>

        {/* Prompt */}
        <p className="mb-8 text-center text-muted-foreground max-w-md text-white text-accent text-lg">
          Have a question or want to give us some feedback? We're happy to hear from you!
        </p>

        <Card className="w-full max-w-lg border-2 border-border bg-secondary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-accent" />
              Contact Us / Feedback
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Fill out the form below and we'll get back to you soon.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="name"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={MAX_EMAIL_LENGTH}
                  autoComplete="email"
                />
              </div>

              {/* Message */}
              <div className="space-y-1">
                <Label htmlFor="message" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Message
                </Label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={5}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                />
                {/* Live character counter */}
                <p className="text-xs text-muted-foreground text-right">
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </p>
              </div>

              {/* Error / Success */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-destructive text-sm" role="alert">
                  <AlertTriangle className="h-4 w-4" />
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="flex items-center gap-2 text-emerald-600 text-sm" role="status">
                  <CheckCircle2 className="h-4 w-4" />
                  {successMessage}
                </div>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full h-12 text-sm" disabled={loading}>
                {loading ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}