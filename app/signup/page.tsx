
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  
async function handleResend() {
  if (!email.trim()) {
    setMessage("Please enter your email address first.");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const supabase = createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;

    setMessage(
      "If your account is awaiting confirmation, a new email should arrive shortly. Check your inbox and spam folder."
    );
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : "Unable to resend confirmation."
    );
  } finally {
    setLoading(false);
  }
}

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});

      if (error) throw error;

      setMessage(
        "Registration submitted! Check your email for a confirmation link if email verification is enabled."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={handleSignUp}
        className="w-full max-w-md space-y-5 rounded-3xl bg-white p-8 shadow-lg"
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-violet-700">
            LifePilot ✨
          </h1>
          <p className="mt-2 text-slate-500">
            Create your personal account

<button
  type="button"
  onClick={handleResend}
  disabled={loading}
  className="w-full rounded-xl border border-violet-300 p-3 font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
>
  Resend confirmation email
</button>

          </p>
        </div>

        <div>
          <label className="mb-2 block font-medium">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block font-medium">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-xl border p-3"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-violet-600 p-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        {message && (
          <p className="break-words text-center text-sm text-slate-600">
            {message}
          </p>
        )}

        <p className="text-center text-xs text-slate-400">
          Your journey towards a better day starts here.
        </p>
      </form>
    </main>
  );
}
