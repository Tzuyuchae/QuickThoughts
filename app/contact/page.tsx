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

export default function ContactPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!name || !email || !message) {
      setErrorMessage("Please fill out all fields.")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
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

        {/* Professional prompt under logo */}
        <p className="mb-8 text-center text-muted-foreground max-w-md text-white text-accent text-lg">
          Have a question or want to give us some feedback? We’re happy to hear from you!
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
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                />
              </div>

              {/* Error / Success */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="flex items-center gap-2 text-emerald-600 text-sm">
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