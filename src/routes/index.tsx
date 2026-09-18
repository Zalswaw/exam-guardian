import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portal Ujian CBT | Masuk Siswa" },
      {
        name: "description",
        content:
          "Masuk dengan nama lengkap dan token ujian untuk mengikuti ujian berbasis komputer dengan pengawasan anti-curang.",
      },
      { property: "og:title", content: "Portal Ujian CBT | Masuk Siswa" },
      {
        property: "og:description",
        content: "Masuk dengan nama lengkap dan token ujian untuk mengikuti ujian berbasis komputer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf_dummy_form_id_example/viewform?embedded=true";

function StudentPage() {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ name: string; token: string } | null>(null);
  const [warning, setWarning] = useState(false);
  const [violations, setViolations] = useState(0);
  const sessionRef = useRef<{ name: string; token: string } | null>(null);

  sessionRef.current = session;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const cleanName = name.trim();
      const cleanToken = token.trim().toUpperCase();
      if (cleanName.length < 3) {
        setError("Nama lengkap minimal 3 karakter.");
        return;
      }
      if (!cleanToken) {
        setError("Token ujian wajib diisi.");
        return;
      }
      setLoading(true);
      const { data, error: qErr } = await supabase
        .from("tokens")
        .select("id, is_active")
        .eq("token_string", cleanToken)
        .maybeSingle();

      if (qErr) {
        setLoading(false);
        setError("Gagal memeriksa token. Coba lagi.");
        return;
      }
      if (!data) {
        setLoading(false);
        setError("Token tidak ditemukan. Periksa kembali token ujian Anda.");
        return;
      }
      if (!data.is_active) {
        setLoading(false);
        setError("Token ini sudah tidak aktif. Hubungi pengawas.");
        return;
      }

      await supabase
        .from("exam_sessions")
        .insert({ student_name: cleanName, token_used: cleanToken, status: "active" });

      setLoading(false);
      setSession({ name: cleanName, token: cleanToken });
    },
    [name, token],
  );

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;

    const onVisibility = () => {
      if (!document.hidden) return;
      const current = sessionRef.current;
      if (!current) return;
      void supabase
        .from("cheat_logs")
        .insert({ student_name: current.name, violation_type: "Pindah Tab" });
      setViolations((v) => v + 1);
      setWarning(true);
      clearTimeout(timer);
      timer = setTimeout(() => setWarning(false), 6000);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer);
    };
  }, [session]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
              CBT
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Portal Ujian Siswa</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Masukkan data diri Anda untuk memulai ujian.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <div className="space-y-2">
              <label htmlFor="nama" className="text-sm font-medium text-foreground">
                Nama Lengkap
              </label>
              <input
                id="nama"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium text-foreground">
                Token Ujian
              </label>
              <input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                maxLength={32}
                placeholder="MASUKKAN TOKEN"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-widest text-foreground uppercase outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-accent px-3 py-2 text-sm text-accent-foreground">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Memeriksa..." : "Mulai Ujian"}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Dengan masuk, aktivitas layar Anda diawasi oleh pengawas.
            </p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              CBT
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{session.name}</p>
              <p className="font-mono text-xs text-muted-foreground">Token: {session.token}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Diawasi
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
              Pelanggaran: {violations}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <iframe
            title="Lembar Soal Ujian"
            src={FORM_URL}
            width="100%"
            height="800px"
            className="block w-full border-0"
          >
            Memuat soal…
          </iframe>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Jangan berpindah tab atau keluar dari halaman ini selama ujian berlangsung.
        </p>
      </div>

      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4">
          <div className="w-full max-w-sm rounded-xl border-2 border-destructive bg-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-destructive">Peringatan</h2>
            <p className="mt-2 text-sm text-foreground">
              Anda terdeteksi pindah tab. Pengawas telah dinotifikasi!
            </p>
            <button
              onClick={() => setWarning(false)}
              className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
