"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Navbar } from "@/components/ui/navbar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Eye, EyeOff, KeyRound, Mail, UserRound } from "lucide-react"

function getUsernameFromUser(user: any) {
  return (
    user?.user_metadata?.username ||
    user?.user_metadata?.user_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    ""
  )
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return

      if (!user) {
        router.replace("/login")
        return
      }

      const emailValue = user.email ?? ""
      const metadataUsername = getUsernameFromUser(user)

      setEmail(emailValue)

      if (metadataUsername) {
        setUsername(metadataUsername)
        setLoading(false)
        return
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle()

      console.log("Profile username lookup", { authUserId: user.id, profileUsername: profileRow?.username })

      setUsername(profileRow?.username || emailValue.split("@")[0] || "Unknown User")
      setLoading(false)
    }

    void loadProfile()

    return () => {
      mounted = false
    }
  }, [router, supabase])

  async function handlePasswordChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordMessage(null)
    setPasswordError(null)

    if (!email) {
      setPasswordError("Could not find your email address.")
      return
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill out all password fields.")
      return
    }

    if (newPassword.length < 6) {
      setPasswordError("Your new password must be at least 6 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.")
      return
    }

    setPasswordSaving(true)

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })

    if (verifyError) {
      setPasswordSaving(false)
      setPasswordError("Your current password is incorrect.")
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    setPasswordSaving(false)

    if (updateError) {
      setPasswordError(updateError.message || "Could not update your password.")
      return
    }

    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordMessage("Your password has been updated.")
  }

  async function handleDeleteRequest() {
    setDeleteMessage(null)
    setDeleteError(null)

    const confirmed = window.confirm(
      "This will permanently delete your account, profile, folders, and memos. This cannot be undone. Continue?"
    )

    if (!confirmed) return

    const confirmationText = window.prompt('Type DELETE to permanently remove your account.')
    if (confirmationText !== "DELETE") {
      setDeleteError('Account deletion cancelled. You must type DELETE to confirm.')
      return
    }

    setDeleteLoading(true)

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setDeleteLoading(false)
        setDeleteError(result?.error || "Could not delete your account.")
        return
      }

      await supabase.auth.signOut()
      setDeleteLoading(false)
      setDeleteMessage("Your account has been deleted.")
      router.replace("/login")
    } catch {
      setDeleteLoading(false)
      setDeleteError("Something went wrong while deleting your account.")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container mx-auto px-4 py-10">
          <div className="text-sm text-muted-foreground">Loading profile...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="container mx-auto px-4 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile & Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review your account details, change your password, and start the account deletion flow.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
                <div className="rounded-full bg-secondary p-2">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p className="font-medium">{username}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
                <div className="rounded-full bg-secondary p-2">
                  <Mail className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{email}</p>
                </div>
              </div>

              <Badge variant="secondary">Signed in</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5" />
                Reset Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handlePasswordChange}>
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    >
                      {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter your new password"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    >
                      {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}

                {passwordMessage && (
                  <p className="text-sm text-emerald-600">{passwordMessage}</p>
                )}

                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                Delete Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Permanently delete your account, profile, folders, and memos. You will be asked to confirm before anything is removed.
              </p>

              <div className="h-px w-full bg-border" />

              {deleteError && (
                <p className="text-sm text-destructive">{deleteError}</p>
              )}

              {deleteMessage && (
                <p className="text-sm text-muted-foreground">{deleteMessage}</p>
              )}

              <Button
                type="button"
                variant="destructive"
                disabled={deleteLoading}
                onClick={handleDeleteRequest}
              >
                {deleteLoading ? "Deleting..." : "Delete My Account"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}