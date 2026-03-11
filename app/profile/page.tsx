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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle,
  Bell,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  UserRound,
} from "lucide-react"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

type Theme = "light" | "dark" | "system"
type FontSize = "small" | "medium" | "large"

interface NotificationSettings {
  // Weekly digest of memo/folder activity — you send this via a cron job
  // (e.g. Supabase Edge Function + Resend) that checks created_at timestamps
  emailUpdates: boolean
  // Triggered on: password changed, new sign-in detected, account deletion
  // Hook into your /api/notifications/security-alert endpoint after each event
  securityAlerts: boolean
}

interface DisplaySettings {
  theme: Theme
  fontSize: FontSize
  compactMode: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  // Profile
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")

  // Password
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Delete
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Notifications — persisted to Supabase user_metadata
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailUpdates: true,
    securityAlerts: true,
  })
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)

  // Display — persisted to Supabase user_metadata
  const [display, setDisplay] = useState<DisplaySettings>({
    theme: "system",
    fontSize: "medium",
    compactMode: false,
  })
  const [displaySaving, setDisplaySaving] = useState(false)
  const [displaySaved, setDisplaySaved] = useState(false)
  const [displayError, setDisplayError] = useState<string | null>(null)

  // ── Load profile + settings from Supabase ─────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!mounted) return
      if (!user) { router.replace("/login"); return }

      const emailValue = user.email ?? ""
      const metadataUsername = getUsernameFromUser(user)

      setEmail(emailValue)

      // Hydrate settings from user_metadata if previously saved
      const meta = user.user_metadata ?? {}
      if (meta.notifications) setNotifications(meta.notifications)
      if (meta.display) setDisplay(meta.display)

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

      if (!mounted) return

      setUsername(profileRow?.username || emailValue.split("@")[0] || "Unknown User")
      setLoading(false)
    }

    void loadProfile()
    return () => { mounted = false }
  }, [router, supabase])

  // ── Password change ───────────────────────────────────────────────────────
  async function handlePasswordChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordMessage(null)
    setPasswordError(null)

    if (!email) { setPasswordError("Could not find your email address."); return }
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError("Fill out all password fields."); return }
    if (newPassword.length < 6) { setPasswordError("Your new password must be at least 6 characters long."); return }
    if (newPassword !== confirmPassword) { setPasswordError("New password and confirmation do not match."); return }

    setPasswordSaving(true)

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (verifyError) { setPasswordSaving(false); setPasswordError("Your current password is incorrect."); return }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)

    if (updateError) { setPasswordError(updateError.message || "Could not update your password."); return }

    // If security alerts are on, trigger a "password changed" email here:
    // await fetch("/api/notifications/security-alert", {
    //   method: "POST",
    //   body: JSON.stringify({ type: "password_changed", email }),
    // })

    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordMessage("Your password has been updated.")
  }

  // ── Delete account ────────────────────────────────────────────────────────
  async function handleDeleteRequest() {
    setDeleteMessage(null)
    setDeleteError(null)

    const confirmed = window.confirm(
      "This will permanently delete your account, profile, folders, and memos. This cannot be undone. Continue?"
    )
    if (!confirmed) return

    const confirmationText = window.prompt("Type DELETE to permanently remove your account.")
    if (confirmationText !== "DELETE") {
      setDeleteError("Account deletion cancelled. You must type DELETE to confirm.")
      return
    }

    setDeleteLoading(true)

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) { setDeleteLoading(false); setDeleteError(result?.error || "Could not delete your account."); return }

      await supabase.auth.signOut()
      setDeleteLoading(false)
      setDeleteMessage("Your account has been deleted.")
      router.replace("/login")
    } catch {
      setDeleteLoading(false)
      setDeleteError("Something went wrong while deleting your account.")
    }
  }

  // ── Save notifications → Supabase user_metadata ───────────────────────────
  async function handleSaveNotifications() {
    setNotifSaving(true)
    setNotifError(null)

    const { error } = await supabase.auth.updateUser({
      data: { notifications },
    })

    setNotifSaving(false)

    if (error) { setNotifError("Could not save notification preferences."); return }

    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2500)
  }

  // ── Save display → Supabase user_metadata ─────────────────────────────────
  async function handleSaveDisplay() {
    setDisplaySaving(true)
    setDisplayError(null)

    const { error } = await supabase.auth.updateUser({
      data: { display },
    })

    setDisplaySaving(false)

    if (error) { setDisplayError("Could not save appearance settings."); return }

    setDisplaySaved(true)
    setTimeout(() => setDisplaySaved(false), 2500)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="container mx-auto px-4 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">

          {/* Page header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile & Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review your account details, change your password, and configure your preferences.
            </p>
          </div>

          {/* Account details */}
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

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-5" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Theme</p>
                  <p className="text-sm text-muted-foreground">Choose how the interface looks.</p>
                </div>
                <Select
                  value={display.theme}
                  onValueChange={(val) => setDisplay((prev) => ({ ...prev, theme: val as Theme }))}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <span className="flex items-center gap-2"><Sun className="size-4" /> Light</span>
                    </SelectItem>
                    <SelectItem value="dark">
                      <span className="flex items-center gap-2"><Moon className="size-4" /> Dark</span>
                    </SelectItem>
                    <SelectItem value="system">
                      <span className="flex items-center gap-2"><Monitor className="size-4" /> System</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-px w-full bg-border" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Font Size</p>
                  <p className="text-sm text-muted-foreground">Adjust the base text size across the app.</p>
                </div>
                <Select
                  value={display.fontSize}
                  onValueChange={(val) => setDisplay((prev) => ({ ...prev, fontSize: val as FontSize }))}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-px w-full bg-border" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Compact Mode</p>
                  <p className="text-sm text-muted-foreground">Reduce spacing to fit more content on screen.</p>
                </div>
                <Switch
                  checked={display.compactMode}
                  onCheckedChange={(val) => setDisplay((prev) => ({ ...prev, compactMode: val }))}
                />
              </div>

              {displayError && <p className="text-sm text-destructive">{displayError}</p>}
              {displaySaved && <p className="text-sm text-emerald-600">Appearance settings saved.</p>}

              <Button type="button" onClick={handleSaveDisplay} disabled={displaySaving}>
                {displaySaving ? "Saving..." : "Save Appearance"}
              </Button>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Weekly Digest</p>
                  <p className="text-sm text-muted-foreground">
                    A weekly summary of memos and folders you&apos;ve created.
                  </p>
                </div>
                <Switch
                  checked={notifications.emailUpdates}
                  onCheckedChange={(val) => setNotifications((prev) => ({ ...prev, emailUpdates: val }))}
                />
              </div>

              <div className="h-px w-full bg-border" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Security Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Email notifications when your password changes or a new sign-in is detected.
                  </p>
                </div>
                <Switch
                  checked={notifications.securityAlerts}
                  onCheckedChange={(val) => setNotifications((prev) => ({ ...prev, securityAlerts: val }))}
                />
              </div>

              {notifError && <p className="text-sm text-destructive">{notifError}</p>}
              {notifSaved && <p className="text-sm text-emerald-600">Notification preferences saved.</p>}

              <Button type="button" onClick={handleSaveNotifications} disabled={notifSaving}>
                {notifSaving ? "Saving..." : "Save Notifications"}
              </Button>
            </CardContent>
          </Card>

          {/* Reset password */}
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

                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                {passwordMessage && <p className="text-sm text-emerald-600">{passwordMessage}</p>}

                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Delete account */}
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

              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              {deleteMessage && <p className="text-sm text-muted-foreground">{deleteMessage}</p>}

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