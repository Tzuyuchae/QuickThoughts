"use client"

import { useState, FormEvent, TextareaHTMLAttributes } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Image from "next/image"

// simple Textarea component fallback
function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="rounded-md border px-3 py-2 resize-y w-full"
      {...props}
    />
  )
}

export function ContactUsFooter() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSuccess(null)
    setError(null)

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      })

      if (!res.ok) throw new Error("Failed to send message")

      setName("")
      setEmail("")
      setMessage("")
      setSuccess("Thank you! Your message has been sent.")
    } catch (err) {
      setError((err as Error).message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <footer className="w-full bg-secondary/10 p-8 mt-auto">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        {/* Logo */}
        <div className="flex justify-center">
          <Image src="/images/qtlogo.png" alt="Logo" width={120} height={40} />
        </div>

        {/* Contact form */}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              type="email"
              placeholder="Your Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Textarea
            placeholder="Your Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Message"}
          </Button>
        </form>
      </div>
    </footer>
  )
}