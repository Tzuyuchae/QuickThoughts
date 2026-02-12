"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getPasswordRequirementError(pw: string) {
  const password = pw;
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Password must include at least 1 lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include at least 1 uppercase letter.";
  if (!/\d/.test(password)) return "Password must include at least 1 number.";
  // Common special characters; includes spaces? no.
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return "Password must include at least 1 special character.";
  }
  return null;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Signup verification (6-digit code)
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);
    setStatus(null);
    setSignupStep("form");
    setCode("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const cleanEmail = email.trim();

    if (!isValidEmail(cleanEmail)) {
      setError("Enter a valid email.");
      return;
    }

    // Password requirement checks are handled below for signup only

    if (isSignup) {
      // Step 1: collect email + password + confirm, then send code
      if (signupStep === "form") {
        const pwReqError = getPasswordRequirementError(password);
        if (pwReqError) {
          setError(pwReqError);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        setLoading(true);
        try {
          // Send a 6-digit code email (template uses {{ .Token }}) and create user if needed
          const { error } = await supabase.auth.signInWithOtp({
            email: cleanEmail,
            options: {
              shouldCreateUser: true,
              // Keeps the request on the Magic Link/OTP email path; template should show {{ .Token }}
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (error) {
            setError(error.message);
            return;
          }

          setStatus("We emailed you an 8-digit verification code. Enter it below to finish creating your account.");
          setSignupStep("verify");
        } finally {
          setLoading(false);
        }

        return;
      }

      // Step 2: verify code, then set password, then go to onboarding
      const trimmed = code.trim();
      if (!/^\d{6,8}$/.test(trimmed)) {
        setError("Enter the verification code from your email.");
        return;
      }

      setLoading(true);
      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: trimmed,
          type: "email",
        });

        if (verifyError) {
          setError(verifyError.message);
          return;
        }

        // After OTP verification, the user is signed in — now set their password
        const { error: pwError } = await supabase.auth.updateUser({
          password,
        });

        if (pwError) {
          setError(pwError.message);
          return;
        }

        router.push("/onboarding");
        router.refresh();
      } finally {
        setLoading(false);
      }

      return;
    }

    // LOGIN
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        {isSignup ? "Create account" : "Log in"}
      </h1>

      <p style={{ opacity: 0.75, marginBottom: 20 }}>
        {isSignup
          ? signupStep === "form"
            ? "Create your account, then we’ll email you an 8-digit verification code."
            : "Enter the 8-digit code we emailed you."
          : "Welcome back."}
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            readOnly={isSignup && signupStep === "verify"}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              opacity: isSignup && signupStep === "verify" ? 0.85 : 1,
            }}
          />
        </label>

        {(!isSignup || signupStep === "form") && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  flex: 1,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "transparent",
                  cursor: "pointer",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {isSignup && (
              <p style={{ margin: 0, opacity: 0.75, fontSize: 12 }}>
                Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
              </p>
            )}
          </label>
        )}

        {isSignup && signupStep === "form" && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Confirm password</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  flex: 1,
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "transparent",
                  cursor: "pointer",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        )}

        {isSignup && signupStep === "verify" && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Verification code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345678"
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                letterSpacing: 2,
              }}
            />
          </label>
        )}

        {isSignup && signupStep === "verify" && (
          <div style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={async () => {
                setError(null);
                setStatus(null);
                setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      shouldCreateUser: true,
                      emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                  });

                  if (error) {
                    setError(error.message);
                    return;
                  }

                  setStatus("We resent your 8-digit verification code.");
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
                opacity: 0.85,
              }}
            >
              Resend code
            </button>

            <button
              type="button"
              onClick={() => {
                setSignupStep("form");
                setCode("");
                setStatus(null);
                setError(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
                opacity: 0.85,
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#ffe5e5",
              border: "1px solid #ffb3b3",
              padding: 10,
              borderRadius: 10,
            }}
          >
            {error}
          </div>
        )}

        {status && (
          <div
            style={{
              background: "#e8f5e9",
              border: "1px solid #a5d6a7",
              padding: 10,
              borderRadius: 10,
            }}
          >
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading
            ? isSignup
              ? signupStep === "form"
                ? "Sending code..."
                : "Verifying..."
              : "Logging in..."
            : isSignup
            ? signupStep === "form"
              ? "Send verification code"
              : "Verify code"
            : "Log in"}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        {isSignup ? (
          <p>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        ) : (
          <p>
            New here? <Link href="/signup">Create an account</Link>
          </p>
        )}
      </div>
    </main>
  );
}