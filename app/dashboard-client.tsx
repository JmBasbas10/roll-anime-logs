"use client";

import { useEffect, useMemo, useState } from "react";
import "./dashboard.css";

type Session = { id: string; username?: string; displayName?: string };
type PlayerRow = { userId: string; entryId: string; scope: string; username?: string | null; displayName?: string | null };
type PlayerResult = { user: { id: string; name: string; displayName?: string }; entry: { id: string; datastore: string; scope: string }; data: Record<string, any> };
type AdminRow = { roblox_id: string; username?: string | null; active: boolean; created_at: string };

export default function DashboardClient({ session }: { session: Session }) {
  const [view, setView] = useState<"players" | "admin">("players");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlayerResult | null>(null);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { void loadPlayers(); }, []);
  useEffect(() => { if (selected) setDraft(JSON.stringify(selected.data, null, 2)); }, [selected]);

  const parsed = useMemo(() => {
    try { return draft ? JSON.parse(draft) : null; }
    catch { return null; }
  }, [draft]);

  async function loadPlayers() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/players?pageSize=25", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load players");
      setPlayers(body.players || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load players"); }
    finally { setLoading(false); }
  }

  async function loadPlayer(value = query.trim()) {
    if (!value) { setMessage("Enter a username or Roblox user ID."); return; }
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/player?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load player");
      setSelected(body);
      setConfirm(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load player"); }
    finally { setLoading(false); }
  }

  function setPath(path: string[], value: unknown) {
    if (!parsed) return;
    const copy = structuredClone(parsed);
    let node = copy;
    for (const key of path.slice(0, -1)) node = node[key] ||= {};
    node[path[path.length - 1]] = value;
    setDraft(JSON.stringify(copy, null, 2));
  }

  async function savePlayer() {
    if (!selected || !parsed || !confirm) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/player", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selected.user.id, data: parsed }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save player");
      setSelected({ ...selected, data: body.data });
      setConfirm(false);
      setMessage("Player data saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save player"); }
    finally { setLoading(false); }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }

  return <main className="app"><aside className="sidebar"><div className="mark">R</div><nav><button className={view === "players" ? "active" : ""} onClick={() => setView("players")}>Players</button><button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Admins</button></nav><button className="ghost" onClick={signOut}>Sign out</button></aside><section className="workspace"><header className="topbar"><div><h1>Rollwatch</h1><p>Player support dashboard</p></div><span>{session.displayName || session.username || session.id}</span></header>{message && <div className="notice">{message}</div>}{view === "admin" ? <AdminPanel /> : <><div className="toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadPlayer()} placeholder="Search Roblox username or ID" /><button onClick={() => loadPlayer()} disabled={loading}>Search</button><button className="secondary" onClick={loadPlayers} disabled={loading}>Refresh</button></div>{selected ? <section className="detail"><button className="link" onClick={() => setSelected(null)}>Back to list</button><div className="identity"><div className="avatar">{selected.user.name.slice(0,2).toUpperCase()}</div><div><h2>{selected.user.displayName || selected.user.name}</h2><p>@{selected.user.name} | {selected.user.id} | {selected.entry.id}</p></div></div><div className="stats"><Stat label="Gold" value={parsed?.Gold} /><Stat label="Tokens" value={parsed?.Token} /><Stat label="Spins" value={parsed?.Spin} /><Stat label="Robux spent" value={parsed?.RobuxSpent} /></div><div className="repair-grid"><NumberEdit label="Gold" value={parsed?.Gold} onChange={(value) => setPath(["Gold"], value)} /><NumberEdit label="Tokens" value={parsed?.Token} onChange={(value) => setPath(["Token"], value)} /><NumberEdit label="Spins" value={parsed?.Spin} onChange={(value) => setPath(["Spin"], value)} /><NumberEdit label="Inventory slots" value={parsed?.Upgrades?.Inventory} onChange={(value) => setPath(["Upgrades", "Inventory"], value)} /><NumberEdit label="Pity legendary" value={parsed?.Pity?.Legendary} onChange={(value) => setPath(["Pity", "Legendary"], value)} /><NumberEdit label="Pity mythic" value={parsed?.Pity?.Mythic} onChange={(value) => setPath(["Pity", "Mythic"], value)} /></div><textarea className="json-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /><label className="confirm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I reviewed this change and want to update the live Roblox datastore.</label><button className="save" disabled={loading || !confirm || !parsed} onClick={savePlayer}>Save player data</button></section> : <div className="table-card"><table><thead><tr><th>Player</th><th>User ID</th><th>Entry</th><th></th></tr></thead><tbody>{players.map((player) => <tr key={player.entryId}><td><strong>{player.displayName || player.username || "Unknown"}</strong></td><td>{player.userId}</td><td><code>{player.entryId}</code></td><td><button onClick={() => loadPlayer(player.userId)}>Open</button></td></tr>)}{!players.length && <tr><td colSpan={4}>{loading ? "Loading..." : "No players loaded."}</td></tr>}</tbody></table></div>}</>}</section></main>;
}

function Stat({ label, value }: { label: string; value: unknown }) { return <article className="stat"><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : "-"}</strong></article>; }
function NumberEdit({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) { return <label>{label}<input type="number" value={typeof value === "number" ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /></label>; }

function AdminPanel() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [robloxId, setRobloxId] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);
  async function load() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setRows(body.rows || []); else setMessage(body.error || "Could not load admins");
  }
  async function addUser() {
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ robloxId, username }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not save admin"); return; }
    setRobloxId(""); setUsername(""); setMessage("Admin saved."); await load();
  }
  async function removeUser(id: string) {
    const response = await fetch(`/api/admin/users?robloxId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await load();
  }
  return <section className="admin-panel"><h2>Authorized users</h2><p>Add Roblox user IDs that can access this dashboard.</p>{message && <div className="notice">{message}</div>}<div className="toolbar"><input value={robloxId} onChange={(event) => setRobloxId(event.target.value)} placeholder="Roblox user ID" /><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username optional" /><button onClick={addUser}>Add</button></div><div className="table-card"><table><thead><tr><th>User ID</th><th>Username</th><th>Added</th><th></th></tr></thead><tbody>{rows.filter((row) => row.active).map((row) => <tr key={row.roblox_id}><td>{row.roblox_id}</td><td>{row.username || "-"}</td><td>{new Date(row.created_at).toLocaleString()}</td><td><button onClick={() => removeUser(row.roblox_id)}>Remove</button></td></tr>)}</tbody></table></div></section>;
}
