"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("AnotherSlop67");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Login failed");
      router.push(returnTo);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return <form className="login-form" onSubmit={signIn}>{error && <div className="login-error">{error}</div>}<label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus /></label><button className="login-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button></form>;
}
