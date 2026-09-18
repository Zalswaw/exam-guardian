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

const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf_dummy_form_id_example/viewform?embedded=true";

function StudentPage() {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    name: string;
    token: string;
    formUrl?: string;
    examTitle?: string;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = sessionStorage.getItem("exam_student_session");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [warning, setWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [violations, setViolations] = useState(0);
  const [formUrl, setFormUrl] = useState(DEFAULT_FORM_URL);

  const sessionRef = useRef<{ name: string; token: string } | null>(null);
  sessionRef.current = session;
  const lastLogRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (session?.formUrl) {
      setFormUrl(session.formUrl);
    } else if (typeof window !== "undefined") {
      const savedUrl = localStorage.getItem("exam_form_url");
      if (savedUrl) setFormUrl(savedUrl);
    }
  }, [session]);

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
      let data: { id: string; is_active: boolean; form_url?: string | null; exam_title?: string | null } | null = null;
      
      const { data: qData, error: qErr } = await supabase
        .from("tokens")
        .select("id, is_active, form_url, exam_title")
        .eq("token_string", cleanToken)
        .maybeSingle();

      if (qErr) {
        // Fallback query if columns don't exist yet on remote DB
        const { data: fbData, error: fbErr } = await supabase
          .from("tokens")
          .select("id, is_active")
          .eq("token_string", cleanToken)
          .maybeSingle();

        if (fbErr) {
          setLoading(false);
          setError("Gagal memeriksa token. Coba lagi.");
          return;
        }
        data = fbData;
      } else {
        data = qData;
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

      let tokenFormUrl = data.form_url;
      let tokenExamTitle = data.exam_title;

      try {
        const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
        if (stored[cleanToken]) {
          tokenFormUrl = tokenFormUrl || stored[cleanToken].form_url;
          tokenExamTitle = tokenExamTitle || stored[cleanToken].exam_title;
        }
      } catch {}

      const targetFormUrl = tokenFormUrl || localStorage.getItem("exam_form_url") || DEFAULT_FORM_URL;
      const targetExamTitle = tokenExamTitle || "Portal Ujian CBT";

      const newSess = {
        name: cleanName,
        token: cleanToken,
        formUrl: targetFormUrl,
        examTitle: targetExamTitle,
      };

      if (typeof window !== "undefined") {
        sessionStorage.setItem("exam_student_session", JSON.stringify(newSess));
      }
      setFormUrl(targetFormUrl);
      setLoading(false);
      setSession(newSess);
    },
    [name, token],
  );

  const handleFinishExam = useCallback(() => {
    if (window.confirm("Apakah Anda yakin telah menyelesaikan ujian dan ingin keluar?")) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("exam_student_session");
      }
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    const recordViolation = async (type: string, msg: string) => {
      const now = Date.now();
      if (now - lastLogRef.current < 2500) return;
      lastLogRef.current = now;

      const current = sessionRef.current;
      if (!current) return;

      const { error: insErr } = await supabase
        .from("cheat_logs")
        .insert({ student_name: current.name, violation_type: type });

      if (insErr) {
        console.error("Gagal menyimpan log pelanggaran ke database:", insErr);
      }

      setViolations((v) => v + 1);
      setWarningMessage(msg);
      setWarning(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setWarning(false), 6000);
    };

    const onVisibility = () => {
      if (document.hidden) {
        void recordViolation(
          "Pindah Tab",
          "Anda terdeteksi berpindah tab browser. Pengawas telah dinotifikasi!",
        );
      }
    };

    const onBlur = () => {
      // Delay slightly to check if focus transferred to the embedded Google Form iframe
      setTimeout(() => {
        if (
          document.activeElement &&
          (document.activeElement.tagName === "IFRAME" ||
            document.activeElement.closest("iframe"))
        ) {
          // Focus moved inside the Google Form iframe - NOT a violation!
          return;
        }
        if (document.hasFocus()) {
          return;
        }
        void recordViolation(
          "Pindah Jendela / Fokus Hilang",
          "Jendela ujian kehilangan fokus (terindikasi membuka aplikasi lain). Pengawas dinotifikasi!",
        );
      }, 150);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void recordViolation(
        "Klik Kanan / Inspect",
        "Penggunaan menu klik kanan dilarang selama ujian berlangsung!",
      );
    };

    const onCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      void recordViolation(
        "Menyalin/Menempel Teks",
        "Tindakan menyalin (Copy) atau menempel (Paste) dilarang selama ujian!",
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "U"))
      ) {
        e.preventDefault();
        void recordViolation(
          "Inspect / Developer Tools",
          "Dilarang membuka Developer Tools / Inspect Element!",
        );
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyCutPaste);
    document.addEventListener("cut", onCopyCutPaste);
    document.addEventListener("paste", onCopyCutPaste);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyCutPaste);
      document.removeEventListener("cut", onCopyCutPaste);
      document.removeEventListener("paste", onCopyCutPaste);
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
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
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm tracking-widest text-foreground uppercase outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive font-medium">
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
              Dengan masuk, aktivitas layar Anda diawasi oleh pengawas secara otomatis.
            </p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              CBT
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {session.name} {session.examTitle ? `• ${session.examTitle}` : ""}
              </p>
              <p className="font-mono text-xs text-muted-foreground">Token: {session.token}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Diawasi
            </span>
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                violations > 0
                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              Pelanggaran: {violations}
            </span>
            <button
              onClick={handleFinishExam}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              Selesai Ujian
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {formUrl.includes("dummy_form_id_example") ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 text-4xl">📋</div>
              <h3 className="text-lg font-bold text-foreground">Link Google Form Belum Diatur</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Pengawas belum mengkonfigurasi link Google Form ujian yang valid.
              </p>
              <div className="mt-6 rounded-lg bg-secondary/80 p-4 text-left text-xs space-y-2 text-foreground max-w-lg">
                <p className="font-semibold">Cara Pengawas Mengatur Link Soal:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Buka halaman Admin di <code className="font-mono bg-background px-1 py-0.5 rounded text-foreground">/admin</code></li>
                  <li>Masukkan PIN Pengawas (Default: <code className="font-mono bg-background px-1 py-0.5 rounded text-foreground">123456</code>)</li>
                  <li>Di bagian <strong>Link Soal Ujian (Google Form)</strong>, tempelkan link Google Form ujian Anda lalu klik <strong>Simpan Link Ujian</strong>.</li>
                </ol>
              </div>
            </div>
          ) : formUrl.includes("forms.gle") ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 text-4xl">⚠️</div>
              <h3 className="text-lg font-bold text-amber-600">Link Pendek forms.gle Tidak Dapat Ditampilkan</h3>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Link yang dimasukkan Pengawas adalah link pendek (<code className="font-mono bg-secondary px-1 py-0.5 rounded">{formUrl}</code>). Google secara otomatis memblokir link pendek <code>forms.gle</code> untuk dipasang dalam bingkai iframe.
              </p>
              <div className="mt-6 rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-left text-xs space-y-2 text-foreground max-w-lg">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Solusi untuk Pengawas:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Buka link <code className="font-mono text-foreground">{formUrl}</code> di tab browser baru.</li>
                  <li>Salin alamat lengkap dari bilah browser (yang diawali <code>https://docs.google.com/forms/d/e/...</code>).</li>
                  <li>Buka <code className="font-mono text-foreground">/admin</code> dan simpan link lengkap tersebut.</li>
                </ol>
              </div>
            </div>
          ) : (
            <iframe
              title="Lembar Soal Ujian"
              src={formUrl}
              width="100%"
              height="850px"
              className="block w-full border-0"
            >
              Memuat soal…
            </iframe>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Jangan berpindah tab, berpindah aplikasi, atau melakukan klik kanan selama ujian berlangsung.
        </p>
      </div>

      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border-2 border-destructive bg-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-destructive">Peringatan Anti-Curang</h2>
            <p className="mt-2 text-sm text-foreground">
              {warningMessage || "Anda terdeteksi melakukan pelanggaran. Pengawas telah dinotifikasi!"}
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
