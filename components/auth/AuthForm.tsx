"use client"

import LoginForm from "./LoginForm"
import { SignupForm } from "./SignupForm"

type FormMode = "login" | "signup"

interface AuthFormProps {
  mode: FormMode
}

export default function AuthForm({ mode }: AuthFormProps) {
  return mode === "login" ? <LoginForm /> : <SignupForm />
}
