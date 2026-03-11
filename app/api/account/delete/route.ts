import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

export async function POST() {
  try {
    const cookieStore = await cookies()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration is missing." }, { status: 500 })
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: memosError } = await adminClient
      .from("memos")
      .delete()
      .eq("user_id", user.id)

    if (memosError) {
      return NextResponse.json({ error: "Could not delete memos." }, { status: 500 })
    }

    const { error: foldersError } = await adminClient
      .from("folders")
      .delete()
      .eq("user_id", user.id)

    if (foldersError) {
      return NextResponse.json({ error: "Could not delete folders." }, { status: 500 })
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .delete()
      .eq("user_id", user.id)

    if (profileError) {
      return NextResponse.json({ error: "Could not delete profile." }, { status: 500 })
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(user.id)

    if (authDeleteError) {
      return NextResponse.json({ error: "Could not delete auth user." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Account deletion route failed:", error)
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 })
  }
}