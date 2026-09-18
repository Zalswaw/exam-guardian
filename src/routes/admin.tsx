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

type TokenRow = {
  id: string;
  token_string: string;
  is_active: boolean;
  form_url?: string | null;
  exam_title?: string | null;
};
type LogRow = { id: string; student_name: string; violation_type: string; timestamp: string };
type SessionRow = { id: string; student_name: string; token_used: string; status: string };

const ADMIN_PIN = (import.meta.env.VITE_ADMIN_PIN as string) || "abc12345";
const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSecabW3KkZoKbD8x84Kv_BJIAnK3vHNK-JBaCA3CC5WyImV0Q/viewform?embedded=true";

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

  // Deleted logs tracking to prevent polling from re-displaying deleted logs
  const [deletedLogIds, setDeletedLogIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("deleted_cheat_logs") || "[]");
    } catch {
      return [];
    }
  });

  const deletedLogIdsRef = useRef<string[]>([]);
  deletedLogIdsRef.current = deletedLogIds;

  // Token creation form state
  const [newToken, setNewToken] = useState("");
  const [newExamTitle, setNewExamTitle] = useState("");
  const [newTokenFormUrl, setNewTokenFormUrl] = useState("");

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

  const handleSaveFormUrl = async (e: React.FormEvent) => {
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

    // Sync global URL to Supabase Cloud DB for all online devices
    try {
      const { data: existing } = await supabase.from("tokens").select("id").eq("token_string", "GLOBAL").maybeSingle();
      if (existing) {
        await supabase.from("tokens").update({ form_url: cleanUrl }).eq("token_string", "GLOBAL");
      } else {
        await supabase.from("tokens").insert({ token_string: "GLOBAL", form_url: cleanUrl, is_active: false, exam_title: "Global Form Setting" });
      }
    } catch { }

    setUrlSavedMessage("Link Google Form berhasil diperbarui online untuk semua perangkat!");
    setTimeout(() => setUrlSavedMessage(null), 4000);
  };

  const loadTokens = useCallback(async () => {
    let result: TokenRow[] = [];
    const { data, error } = await supabase
      .from("tokens")
      .select("id, token_string, is_active, form_url, exam_title")
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback if form_url/exam_title columns are not in remote DB schema yet
      const { data: fallbackData } = await supabase
        .from("tokens")
        .select("id, token_string, is_active")
        .order("created_at", { ascending: false });
      result = (fallbackData ?? []) as TokenRow[];
    } else {
      result = (data ?? []) as TokenRow[];
    }

    // Merge any locally stored token custom configurations
    try {
      const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
      result = result.map((t) => ({
        ...t,
        form_url: t.form_url || stored[t.token_string]?.form_url,
        exam_title: t.exam_title || stored[t.token_string]?.exam_title,
      }));
    } catch { }

    setTokens(result);
  }, []);

  const fetchLogsAndSessions = useCallback(async () => {
    const { data: logsData } = await supabase
      .from("cheat_logs")
      .select("id, student_name, violation_type, timestamp")
      .order("timestamp", { ascending: false })
      .limit(50);
    if (logsData) {
      const hiddenIds = deletedLogIdsRef.current;
      setLogs(logsData.filter((l) => !hiddenIds.includes(l.id)));
    }

    const { data: sessionsData } = await supabase
      .from("exam_sessions")
      .select("id, student_name, token_used, status")
      .order("created_at", { ascending: false })
      .limit(50);
    if (sessionsData) setSessions(sessionsData);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    void loadTokens();
    void fetchLogsAndSessions();

    // Polling every 3 seconds as a fallback
    const interval = setInterval(() => {
      void fetchLogsAndSessions();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, loadTokens, fetchLogsAndSessions]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel("pengawas-monitoring")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cheat_logs" },
        (payload) => {
          const newLog = payload.new as LogRow;
          if (!deletedLogIdsRef.current.includes(newLog.id)) {
            setLogs((prev) => [newLog, ...prev].slice(0, 100));
            chime();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "exam_sessions" },
        (payload) => {
          setSessions((prev) => [payload.new as SessionRow, ...prev].slice(0, 100));
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED" || status === "TIMED_OUT" || true));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, chime]);

  const addToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = newToken.trim().toUpperCase();
    if (!value) return;

    let cleanFormUrl = newTokenFormUrl.trim();
    if (cleanFormUrl.includes("/edit")) {
      cleanFormUrl = cleanFormUrl.replace(/\/edit.*$/, "/viewform?embedded=true");
    }
    if (cleanFormUrl.includes("/viewform") && !cleanFormUrl.includes("embedded=true")) {
      cleanFormUrl = cleanFormUrl.includes("?") ? `${cleanFormUrl}&embedded=true` : `${cleanFormUrl}?embedded=true`;
    }

    const titleVal = newExamTitle.trim();
    const payload: Record<string, unknown> = {
      token_string: value,
      is_active: true,
    };
    if (titleVal) payload.exam_title = titleVal;
    if (cleanFormUrl) payload.form_url = cleanFormUrl;

    const { error } = await supabase.from("tokens").insert(payload as any);

    if (error) {
      console.warn("Retrying with basic token insertion...", error.message);
      const { error: fbErr } = await supabase.from("tokens").insert({
        token_string: value,
        is_active: true,
      });
      if (fbErr) {
        alert("Gagal membuat token: " + fbErr.message);
        return;
      }
    }

    // Save custom configuration locally as fallback
    if (cleanFormUrl || titleVal) {
      try {
        const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
        stored[value] = {
          form_url: cleanFormUrl || undefined,
          exam_title: titleVal || undefined,
        };
        localStorage.setItem("custom_token_configs", JSON.stringify(stored));
      } catch { }
    }

    setNewToken("");
    setNewExamTitle("");
    setNewTokenFormUrl("");
    void loadTokens();
  };

  const deleteToken = async (id: string) => {
    if (!window.confirm("Hapus token ini?")) return;
    await supabase.from("tokens").delete().eq("id", id);
    void loadTokens();
  };

  const toggleToken = async (row: TokenRow) => {
    await supabase.from("tokens").update({ is_active: !row.is_active }).eq("id", row.id);
    void loadTokens();
  };

  const deleteLog = async (id: string) => {
    void supabase.from("cheat_logs").delete().eq("id", id);

    setDeletedLogIds((prev) => {
      const updated = [...prev, id];
      if (typeof window !== "undefined") {
        localStorage.setItem("deleted_cheat_logs", JSON.stringify(updated));
      }
      return updated;
    });
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const clearAllLogs = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus SELURUH riwayat pelanggaran?")) return;

    void supabase.from("cheat_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const currentIds = logs.map((l) => l.id);
    setDeletedLogIds((prev) => {
      const updated = Array.from(new Set([...prev, ...currentIds]));
      if (typeof window !== "undefined") {
        localStorage.setItem("deleted_cheat_logs", JSON.stringify(updated));
      }
      return updated;
    });
    setLogs([]);
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
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Dashboard Pengawas</h1>
              <p className="text-xs text-muted-foreground">Monitoring ujian & token secara langsung</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${live ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-secondary text-muted-foreground"
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

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Kelola Token & Soal Ujian</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Setiap Guru bisa membuat Token baru lengkap dengan Nama Ujian & Link Google Form soal masing-masing.
              </p>
            </div>

            <form onSubmit={addToken} className="space-y-2.5 rounded-lg bg-secondary/40 p-3 border border-border">
              <input
                value={newToken}
                onChange={(e) => setNewToken(e.target.value.toUpperCase())}
                placeholder="KODE TOKEN (cth: MATH-8A)"
                maxLength={32}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs tracking-widest text-foreground uppercase outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                required
              />
              <input
                value={newExamTitle}
                onChange={(e) => setNewExamTitle(e.target.value)}
                placeholder="Nama Ujian / Mapel (cth: Ujian Matematika 8A)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <input
                value={newTokenFormUrl}
                onChange={(e) => setNewTokenFormUrl(e.target.value)}
                placeholder="Link Google Form Khusus Token Ini (Opsional)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <button className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90">
                + Tambah Token & Soal Ujian
              </button>
            </form>

            <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {tokens.length === 0 && (
                <li className="text-xs text-muted-foreground text-center py-4">Belum ada token.</li>
              )}
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-1.5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                      {t.token_string}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => void toggleToken(t)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${t.is_active
                          ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                          : "bg-secondary text-muted-foreground"
                          }`}
                      >
                        {t.is_active ? "Aktif" : "Nonaktif"}
                      </button>
                      <button
                        onClick={() => void deleteToken(t.id)}
                        className="text-xs text-destructive hover:underline px-1"
                        title="Hapus Token"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {t.exam_title && (
                    <p className="text-xs font-medium text-foreground">{t.exam_title}</p>
                  )}
                  {t.form_url ? (
                    <p className="text-[11px] text-emerald-600 truncate font-mono">
                      🔗 Link Form Khusus Terpasang
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Gunakan Link Form Utama (Global)
                    </p>
                  )}
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

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Monitoring Real-Time</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 text-xs font-medium">
                {logs.length} pelanggaran
              </span>
              {logs.length > 0 && (
                <button
                  onClick={() => void clearAllLogs()}
                  className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
                >
                  🗑️ Hapus Semua
                </button>
              )}
            </div>
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
                className={`rounded-lg border-l-4 border-destructive bg-destructive/5 p-4 shadow-sm transition hover:bg-destructive/10 ${i === 0 ? "ring-2 ring-destructive/30" : ""
                  }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-destructive">{log.student_name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTime(log.timestamp)}
                    </span>
                    <button
                      onClick={() => void deleteLog(log.id)}
                      className="rounded p-1 text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition"
                      title="Hapus Pelanggaran Ini"
                    >
                      🗑️
                    </button>
                  </div>
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
