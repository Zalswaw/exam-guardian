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

const ADMIN_PIN = (import.meta.env.VITE_ADMIN_PIN as string) || "123456";
const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf_dummy_form_id_example/viewform?embedded=true";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("admin_authenticated") === "true";
  });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [newToken, setNewToken] = useState("");
  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  const [formUrlInput, setFormUrlInput] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_FORM_URL;
    return localStorage.getItem("exam_form_url") || DEFAULT_FORM_URL;
  });
  const [urlSavedMessage, setUrlSavedMessage] = useState<string | null>(null);

  const soundRef = useRef(true);
  soundRef.current = soundOn;
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current = new Ctx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const chime = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
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
    } catch {
      /* audio tidak tersedia */
    }
  }, [getAudioContext]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (pinInput.trim() === ADMIN_PIN) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_authenticated", "true");
      }
      setIsAuthenticated(true);
    } else {
      setPinError("PIN Pengawas salah. Silakan coba lagi.");
    }
  };

  const handleAdminLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_authenticated");
    }
    setIsAuthenticated(false);
  };

  const handleSaveFormUrl = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanUrl = formUrlInput.trim();
    if (!cleanUrl) return;

    // Auto fix common Google Form URL format issues
    if (cleanUrl.includes("/edit")) {
      cleanUrl = cleanUrl.replace(/\/edit.*$/, "/viewform?embedded=true");
    }
    if (cleanUrl.includes("/viewform") && !cleanUrl.includes("embedded=true")) {
      cleanUrl = cleanUrl.includes("?") ? `${cleanUrl}&embedded=true` : `${cleanUrl}?embedded=true`;
    }

    setFormUrlInput(cleanUrl);
    if (typeof window !== "undefined") {
      localStorage.setItem("exam_form_url", cleanUrl);
    }
    setUrlSavedMessage("Link Google Form berhasil diperbarui untuk portal siswa!");
    setTimeout(() => setUrlSavedMessage(null), 4000);
  };

  const loadTokens = useCallback(async () => {
    const { data } = await supabase
      .from("tokens")
      .select("id, token_string, is_active")
      .order("created_at", { ascending: false });
    setTokens(data ?? []);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [isAuthenticated, loadTokens]);

  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [isAuthenticated, chime]);

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

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
              🔒
            </div>
            <h1 className="text-xl font-bold text-foreground">Akses Dashboard Pengawas</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Masukkan PIN Pengawas untuk mengelola ujian & monitoring.
            </p>
          </div>

          <form
            onSubmit={handlePinSubmit}
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="space-y-2">
              <label htmlFor="pin" className="text-xs font-medium text-foreground">
                PIN Pengawas
              </label>
              <input
                id="pin"
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Masukkan PIN (Default: 123456)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Masuk Dashboard
            </button>

            <p className="text-center text-[11px] text-muted-foreground">
              Default PIN pengawas: <code className="font-mono bg-secondary px-1 py-0.5 rounded">123456</code>
            </p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-background"
      onClick={getAudioContext}
      onKeyDown={getAudioContext}
    >
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
                live ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-secondary text-muted-foreground"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"}`}
              />
              {live ? "Real-time aktif" : "Menghubungkan…"}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                getAudioContext();
                setSoundOn((s) => !s);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              {soundOn ? "🔔 Suara aktif" : "🔕 Suara mati"}
            </button>
            <button
              onClick={handleAdminLogout}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Link Soal Ujian (Google Form)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ubah URL Google Form yang ditampilkan pada portal siswa.
            </p>
            <form onSubmit={handleSaveFormUrl} className="mt-3 space-y-3">
              <input
                value={formUrlInput}
                onChange={(e) => setFormUrlInput(e.target.value)}
                placeholder="https://docs.google.com/forms/d/e/..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                Simpan Link Ujian
              </button>
            </form>

            {formUrlInput.includes("forms.gle") && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
                <p className="font-semibold flex items-center gap-1">
                  <span>⚠️</span> Link pendek <code>forms.gle</code> tidak bisa di-embed di iframe!
                </p>
                <p className="text-[11px] leading-relaxed">
                  Google memblokir link pendek <code>forms.gle</code> untuk dipasang dalam frame. Silakan buka link <code>{formUrlInput}</code> tersebut di tab baru browser, lalu salin URL lengkap dari address bar (yang diawali <code>https://docs.google.com/forms/d/e/...</code>).
                </p>
              </div>
            )}

            {urlSavedMessage && (
              <p className="mt-2 text-xs font-medium text-emerald-600 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                {urlSavedMessage}
              </p>
            )}
          </div>

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
                        ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
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
            <ul className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
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
            <span className="rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 text-xs font-medium">
              {logs.length} pelanggaran
            </span>
          </div>

          <div className="mt-4 space-y-3 max-h-[720px] overflow-y-auto pr-1">
            {logs.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Belum ada pelanggaran terdeteksi. Semua peserta tenang.
              </p>
            )}
            {logs.map((log, i) => (
              <article
                key={log.id}
                className={`rounded-lg border-l-4 border-destructive bg-destructive/5 p-4 shadow-sm ${
                  i === 0 ? "ring-2 ring-destructive/30" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-destructive">{log.student_name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Pelanggaran: <span className="font-semibold text-destructive">{log.violation_type}</span>
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
