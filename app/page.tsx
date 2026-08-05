"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./dashboard.css";
import "./pagination.css";
import "./purchases.css";
import "./gifts.css";
import "./history.css";
import "./live-logs.css";
import { PRODUCTS } from "./products";

type Unit = { Name: string; Level?: number; Mutation?: string; Trait?: string; Slot?: number; HotbarSlot?: number; UUID?: string; isLocked?: boolean };
type Item = { Name: string; amount: number };
type GiftLog = { Id?: number | string; GiverName?: string; ReceiverName?: string; GiverId?: number | string; ReceiverId?: number | string; Time?: number; Unit?: { Name?: string; Level?: number; Mutation?: string; UUID?: string; Trait?: string } };
type PlayerData = {
  Gold?: number; Spin?: number; RobuxSpent?: number; Inventory?: Unit[]; Equipped?: Unit[]; Items?: Item[];
  Profile?: { Playtime?: number; HighestWave?: number; HighestCastle?: number; Kills?: number; HighestCash?: number; Summons?: number; Title?: string; Titles?: string[] };
  Pity?: { Legendary?: number; Mythic?: number; Secret?: number };
  Upgrades?: { Slots?: number; Luck?: number; Gold?: number; Inventory?: number };
  GiftLogs?: GiftLog[]; ProductsPurchased?: Record<string, number> | unknown[]; Gamepasses?: Record<string, { owned?: boolean }>;
};
type PlayerResult = { user: { id: string; name: string; displayName?: string }; entry: { id: string; datastore: string; scope: string }; data: PlayerData };
type PlayerRow = { userId: string; entryId: string; scope: string; username: string | null; displayName: string | null };
type PurchaseLogRow = { receipt_id: string; player_id: number; player_name?: string; product_id: number; product_name?: string; price_robux?: number; purchased_at: string };
type GiftLogRow = { gift_id: string; giver_id: number; giver_name?: string; receiver_id: number; receiver_name?: string; unit_name: string; unit_level?: number; unit_mutation?: string; unit_trait?: string; unit_uuid?: string; created_at: string };
type ProductTotalRow = { product_id: number; product_name?: string; purchase_count: number | string; robux_total: number | string; last_purchased_at: string };

const number = (value?: number) => typeof value === "number" ? value.toLocaleString() : "—";
const playtime = (seconds?: number) => typeof seconds === "number" ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : "—";
const localDateTimeValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const pathTab = pathname.startsWith("/purchases") ? "purchases" : pathname.startsWith("/gifts") ? "gifts" : "players";
  const [siteTab, setSiteTab] = useState<"players" | "purchases" | "gifts">(pathTab);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlayerResult | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPlayer, setLoadingPlayer] = useState("");
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [pageTokens, setPageTokens] = useState<string[]>([""]);

  useEffect(() => { setSiteTab(pathTab); }, [pathTab]);

  const loadPlayers = async (token = "", targetPage = 1, size = pageSize, tokenHistory = pageTokens) => {
    setLoadingList(true); setError("");
    try {
      const params = new URLSearchParams({ pageSize: String(size) });
      if (token) params.set("pageToken", token);
      const response = await fetch(`/api/players?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load players");
      setPlayers(body.players || []);
      setNextPageToken(body.nextPageToken || null);
      setPage(targetPage);
      setPageTokens(tokenHistory);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load players"); }
    finally { setLoadingList(false); }
  };

  useEffect(() => { const timer = window.setTimeout(() => loadPlayers("", 1, 10, [""]), 0); return () => window.clearTimeout(timer); }, []);

  const changePageSize = (size: number) => {
    setPageSize(size);
    setQuery("");
    loadPlayers("", 1, size, [""]);
  };

  const nextPage = () => {
    if (!nextPageToken) return;
    loadPlayers(nextPageToken, page + 1, pageSize, [...pageTokens, nextPageToken]);
  };

  const previousPage = () => {
    if (page <= 1) return;
    const history = pageTokens.slice(0, -1);
    loadPlayers(history[history.length - 1] || "", page - 1, pageSize, history);
  };

  const filtered = useMemo(() => { const value = query.trim().toLowerCase(); return players.filter((p) => p.userId.includes(value) || p.entryId.toLowerCase().includes(value) || p.username?.toLowerCase().includes(value) || p.displayName?.toLowerCase().includes(value)); }, [players, query]);

  const viewPlayer = useCallback(async (userId: string, updateUrl = true) => {
    setLoadingPlayer(userId); setError("");
    try {
      const response = await fetch(`/api/player?q=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load player");
      setSelected(body);
      if (updateUrl) router.push(`/players/${body.user.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load player"); }
    finally { setLoadingPlayer(""); }
  }, [router]);

  useEffect(() => {
    const match = pathname.match(/^\/players\/([^/]+)/);
    if (!match) {
      if (selected) setSelected(null);
      return;
    }
    const userId = decodeURIComponent(match[1]);
    if (selected?.user.id !== userId && loadingPlayer !== userId) void viewPlayer(userId, false);
  }, [pathname, selected, loadingPlayer, viewPlayer]);

  const changeSiteTab = (tab: "players" | "purchases" | "gifts") => {
    setSelected(null);
    setSiteTab(tab);
    router.push(`/${tab}`);
  };

  const directSearch = () => {
    const value = query.trim();
    if (!value) { setError("Enter a Roblox username or user ID."); return; }
    const match = filtered.find((player) => player.userId === value || player.username?.toLowerCase() === value.toLowerCase());
    if (match) viewPlayer(match.userId);
    else viewPlayer(value);
  };

  return (
    <main className="app">
      <header className="app-header">
        <div className="logo">R</div>
        <div><h1>Rollwatch</h1><p>Roblox player data</p></div>
        <span className="status"><i /> Live connection</span>
      </header>

      <div className="container">
        {error && <div className="error"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}

        {!selected ? (<>
          <div className="site-tabs"><button className={siteTab === "players" ? "active" : ""} onClick={() => changeSiteTab("players")}>Players</button><button className={siteTab === "purchases" ? "active" : ""} onClick={() => changeSiteTab("purchases")}>Purchases</button><button className={siteTab === "gifts" ? "active" : ""} onClick={() => changeSiteTab("gifts")}>Gifts</button></div>
          {siteTab === "players" ? <section>
            <div className="title-row">
              <div><h2>Players</h2><p>Profiles stored in TurnBaseLive</p></div>
              <button className="secondary" onClick={() => loadPlayers(pageTokens[page - 1] || "", page, pageSize, pageTokens)} disabled={loadingList}>Refresh</button>
            </div>

            <div className="search-row">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && directSearch()} placeholder="Search username or user ID" aria-label="Search players" />
              <button onClick={directSearch}>Search</button>
            </div>

            <div className="table-card">
              <table>
                <thead><tr><th>Player</th><th>User ID</th><th>Entry key</th><th>Scope</th><th className="action">Action</th></tr></thead>
                <tbody>
                  {loadingList && <tr><td colSpan={5} className="empty">Loading players…</td></tr>}
                  {!loadingList && filtered.length === 0 && <tr><td colSpan={5} className="empty">No match in the loaded table. Press Search to look up “{query.trim()}” directly on Roblox.</td></tr>}
                  {!loadingList && filtered.map((player) => <tr key={player.entryId}><td><div className="player-cell"><span>{(player.displayName || player.username || "?").slice(0, 2).toUpperCase()}</span><div><strong>{player.displayName || player.username || "Unavailable"}</strong>{player.displayName && player.username && player.displayName !== player.username && <small>@{player.username}</small>}</div></div></td><td>{player.userId}</td><td><code>{player.entryId}</code></td><td>{player.scope}</td><td className="action"><button className="view" onClick={() => viewPlayer(player.userId)} disabled={loadingPlayer === player.userId}>{loadingPlayer === player.userId ? "Loading…" : "View"}</button></td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <label>Rows per page <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <span>{players.length} players on this page</span>
              <div><button onClick={previousPage} disabled={page === 1 || loadingList} aria-label="Previous page">‹</button><strong>{page}</strong><button onClick={nextPage} disabled={!nextPageToken || loadingList} aria-label="Next page">›</button></div>
            </div>
          </section> : <LiveLogs type={siteTab} onError={setError} />}</>
        ) : (
          <PlayerDetail player={selected} onBack={() => { setSelected(null); router.push("/players"); }} />
        )}
      </div>
    </main>
  );
}

function LiveLogs({ type, onError }: { type: "purchases" | "gifts"; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Array<PurchaseLogRow | GiftLogRow>>([]);
  const [totals, setTotals] = useState<ProductTotalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (query.trim()) params.set("q", query.trim());
      const requests: Promise<Response>[] = [fetch(`/api/logs/${type}?${params}`, { cache: "no-store" })];
      if (type === "purchases") requests.push(fetch("/api/logs/product-totals", { cache: "no-store" }));
      const responses = await Promise.all(requests);
      const body = await responses[0].json();
      if (!responses[0].ok) {
        if (responses[0].status === 503 && body.error === "Supabase is not configured.") { setConfigured(false); return; }
        throw new Error(body.error || `Could not load ${type}`);
      }
      setConfigured(true); setRows(body.rows || []); setTotal(Number(body.total || 0));
      if (responses[1]?.ok) setTotals((await responses[1].json()).rows || []);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (error) { if (!quiet) onError(error instanceof Error ? error.message : `Could not load ${type}`); }
    finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => load(), 0);
    const timer = window.setInterval(() => load(true), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [type, page, pageSize, query]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const purchaseCount = totals.reduce((sum, row) => sum + Number(row.purchase_count || 0), 0);
  const robuxTotal = totals.reduce((sum, row) => sum + Number(row.robux_total || 0), 0);
  const topProduct = totals[0];

  return <section>
    <div className="title-row"><div><h2>{type === "purchases" ? "Purchases" : "Gifts"}</h2><p>Incoming events stored in Supabase</p></div><button className="secondary" onClick={() => load()} disabled={loading}>Refresh</button></div>
    {!configured ? <div className="config-empty"><strong>Supabase setup required</strong><span>Run the included migration and add the Supabase environment variables to load live events.</span></div> : <>
      {type === "purchases" && <div className="stats live-stats"><Stat label="Total purchases" value={Number(purchaseCount).toLocaleString()} /><Stat label="Recorded Robux" value={Number(robuxTotal).toLocaleString()} /><Stat label="Products purchased" value={totals.length.toLocaleString()} /><Stat label="Top product" value={topProduct?.product_name || (topProduct ? String(topProduct.product_id) : "None")} /></div>}
      <div className="live-toolbar"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={type === "purchases" ? "Search player, product, or ID" : "Search giver, receiver, unit, or ID"} /><span className="live-indicator"><i />Updating every 5 seconds{updatedAt ? ` · ${updatedAt}` : ""}</span></div>
      <div className="table-card live-table"><table>{type === "purchases" ? <><thead><tr><th>Receipt</th><th>Player</th><th>Product</th><th>Robux</th><th>Purchased</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="empty">Loading purchases…</td></tr> : rows.length ? (rows as PurchaseLogRow[]).map((row) => <tr key={row.receipt_id}><td><code>{row.receipt_id.slice(0, 16)}{row.receipt_id.length > 16 ? "…" : ""}</code></td><td className="log-person"><strong>{row.player_name || "Unknown"}</strong><small>{row.player_id}</small></td><td className="log-product"><strong>{row.product_name || "Unknown product"}</strong><small>{row.product_id}</small></td><td>{row.price_robux?.toLocaleString() ?? "—"}</td><td>{new Date(row.purchased_at).toLocaleString()}</td></tr>) : <tr><td colSpan={5} className="empty">No purchase events yet.</td></tr>}</tbody></> : <><thead><tr><th>Gift ID</th><th>Giver</th><th>Receiver</th><th>Unit</th><th>Created</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="empty">Loading gifts…</td></tr> : rows.length ? (rows as GiftLogRow[]).map((row) => <tr key={row.gift_id}><td><code>{row.gift_id.slice(0, 16)}{row.gift_id.length > 16 ? "…" : ""}</code></td><td className="log-person"><strong>{row.giver_name || "Unknown"}</strong><small>{row.giver_id}</small></td><td className="log-person"><strong>{row.receiver_name || "Unknown"}</strong><small>{row.receiver_id}</small></td><td className="log-product"><strong>{row.unit_name}</strong><small>Level {row.unit_level || 1}{row.unit_mutation ? ` · ${row.unit_mutation}` : ""}{row.unit_trait ? ` · ${row.unit_trait}` : ""}</small></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>) : <tr><td colSpan={5} className="empty">No gift events yet.</td></tr>}</tbody></>}</table></div>
      <TablePagination label={type} total={total} page={Math.min(page, pageCount)} pageCount={pageCount} pageSize={pageSize} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
    </>}
  </section>;
}

// Kept temporarily for backwards-compatible state during local hot reload.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GlobalPurchases({ onError }: { onError: (message: string) => void }) {
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [scanned, setScanned] = useState(0);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [buyers, setBuyers] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [complete, setComplete] = useState(false);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [lastSynced, setLastSynced] = useState("");

  const sync = async () => {
    setSyncing(true); setComplete(false); setTotals({}); setScanned(0); setTotalProfiles(0); setBuyers(0); onError("");
    let token = "";
    const combined: Record<string, number> = {};
    let scannedProfiles = 0;
    let purchasingProfiles = 0;
    try {
      const countProfiles = (async () => {
        let countToken = "";
        let profileCount = 0;
        do {
          const countParams = new URLSearchParams({ countOnly: "true" });
          if (countToken) countParams.set("pageToken", countToken);
          const countResponse = await fetch(`/api/purchase-totals?${countParams}`, { cache: "no-store" });
          const countBody = await countResponse.json();
          if (!countResponse.ok) throw new Error(countBody.error || "Could not count player profiles");
          profileCount += Number(countBody.scanned || 0);
          setTotalProfiles(profileCount);
          countToken = countBody.nextPageToken || "";
        } while (countToken);
        return profileCount;
      })();

      do {
        const params = new URLSearchParams();
        if (token) params.set("pageToken", token);
        const response = await fetch(`/api/purchase-totals?${params}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Purchase synchronization failed");
        for (const [id, count] of Object.entries(body.totals || {})) combined[id] = (combined[id] || 0) + Number(count);
        scannedProfiles += Number(body.scanned || 0);
        purchasingProfiles += Number(body.profilesWithPurchases || 0);
        setTotals({ ...combined }); setScanned(scannedProfiles); setBuyers(purchasingProfiles);
        token = body.nextPageToken || "";
        if (token) await new Promise((resolve) => setTimeout(resolve, 100));
      } while (token);
      await countProfiles;
      setComplete(true); setLastSynced(new Date().toLocaleTimeString());
    } catch (error) { onError(error instanceof Error ? error.message : "Purchase synchronization failed"); }
    finally { setSyncing(false); }
  };

  const rows = PRODUCTS.map((product) => ({ ...product, purchases: Number(totals[String(product.id)] || 0) })).sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
  const filtered = rows.filter((product) => `${product.name} ${product.id} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  const totalPurchases = rows.reduce((sum, product) => sum + product.purchases, 0);
  const syncPercent = complete ? 100 : totalProfiles > 0 ? Math.min(99, Math.floor((scanned / totalProfiles) * 100)) : 0;
  const purchasedProducts = rows.filter((product) => product.purchases > 0).length;
  const topProduct = rows[0];
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <section>
    <div className="title-row"><div><h2>Purchases</h2><p>Combined developer-product counters across all player profiles</p></div><button className="secondary" onClick={sync} disabled={syncing}>{syncing ? `Scanning ${scanned}…` : complete ? "Refresh totals" : "Sync totals"}</button></div>
    {!complete && !syncing && <div className="sync-empty"><strong>Global totals are not loaded yet</strong><p>Sync reads player profiles in small batches and combines their saved purchase counters. No player data is modified.</p><button className="view" onClick={sync}>Start sync</button></div>}
    {(syncing || complete) && <><div className="sync-status"><span className={complete ? "done" : ""}><i />{complete ? "Sync complete" : totalProfiles ? "Synchronizing profiles" : "Counting profiles"}</span><span>{syncPercent}% · {scanned.toLocaleString()}{totalProfiles ? ` of ${totalProfiles.toLocaleString()}` : ""} profiles scanned{lastSynced ? ` · Updated ${lastSynced}` : ""}</span></div><div className="sync-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={syncPercent}><span style={{ width: `${syncPercent}%` }} /></div>
      <div className="stats"><Stat label="Total purchases" value={number(totalPurchases)} /><Stat label="Purchasing profiles" value={number(buyers)} /><Stat label="Products purchased" value={number(purchasedProducts)} /><Stat label="Most purchased" value={topProduct?.purchases ? topProduct.name : "None"} /></div>
      <div className="purchase-heading"><div><h3>Product rankings</h3><p>Sorted by total purchase count across the scanned datastore.</p></div><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search products" /></div>
      <div className="table-card purchase-table"><table><thead><tr><th>Rank</th><th>Product</th><th>Category</th><th>Product ID</th><th>Purchases</th><th>Share</th></tr></thead><tbody>{paged.map((product, index) => <tr key={product.id}><td>#{(safePage - 1) * pageSize + index + 1}</td><td><strong>{product.name}</strong></td><td>{product.category}</td><td><code>{product.id}</code></td><td><strong>{number(product.purchases)}</strong></td><td>{totalPurchases ? `${((product.purchases / totalPurchases) * 100).toFixed(1)}%` : "0%"}</td></tr>)}</tbody></table></div>
      <div className="pagination"><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>{filtered.length} products</span><div><button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>‹</button><strong>{safePage}</strong><button onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage === pageCount}>›</button></div></div>
    </>}
  </section>;
}

const giftKey = (gift: GiftLog) => `${gift.Id ?? ""}-${gift.GiverId || gift.GiverName || ""}-${gift.ReceiverId || gift.ReceiverName || ""}-${gift.Time || ""}-${gift.Unit?.UUID || gift.Unit?.Name || ""}`;
const giftTime = (value?: number) => {
  if (!value) return "—";
  const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

function GiftTable({ gifts, empty = "No gift history for this player." }: { gifts: GiftLog[]; empty?: string }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const filtered = gifts.filter((gift) => `${gift.Id || ""} ${gift.GiverName || ""} ${gift.GiverId || ""} ${gift.ReceiverName || ""} ${gift.ReceiverId || ""} ${gift.Unit?.Name || ""} ${gift.Unit?.Mutation || ""} ${gift.Unit?.Trait || ""}`.toLowerCase().includes(query.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  return <>
    <div className="gift-heading"><div><h3>Gift history</h3><p>All saved transfers for this player, newest first.</p></div><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search player, unit, or gift ID" /></div>
    <div className="table-card gift-table"><table><thead><tr><th>Gift ID</th><th>Giver</th><th>Receiver</th><th>Unit</th><th>Time</th></tr></thead><tbody>{paged.length ? paged.map((gift, index) => <tr key={`${giftKey(gift)}-${index}`}><td><code>{gift.Id ?? "—"}</code></td><td><strong>{gift.GiverName || "Unknown"}</strong><br /><small>{gift.GiverId || "—"}</small></td><td><strong>{gift.ReceiverName || "Unknown"}</strong><br /><small>{gift.ReceiverId || "—"}</small></td><td className="gift-unit"><strong>{gift.Unit?.Name || "Unknown unit"}</strong><small>Level {gift.Unit?.Level || 1}{gift.Unit?.Mutation ? ` · ${gift.Unit.Mutation}` : ""}{gift.Unit?.Trait ? ` · ${gift.Unit.Trait}` : ""}</small></td><td>{giftTime(gift.Time)}</td></tr>) : <tr><td colSpan={5} className="empty">{empty}</td></tr>}</tbody></table></div>
    <div className="pagination"><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>{filtered.length} gifts</span><div><button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>‹</button><strong>{safePage}</strong><button onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage === pageCount}>›</button></div></div>
  </>;
}

function PlayerDetail({ player, onBack }: { player: PlayerResult; onBack: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathView = pathname.endsWith("/purchases") ? "purchases" : pathname.endsWith("/gifts") ? "gifts" : "details";
  const [tab, setTab] = useState<"details" | "purchases" | "gifts">(pathView);
  const [productQuery, setProductQuery] = useState("");
  const [productPageSize, setProductPageSize] = useState(10);
  const [productPage, setProductPage] = useState(1);
  const [unitPageSize, setUnitPageSize] = useState(10);
  const [unitPage, setUnitPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(10);
  const [itemPage, setItemPage] = useState(1);
  const [data, setData] = useState<PlayerData>(player.data);
  const [historyDate, setHistoryDate] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [revisionSavedAt, setRevisionSavedAt] = useState("");

  useEffect(() => { setTab(pathView); }, [pathView]);

  const changeDetailTab = (view: "details" | "purchases" | "gifts") => {
    setTab(view);
    const suffix = view === "details" ? "" : `/${view}`;
    router.push(`/players/${player.user.id}${suffix}`);
  };

  const loadHistory = async () => {
    if (!historyDate) { setHistoryError("Choose a date and time first."); return; }
    setHistoryLoading(true); setHistoryError("");
    try {
      const at = new Date(historyDate);
      if (Number.isNaN(at.getTime())) throw new Error("Choose a valid date and time.");
      const response = await fetch(`/api/player-history?userId=${encodeURIComponent(player.user.id)}&at=${encodeURIComponent(at.toISOString())}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load historical data");
      setData(body.data);
      setRevisionSavedAt(body.revision?.savedAt || "");
      setUnitPage(1); setItemPage(1); setProductPage(1);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "Could not load historical data"); }
    finally { setHistoryLoading(false); }
  };

  const showCurrent = () => {
    setData(player.data); setRevisionSavedAt(""); setHistoryDate(""); setHistoryError("");
    setUnitPage(1); setItemPage(1); setProductPage(1);
  };
  const allUnits = [...(data.Equipped || []).map((u) => ({ ...u, status: "Equipped" })), ...(data.Inventory || []).map((u) => ({ ...u, status: "Inventory" }))];
  const ownedPasses = Object.values(data.Gamepasses || {}).filter((pass) => pass.owned).length;
  const purchaseCounts = !Array.isArray(data.ProductsPurchased) && data.ProductsPurchased ? data.ProductsPurchased : {};
  const productRows = PRODUCTS.map((product) => ({ ...product, purchases: Number(purchaseCounts[String(product.id)] || 0) }));
  const totalPurchases = productRows.reduce((sum, product) => sum + product.purchases, 0);
  const purchasedProducts = productRows.filter((product) => product.purchases > 0);
  const topProduct = [...productRows].sort((a, b) => b.purchases - a.purchases)[0];
  const visibleProducts = productRows.filter((product) => `${product.name} ${product.id} ${product.category}`.toLowerCase().includes(productQuery.toLowerCase()));
  const productPageCount = Math.max(1, Math.ceil(visibleProducts.length / productPageSize));
  const safeProductPage = Math.min(productPage, productPageCount);
  const pagedProducts = visibleProducts.slice((safeProductPage - 1) * productPageSize, safeProductPage * productPageSize);
  const unitPageCount = Math.max(1, Math.ceil(allUnits.length / unitPageSize));
  const safeUnitPage = Math.min(unitPage, unitPageCount);
  const pagedUnits = allUnits.slice((safeUnitPage - 1) * unitPageSize, safeUnitPage * unitPageSize);
  const items = data.Items || [];
  const itemPageCount = Math.max(1, Math.ceil(items.length / itemPageSize));
  const safeItemPage = Math.min(itemPage, itemPageCount);
  const pagedItems = items.slice((safeItemPage - 1) * itemPageSize, safeItemPage * itemPageSize);

  return <section>
    <button className="back" onClick={onBack}>← Back to players</button>
    <div className="player-heading">
      <div className="avatar">{player.user.name.slice(0, 2).toUpperCase()}</div>
      <div><h2>{player.user.displayName || player.user.name}</h2><p>{player.user.displayName && player.user.displayName !== player.user.name ? `@${player.user.name} · ` : ""}User ID {player.user.id} · <code>{player.entry.id}</code></p></div>
      <button className="secondary copy" onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}>Copy JSON</button>
    </div>

    <div className="history-tools">
      <label htmlFor="history-date">View data from</label>
      <input id="history-date" type="datetime-local" value={historyDate} max={localDateTimeValue(new Date())} onChange={(event) => setHistoryDate(event.target.value)} />
      <button onClick={loadHistory} disabled={historyLoading}>{historyLoading ? "Loading…" : "Load date"}</button>
      {revisionSavedAt && <button className="secondary" onClick={showCurrent}>Return to current</button>}
      {revisionSavedAt && <span className="history-note">Historical revision saved {new Date(revisionSavedAt).toLocaleString()}</span>}
      {historyError && <span className="history-error">{historyError}</span>}
    </div>

    <div className="detail-tabs"><button className={tab === "details" ? "active" : ""} onClick={() => changeDetailTab("details")}>Player data</button><button className={tab === "purchases" ? "active" : ""} onClick={() => changeDetailTab("purchases")}>Purchases <span>{totalPurchases}</span></button><button className={tab === "gifts" ? "active" : ""} onClick={() => changeDetailTab("gifts")}>Gifts <span>{data.GiftLogs?.length || 0}</span></button></div>

    {tab === "details" ? <><div className="stats">
      <Stat label="Gold" value={number(data.Gold)} />
      <Stat label="Playtime" value={playtime(data.Profile?.Playtime)} />
      <Stat label="Units" value={number(allUnits.length)} />
      <Stat label="Robux spent" value={number(data.RobuxSpent)} />
    </div>

    <div className="detail-grid">
      <Card title="Progression"><DataRow label="Highest wave" value={number(data.Profile?.HighestWave)} /><DataRow label="Highest castle" value={number(data.Profile?.HighestCastle)} /><DataRow label="Kills" value={number(data.Profile?.Kills)} /><DataRow label="Summons" value={number(data.Profile?.Summons)} /><DataRow label="Highest cash" value={number(data.Profile?.HighestCash)} /></Card>
      <Card title="Pity"><DataRow label="Legendary" value={number(data.Pity?.Legendary)} /><DataRow label="Mythic" value={number(data.Pity?.Mythic)} /><DataRow label="Secret" value={number(data.Pity?.Secret)} /></Card>
      <Card title="Upgrades"><DataRow label="Slots" value={number(data.Upgrades?.Slots)} /><DataRow label="Luck" value={number(data.Upgrades?.Luck)} /><DataRow label="Gold" value={number(data.Upgrades?.Gold)} /><DataRow label="Inventory capacity" value={number(data.Upgrades?.Inventory)} /></Card>
      <Card title="Account"><DataRow label="Spins" value={number(data.Spin)} /><DataRow label="Owned gamepasses" value={number(ownedPasses)} /><DataRow label="Gift records" value={number(data.GiftLogs?.length)} /><DataRow label="Purchases" value={number(data.ProductsPurchased?.length)} /></Card>
    </div>

    <h3 className="section-title">Units</h3>
    <div className="table-card"><table><thead><tr><th>Name</th><th>Level</th><th>Mutation</th><th>Trait</th><th>Slot</th><th>Status</th></tr></thead><tbody>{pagedUnits.length ? pagedUnits.map((unit, index) => <tr key={unit.UUID || `${unit.Name}-${index}`}><td><strong>{unit.Name}</strong></td><td>{unit.Level || 1}</td><td>{unit.Mutation || "—"}</td><td>{unit.Trait || "—"}</td><td>{unit.Slot || unit.HotbarSlot || "—"}</td><td><span className={unit.status === "Equipped" ? "pill equipped" : "pill"}>{unit.status}</span></td></tr>) : <tr><td colSpan={6} className="empty">No units.</td></tr>}</tbody></table></div>
    <TablePagination label="units" total={allUnits.length} page={safeUnitPage} pageCount={unitPageCount} pageSize={unitPageSize} onPage={setUnitPage} onPageSize={(size) => { setUnitPageSize(size); setUnitPage(1); }} />

    <h3 className="section-title">Items</h3>
    <div className="table-card"><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>{pagedItems.length ? pagedItems.map((item) => <tr key={item.Name}><td><strong>{item.Name}</strong></td><td>{number(item.amount)}</td></tr>) : <tr><td colSpan={2} className="empty">No items.</td></tr>}</tbody></table></div>
    <TablePagination label="items" total={items.length} page={safeItemPage} pageCount={itemPageCount} pageSize={itemPageSize} onPage={setItemPage} onPageSize={(size) => { setItemPageSize(size); setItemPage(1); }} /></> : tab === "purchases" ? <section className="purchase-dashboard">
      <div className="stats purchase-stats"><Stat label="Lifetime Robux spent" value={number(data.RobuxSpent)} /><Stat label="Product purchases" value={number(totalPurchases)} /><Stat label="Different products" value={number(purchasedProducts.length)} /><Stat label="Most purchased" value={topProduct?.purchases ? topProduct.name : "None"} /></div>
      <div className="purchase-heading"><div><h3>Developer products</h3><p>Lifetime counters stored in this player’s profile. Individual receipt dates are not available.</p></div><input value={productQuery} onChange={(event) => { setProductQuery(event.target.value); setProductPage(1); }} placeholder="Search products" aria-label="Search products" /></div>
      <div className="table-card purchase-table"><table><thead><tr><th>Product</th><th>Category</th><th>Product ID</th><th>Purchases</th><th>Status</th></tr></thead><tbody>{pagedProducts.length ? pagedProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.category}</td><td><code>{product.id}</code></td><td><strong>{number(product.purchases)}</strong></td><td><span className={product.purchases > 0 ? "pill equipped" : "pill"}>{product.purchases > 0 ? "Purchased" : "Never purchased"}</span></td></tr>) : <tr><td colSpan={5} className="empty">No matching products found.</td></tr>}</tbody></table></div>
      <div className="pagination">
        <label>Rows per page <select value={productPageSize} onChange={(event) => { setProductPageSize(Number(event.target.value)); setProductPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <span>{visibleProducts.length} products</span>
        <div><button onClick={() => setProductPage(Math.max(1, safeProductPage - 1))} disabled={safeProductPage === 1} aria-label="Previous product page">‹</button><strong>{safeProductPage}</strong><button onClick={() => setProductPage(Math.min(productPageCount, safeProductPage + 1))} disabled={safeProductPage === productPageCount} aria-label="Next product page">›</button></div>
      </div>
    </section> : <GiftTable gifts={[...(data.GiftLogs || [])].sort((a, b) => Number(b.Time || 0) - Number(a.Time || 0))} />}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) { return <article className="stat"><span>{label}</span><strong>{value}</strong></article>; }
function TablePagination({ label, total, page, pageCount, pageSize, onPage, onPageSize }: { label: string; total: number; page: number; pageCount: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) { return <div className="pagination"><label>Rows per page <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><span>{total} {label}</span><div><button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria-label={`Previous ${label} page`}>‹</button><strong>{page}</strong><button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} aria-label={`Next ${label} page`}>›</button></div></div>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="card"><h3>{title}</h3>{children}</article>; }
function DataRow({ label, value }: { label: string; value: string }) { return <div className="data-row"><span>{label}</span><strong>{value}</strong></div>; }
