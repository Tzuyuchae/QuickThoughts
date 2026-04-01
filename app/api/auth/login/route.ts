import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const WINDOW_MINUTES = 15          // Sliding window duration
const MAX_ATTEMPTS_PER_EMAIL = 5   // Max failures per email in the window
const MAX_ATTEMPTS_PER_IP = 10     // Max failures per IP in the window (catches multi-account attacks)
const LOCKOUT_MINUTES = 15         // How long to lock out after limit is hit

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort IP extraction from Next.js request headers */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

/** Service-role client — bypasses RLS so we can write to login_attempts */
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface RateLimitResult {
  blocked: boolean
  reason?: "email" | "ip"
  retryAfterSeconds?: number
}

async function checkRateLimit(email: string, ip: string): Promise<RateLimitResult> {
  const service = getServiceClient()
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

  // Count recent failures for this email
  const { count: emailCount } = await service
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .eq("success", false)
    .gte("attempted_at", windowStart)

  if ((emailCount ?? 0) >= MAX_ATTEMPTS_PER_EMAIL) {
    return {
      blocked: true,
      reason: "email",
      retryAfterSeconds: LOCKOUT_MINUTES * 60,
    }
  }

  // Count recent failures for this IP (catches distributed single-account or multi-account attacks)
  const { count: ipCount } = await service
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("success", false)
    .gte("attempted_at", windowStart)

  if ((ipCount ?? 0) >= MAX_ATTEMPTS_PER_IP) {
    return {
      blocked: true,
      reason: "ip",
      retryAfterSeconds: LOCKOUT_MINUTES * 60,
    }
  }

  return { blocked: false }
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  const service = getServiceClient()
  const { error } = await service.from("login_attempts").insert({
    email: email.toLowerCase(),
    ip_address: ip,
    success,
    attempted_at: new Date().toISOString(),
  })
  if (error) console.error("[login_attempts] insert error:", error)
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email: string = (body.email ?? "").trim()
    const password: string = body.password ?? ""
    const ip = getClientIp(req)

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      )
    }

    // ── Rate limit check ───────────────────────────────────────────────────
    const limit = await checkRateLimit(email, ip)

    if (limit.blocked) {
      const minutes = Math.ceil((limit.retryAfterSeconds ?? LOCKOUT_MINUTES * 60) / 60)
      const message =
        limit.reason === "ip"
          ? `Too many login attempts from your network. Try again in ${minutes} minutes.`
          : `Too many failed attempts for this account. Try again in ${minutes} minutes.`

      return NextResponse.json(
        { error: message, rateLimited: true, retryAfterSeconds: limit.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds ?? LOCKOUT_MINUTES * 60) },
        }
      )
    }

    // ── Attempt sign-in ────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Record failure — don't leak whether the account exists
      await recordAttempt(email, ip, false)

      // Re-check limit count so we can warn the user how many tries remain
      const service = getServiceClient()
      const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
      const { count } = await service
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", email.toLowerCase())
        .eq("success", false)
        .gte("attempted_at", windowStart)

      const attemptsUsed = count ?? 1
      const remaining = Math.max(0, MAX_ATTEMPTS_PER_EMAIL - attemptsUsed)

      const message =
        remaining === 0
          ? `Too many failed attempts. Your account is locked for ${LOCKOUT_MINUTES} minutes.`
          : remaining === 1
          ? `Invalid email or password. 1 attempt remaining before lockout.`
          : `Invalid email or password. ${remaining} attempts remaining.`

      return NextResponse.json({ error: message, attemptsRemaining: remaining }, { status: 401 })
    }

    // ── Success ────────────────────────────────────────────────────────────
    await recordAttempt(email, ip, true)

    return NextResponse.json({ success: true, user: { id: data.user?.id, email: data.user?.email } })
  } catch (err) {
    console.error("[/api/auth/login] unexpected error:", err)
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 })
  }
}