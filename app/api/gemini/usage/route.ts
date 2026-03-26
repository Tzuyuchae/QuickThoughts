import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const DAILY_LIMIT = 10

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

  const { data, error } = await supabase
    .from("gemini_usage")
    .select("call_count")
    .eq("user_id", user.id)
    .eq("usage_date", today)
    .maybeSingle()

  if (error) {
    console.error("gemini_usage fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 })
  }

  const count = data?.call_count ?? 0

  return NextResponse.json({ count, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - count })
}