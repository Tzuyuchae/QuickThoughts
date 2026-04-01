import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_NAME_LENGTH    = 100
const MAX_EMAIL_LENGTH   = 254
const MAX_MESSAGE_LENGTH = 2000

// ─── Rate limiting ────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_HITS  = 5

interface RateLimitEntry {
  count: number
  windowStart: number
}
const rateLimitMap = new Map<string, RateLimitEntry>()

function isRateLimited(ip: string): boolean {
  const now   = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return false
  }

  entry.count += 1
  return entry.count > RATE_LIMIT_MAX_HITS
}

// ─── Sanitization helpers ─────────────────────────────────────────────────────
function sanitizeText(value: string): string {
  return value
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// ─── Service-role Supabase client ─────────────────────────────────────────────
// Uses the service-role key so it bypasses RLS — safe because this code only
// ever runs on the server. NEVER import this in a "use client" file.
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY  // NOT the anon key

  if (!url || !key) {
    throw new Error("Missing Supabase service-role environment variables.")
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,   // stateless — no cookie/session needed
      autoRefreshToken: false,
    },
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) } }
    )
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const { name, email, message } = body as Record<string, unknown>

  // 3. Type checks
  if (typeof name !== "string" || typeof email !== "string" || typeof message !== "string") {
    return NextResponse.json(
      { error: "Name, email, and message must be strings." },
      { status: 400 }
    )
  }

  // 4. Presence
  if (!name.trim() || !email.trim() || !message.trim()) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 })
  }

  // 5. Length
  if (name.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` }, { status: 400 })
  }
  if (email.trim().length > MAX_EMAIL_LENGTH) {
    return NextResponse.json({ error: "Email address is too long." }, { status: 400 })
  }
  if (message.trim().length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, { status: 400 })
  }

  // 6. Email format
  if (!EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 })
  }

  // 7. Sanitize
  const sanitizedName    = sanitizeText(name)
  const sanitizedEmail   = sanitizeText(email).toLowerCase()
  const sanitizedMessage = sanitizeText(message)

  // 8. Insert via service-role client (bypasses RLS safely — server-side only)
  try {
    const supabase = createServiceClient()

    const { error: dbError } = await supabase
      .from("contact_messages")
      .insert({
        name:    sanitizedName,
        email:   sanitizedEmail,
        message: sanitizedMessage,
      })

    if (dbError) {
      console.error("Supabase insert error:", dbError)
      return NextResponse.json({ error: "Failed to save your message." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Unexpected error in contact API:", err)
    return NextResponse.json({ error: "Internal server error." }, { status: 500 })
  }
}