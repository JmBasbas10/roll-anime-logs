import LoginForm from "./login-form";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = params.returnTo && params.returnTo.startsWith("/") ? params.returnTo : "/players";
  return <main className="login-shell"><section className="login-panel"><div className="brand-mark">R</div><h1>Rollwatch Admin</h1><p>Sign in to inspect and repair player data.</p>{params.error && <div className="login-error">Login could not be completed.</div>}<LoginForm returnTo={returnTo} /><span className="login-note">Temporary password login is enabled until Roblox OAuth is added.</span></section></main>;
}
