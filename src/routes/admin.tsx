import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Dashboard Pengawas | Monitoring Ujian CBT" },
      {
        name: "description",
        content:
          "Kelola token ujian dan pantau pelanggaran siswa secara real-time selama ujian berbasis komputer berlangsung.",
      },
      { property: "og:title", content: "Dashboard Pengawas | Monitoring Ujian CBT" },
      {
        property: "og:description",
        content: "Kelola token ujian dan pantau pelanggaran siswa secara real-time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type TokenRow = { id: string; token_string: string; is_active: boolean };
type LogRow = { id: string; student_name: string; violation_type: string; timestamp: string };
type SessionRow = { id: string; student_name: string; token_used: string; status: string };

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AdminPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [newToken, setNewToken] = useState("");
  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  soundRef.current = soundOn;

  const chime = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const play = (freq: number, start: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.32);
      };
      play(880, 0);
      play(660, 0.22);
      setTimeout(() => void ctx.close(), 1200);
    } catch {
      /* audio tidak tersedia */
    }
  }, []);

  const loadTokens = useCallback(async () => {
    const { data } = await supabase
      .from("tokens")
      .select("id, token_string, is_active")
      .order("created_at", { ascending: false });
    setTokens(data ?? []);
  }, []);

  useEffect(() => {
    void loadTokens();
    void (async () => {
      const { data } = await supabase
        .from("cheat_logs")
        .select("id, student_name, violation_type, timestamp")
        .order("timestamp", { ascending: false })
        .limit(50);
      setLogs(data ?? []);
    })();
    void (async () => {
      const { data } = await supabase
        .from("exam_sessions")
        .select("id, student_name, token_used, status")
        .order("created_at", { ascending: false })
        .limit(50);
      setSessions(data ?? []);
    })();
  }, [loadTokens]);

  useEffect(() => {
    const channel = supabase
      .channel("pengawas-monitoring")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cheat_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as LogRow, ...prev].slice(0, 100));
          chime();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "exam_sessions" },
        (payload) => {
          setSessions((prev) => [payload.new as SessionRow, ...prev].slice(0, 100));
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chime]);

  const addToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = newToken.trim().toUpperCase();
    if (!value) return;
    await supabase.from("tokens").insert({ token_string: value, is_active: true });
    setNewToken("");
    void loadTokens();
  };

  const toggleToken = async (row: TokenRow) => {
    await supabase.from("tokens").update({ is_active: !row.is_active }).eq("id", row.id);
    void loadTokens();
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              CBT
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Dashboard Pengawas</h1>
              <p className="text-xs text-muted-foreground">Monitoring ujian & token secara langsung</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                live ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-primary" : "bg-muted-foreground"}`}
              />
              {live ? "Real-time aktif" : "Menghubungkan…"}
            </span>
            <button
              onClick={() => setSoundOn((s) => !s)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              {soundOn ? "🔔 Suara aktif" : "🔕 Suara mati"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Token Ujian</h2>
            <form onSubmit={addToken} className="mt-3 flex gap-2">
              <input
                value={newToken}
                onChange={(e) => setNewToken(e.target.value.toUpperCase())}
                placeholder="TOKEN BARU"
                maxLength={32}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm tracking-widest text-foreground uppercase outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <button className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                Tambah
              </button>
            </form>

            <ul className="mt-4 space-y-2">
              {tokens.length === 0 && (
                <li className="text-sm text-muted-foreground">Belum ada token.</li>
              )}
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="font-mono text-sm tracking-widest text-foreground">
                    {t.token_string}
                  </span>
                  <button
                    onClick={() => void toggleToken(t)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      t.is_active
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {t.is_active ? "Aktif" : "Nonaktif"}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Peserta Masuk</h2>
            <ul className="mt-3 space-y-2">
              {sessions.length === 0 && (
                <li className="text-sm text-muted-foreground">Belum ada peserta.</li>
              )}
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{s.student_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.token_used}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Monitoring Real-Time</h2>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              {logs.length} pelanggaran
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {logs.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Belum ada pelanggaran terdeteksi. Semua peserta tenang.
              </p>
            )}
            {logs.map((log, i) => (
              <article
                key={log.id}
                className={`rounded-lg border-l-4 border-destructive bg-accent p-4 shadow-sm ${
                  i === 0 ? "ring-2 ring-destructive/30" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-destructive">{log.student_name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-accent-foreground">
                  Pelanggaran: {log.violation_type}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
