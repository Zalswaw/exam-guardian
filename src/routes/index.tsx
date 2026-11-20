import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  KeyRound,
  Clock,
  Maximize2,
  Minimize2,
  LogOut,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  ExternalLink,
  Loader2,
  Lock,
  ArrowRight,
  Radio,
  Eye,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portal Ujian Siswa | CBT Exam Guardian" },
      {
        name: "description",
        content:
          "Masuk dengan nama lengkap dan token ujian untuk mengikuti ujian berbasis komputer dengan sistem pengawasan anti-curang real-time.",
      },
      { property: "og:title", content: "Portal Ujian Siswa | CBT Exam Guardian" },
      {
        property: "og:description",
        content: "Masuk dengan nama lengkap dan token ujian untuk mengikuti ujian berbasis komputer.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: StudentPage,
});

const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSecabW3KkZoKbD8x84Kv_BJIAnK3vHNK-JBaCA3CC5WyImV0Q/viewform?embedded=true";

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
    room?: string;
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
  const [warningType, setWarningType] = useState("");
  const [violations, setViolations] = useState(0);
  const [formUrl, setFormUrl] = useState(DEFAULT_FORM_URL);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const sessionRef = useRef<{ name: string; token: string; room?: string } | null>(null);
  sessionRef.current = session;
  const lastLogRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Live digital clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (session?.formUrl) {
      setFormUrl(session.formUrl);
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
      let data: {
        id: string;
        is_active: boolean;
        form_url?: string | null;
        exam_title?: string | null;
        room?: string | null;
      } | null = null;

      const { data: qData, error: qErr } = await supabase
        .from("tokens")
        .select("id, is_active, form_url, exam_title, room")
        .eq("token_string", cleanToken)
        .maybeSingle();

      if (qErr) {
        console.warn("Supabase tokens query warning (possible schema column missing):", qErr);
        // Fallback query if columns don't exist yet on remote DB
        const { data: fbData, error: fbErr } = await supabase
          .from("tokens")
          .select("id, is_active")
          .eq("token_string", cleanToken)
          .maybeSingle();

        if (fbErr) {
          setLoading(false);
          setError("Gagal memeriksa token ujian. Periksa koneksi internet Anda.");
          return;
        }
        data = fbData;
      } else {
        data = qData;
      }

      if (!data) {
        setLoading(false);
        setError("Token tidak terdaftar. Pastikan kode token yang Anda masukkan sesuai.");
        return;
      }
      if (!data.is_active) {
        setLoading(false);
        setError("Token ujian ini sudah dinonaktifkan oleh pengawas.");
        return;
      }

      let tokenFormUrl = data.form_url;
      let tokenExamTitle = data.exam_title;
      let tokenRoom = data.room || "Ruang 1";

      try {
        const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
        if (stored[cleanToken]) {
          tokenFormUrl = tokenFormUrl || stored[cleanToken].form_url;
          tokenExamTitle = tokenExamTitle || stored[cleanToken].exam_title;
          tokenRoom = stored[cleanToken].room || tokenRoom;
        }
      } catch {}

      // Strict 1 Token = 1 GForm policy
      if (!tokenFormUrl) {
        setLoading(false);
        if (qErr) {
          setError(
            "Database Supabase belum memiliki kolom form_url (Error 400). Harap pengawas/admin menjalankan skrip migrasi SQL di Supabase SQL Editor agar link form tersimpan di database.",
          );
        } else {
          setError(
            "Token ini belum memiliki link Google Form soal ujian. Hubungi pengawas ruang untuk mengisi link form soal pada token ini.",
          );
        }
        return;
      }

      await supabase
        .from("exam_sessions")
        .insert({ student_name: cleanName, token_used: cleanToken, status: "active" });

      const targetExamTitle = tokenExamTitle || `Ujian ${tokenRoom}`;

      const newSess = {
        name: cleanName,
        token: cleanToken,
        formUrl: tokenFormUrl,
        examTitle: targetExamTitle,
        room: tokenRoom,
      };

      if (typeof window !== "undefined") {
        sessionStorage.setItem("exam_student_session", JSON.stringify(newSess));
      }
      setFormUrl(tokenFormUrl);
      setLoading(false);
      setSession(newSess);
    },
    [name, token],
  );

  const confirmFinishExam = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("exam_student_session");
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setSession(null);
    setShowFinishConfirm(false);
    setViolations(0);
  }, []);

  // Anti-cheat monitoring effect
  useEffect(() => {
    if (!session) return;

    const recordViolation = async (type: string, msg: string) => {
      const now = Date.now();
      if (now - lastLogRef.current < 2500) return;
      lastLogRef.current = now;

      const current = sessionRef.current;
      if (!current) return;

      const studentNameWithRoom = current.room
        ? `${current.name} [${current.room}]`
        : current.name;

      const { error: insErr } = await supabase
        .from("cheat_logs")
        .insert({ student_name: studentNameWithRoom, violation_type: type });

      if (insErr) {
        console.error("Gagal menyimpan log pelanggaran:", insErr);
      }

      setViolations((v) => v + 1);
      setWarningType(type);
      setWarningMessage(msg);
      setWarning(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setWarning(false), 7000);
    };

    const onVisibility = () => {
      if (document.hidden) {
        void recordViolation(
          "Pindah Tab Browser",
          "Anda terdeteksi berpindah tab atau meminimalkan browser. Aktivitas ini dicatat dalam laporan pengawas!",
        );
      }
    };

    const onBlur = () => {
      setTimeout(() => {
        if (
          document.activeElement &&
          (document.activeElement.tagName === "IFRAME" ||
            document.activeElement.closest("iframe"))
        ) {
          // Focus moved inside the Google Form iframe - normal behaviour
          return;
        }
        if (document.hasFocus()) {
          return;
        }
        void recordViolation(
          "Fokus Jendela Hilang",
          "Jendela ujian kehilangan fokus (terindikasi membuka aplikasi lain). Pengawas telah dinotifikasi!",
        );
      }, 180);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void recordViolation(
        "Menu Klik Kanan",
        "Penggunaan klik kanan dinonaktifkan demi integritas ujian berlangsung.",
      );
    };

    const onCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      void recordViolation(
        "Menyalin / Menempel Teks",
        "Tindakan Copy-Paste dilarang keras selama sesi ujian berlangsung.",
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey &&
          e.shiftKey &&
          (e.key === "I" ||
            e.key === "i" ||
            e.key === "J" ||
            e.key === "j" ||
            e.key === "C" ||
            e.key === "c")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "U"))
      ) {
        e.preventDefault();
        void recordViolation(
          "Developer Tools / Inspect",
          "Dilarang membuka Developer Tools atau melihat kode sumber halaman ujian!",
        );
        return;
      }

      // Deteksi shortcut AI Sidebar & Screenshot
      if (
        (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) ||
        (e.ctrlKey && e.shiftKey && e.key === ".") ||
        e.key === "PrintScreen"
      ) {
        e.preventDefault();
        void recordViolation(
          "Pintasan AI Sidebar / Screenshot",
          "Dilarang menggunakan pintasan AI Sidebar (Gemini / Copilot) atau tangkapan layar!",
        );
      }
    };

    // Deteksi AI Sidebar via window resize
    let lastWidth = window.innerWidth;
    const SIDEBAR_THRESHOLD = 150;
    const onResize = () => {
      const currentWidth = window.innerWidth;
      const delta = lastWidth - currentWidth;
      if (delta > SIDEBAR_THRESHOLD) {
        void recordViolation(
          "Panel Samping AI Dibuka",
          "Terdeteksi panel samping browser (Google Gemini / MS Copilot) dibuka saat ujian berlangsung!",
        );
      }
      lastWidth = currentWidth;
    };

    // Deteksi Browser Extension via MutationObserver
    const SUSPICIOUS_ATTR_PREFIXES = [
      "data-ext",
      "crx-",
      "__ext",
      "ext-",
      "data-grammarly",
      "data-dashlane",
    ];
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.shadowRoot !== null) {
            void recordViolation(
              "Ekstensi Browser Terdeteksi",
              "Terdeteksi injeksi elemen ekstensi browser yang tidak diizinkan selama ujian.",
            );
            break;
          }
          const attrs = Array.from(el.attributes || []);
          const isSuspicious = attrs.some((a) =>
            SUSPICIOUS_ATTR_PREFIXES.some((prefix) => a.name.startsWith(prefix)),
          );
          if (isSuspicious) {
            void recordViolation(
              "Ekstensi Browser Terdeteksi",
              "Terdeteksi ekstensi browser yang tidak diizinkan aktif saat ujian berlangsung.",
            );
            break;
          }
        }
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyCutPaste);
    document.addEventListener("cut", onCopyCutPaste);
    document.addEventListener("paste", onCopyCutPaste);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyCutPaste);
      document.removeEventListener("cut", onCopyCutPaste);
      document.removeEventListener("paste", onCopyCutPaste);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      mutationObserver.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session]);

  // LOGIN SCREEN
  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-800 antialiased selection:bg-[#DFE9FD] selection:text-[#0437AC]">
        {/* Top Header */}
        <div className="w-full border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="h-9 w-9 object-contain" />
              <div>
                <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
                  CBT EXAM GUARDIAN
                </span>
                <span className="hidden sm:inline-block text-[11px] text-slate-500 font-medium">
                  Sistem Pengawasan Asesmen Terpadu
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Sistem Siap</span>
              </div>
              <Link
                to="/admin"
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <Lock className="h-3.5 w-3.5 text-slate-500" />
                <span>Portal Pengawas</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Main Form Center */}
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-md">
            {/* Header info */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm border border-slate-200/90">
                <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#598DF8]/30 bg-[#DFE9FD]/80 px-3 py-1 text-xs font-semibold text-[#0437AC] mb-2.5">
                <Radio className="h-3 w-3 animate-pulse text-[#598DF8]" />
                <span>Portal Resmi Peserta Ujian</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Masuk Sesi Ujian
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Lengkapi identitas dan masukkan token yang diberikan oleh pengawas.
              </p>
            </div>

            {/* Card Form */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="nama" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-[#598DF8]" />
                    Nama Lengkap Peserta
                  </label>
                  <div className="relative">
                    <input
                      id="nama"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#598DF8] focus:ring-3 focus:ring-[#DFE9FD]"
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Gunakan nama resmi yang terdaftar pada lembar absensi.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="token" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-[#598DF8]" />
                    Token Ujian
                  </label>
                  <div className="relative">
                    <input
                      id="token"
                      value={token}
                      onChange={(e) => setToken(e.target.value.toUpperCase())}
                      maxLength={32}
                      placeholder="CONTOH: CBT-IPA-01"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 font-mono text-base font-semibold tracking-wider text-slate-900 uppercase placeholder:text-slate-400 outline-none transition focus:border-[#598DF8] focus:bg-white focus:ring-3 focus:ring-[#DFE9FD] text-center"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 text-center">
                    Token bersifat peka huruf besar (case-sensitive) & diberikan oleh pengawas.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                    <p className="font-medium leading-relaxed">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#598DF8] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#4379ee] focus:outline-none focus:ring-3 focus:ring-[#DFE9FD] active:bg-[#0437AC] disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memverifikasi Token...</span>
                    </>
                  ) : (
                    <>
                      <span>Mulai Sesi Ujian</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Security info list */}
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase mb-2.5 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-[#598DF8]" />
                  Protokol Keamanan Ujian
                </p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Dilarang berpindah tab browser atau membuka aplikasi lain</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Klik kanan, salin/tempel (copy-paste), dan inspect dinonaktifkan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Seluruh indikasi kecurangan terekam otomatis di layar pengawas</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 text-center sm:hidden">
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Masuk sebagai Pengawas Ujian</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-3 px-4 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} CBT Exam Guardian • Sistem Asesmen Terintegrasi & Pengawasan Berintegritas</p>
        </footer>
      </main>
    );
  }

  // ACTIVE EXAM SCREEN
  return (
    <main className="min-h-screen bg-slate-100 text-slate-800 flex flex-col select-none">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* Left: Branding & Student Info */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-9 w-9 object-contain" />

            <div className="border-l border-slate-200 pl-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">{session.name}</span>
                <span className="rounded-md bg-[#DFE9FD]/80 px-2 py-0.5 font-mono text-xs font-bold text-[#0437AC] border border-[#598DF8]/30">
                  {session.token}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                  {session.room || "Ruang 1"}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-xs">
                {session.examTitle || "Portal Ujian CBT"}
              </p>
            </div>
          </div>

          {/* Right: Monitoring status, clock, fullscreen & logout */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Real-time Digital Clock */}
            <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>{currentTime}</span>
            </div>

            {/* Supervision Badge */}
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Pengawasan Aktif</span>
            </div>

            {/* Violation Counter Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                violations > 0
                  ? "border border-red-300 bg-red-50 text-red-700 animate-pulse"
                  : "border border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>
                Pelanggaran: <strong className="font-mono">{violations}</strong>
              </span>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
              title={isFullscreen ? "Keluar Layar Penuh" : "Mode Layar Penuh"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5 text-slate-500" />
                  <span className="hidden lg:inline">Normal</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5 text-slate-500" />
                  <span className="hidden lg:inline">Layar Penuh</span>
                </>
              )}
            </button>

            {/* Finish Exam Button */}
            <button
              onClick={() => setShowFinishConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-600 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Selesai Ujian</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 mx-auto w-full max-w-7xl p-3 sm:p-5 flex flex-col">
        {/* Exam Card Container */}
        <div className="flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
          {/* Exam frame toolbar */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Lembar Soal Ujian Digital</span>
              <span className="hidden sm:inline-block text-[11px] text-slate-500 font-medium border-l border-slate-200 pl-2">
                Google Form Terverifikasi
              </span>
            </div>

            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-blue-600 transition"
              title="Muat ulang lembar soal jika ada kendala koneksi"
            >
              <RotateCw className="h-3 w-3" />
              <span>Muat Ulang Soal</span>
            </button>
          </div>

          {/* Iframe or Helpful Notice */}
          <div className="flex-1 bg-white relative min-h-[640px] sm:min-h-[820px]">
            {formUrl.includes("dummy_form_id_example") ? (
              <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center h-full">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4 border border-blue-200">
                  <FileQuestion className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Link Google Form Belum Dikonfigurasi</h3>
                <p className="mt-1.5 max-w-md text-sm text-slate-600">
                  Pengawas belum memasukkan tautan Google Form ujian yang valid untuk token ini.
                </p>

                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-left text-xs max-w-md w-full space-y-2.5">
                  <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-600" />
                    Panduan Pengawas / Guru:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-relaxed">
                    <li>
                      Buka konsol pengawas di{" "}
                      <Link to="/admin" className="font-mono font-semibold text-blue-600 underline">
                        /admin
                      </Link>
                    </li>
                    <li>Masukkan PIN Pengawas (Default: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">123456</code>)</li>
                    <li>Tempelkan link Google Form ujian pada bagian <strong>Link Soal Ujian</strong> atau pada Token terkait.</li>
                  </ol>
                </div>
              </div>
            ) : formUrl.includes("forms.gle") ? (
              <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center h-full">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Format Link Pendek (forms.gle) Terdeteksi</h3>
                <p className="mt-1.5 max-w-lg text-sm text-slate-600 leading-relaxed">
                  Google memblokir tautan pendek <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">{formUrl}</code> untuk dibuka di dalam bingkai halaman ujian.
                </p>

                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-left text-xs max-w-lg w-full space-y-2">
                  <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-amber-700" />
                    Solusi Cepat untuk Pengawas:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-amber-800 leading-relaxed">
                    <li>Buka tautan pendek tersebut di tab browser terpisah.</li>
                    <li>Salin alamat lengkap pada bilah URL (yang diawali <code>https://docs.google.com/forms/d/e/...</code>).</li>
                    <li>
                      Perbarui link di{" "}
                      <Link to="/admin" className="font-mono font-bold underline">
                        /admin
                      </Link>
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <iframe
                key={iframeKey}
                title="Lembar Soal Ujian Digital"
                src={formUrl}
                className="w-full h-full min-h-[640px] sm:min-h-[820px] border-0 block"
                allow="camera; microphone; display-capture"
              >
                Memuat lembar soal...
              </iframe>
            )}
          </div>
        </div>

        {/* Security reminders below the sheet */}
        <p className="mt-3 text-center text-xs text-slate-500">
          Tetap berada di jendela ujian hingga selesai. Setiap perpindahan fokus jendela dipantau oleh pengawas secara langsung.
        </p>
      </div>

      {/* VIOLATION WARNING MODAL */}
      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border-2 border-red-500 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
              <ShieldAlert className="h-8 w-8" />
            </div>

            <div className="text-center">
              <div className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                Peringatan Sistem #{violations}
              </div>
              <h2 className="text-xl font-bold text-slate-900">Pelanggaran Terdeteksi!</h2>
              <p className="mt-1 text-xs font-semibold text-red-600 uppercase tracking-wide">
                {warningType || "Aktivitas Tidak Sah"}
              </p>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                {warningMessage || "Anda terdeteksi melakukan tindakan yang dilarang selama sesi ujian."}
              </p>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setWarning(false)}
                className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-red-700 focus:outline-none focus:ring-3 focus:ring-red-200 cursor-pointer"
              >
                Saya Mengerti & Kembali ke Ujian
              </button>
            </div>

            <p className="mt-3 text-center text-[11px] text-slate-400">
              Notifikasi pelanggaran telah dikirimkan secara langsung ke pengawas ujian.
            </p>
          </div>
        </div>
      )}

      {/* FINISH EXAM CONFIRMATION MODAL */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-xs border border-slate-200">
              <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Konfirmasi Penyelesaian Ujian</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Pastikan Anda telah menekan tombol <strong>Kirim (Submit)</strong> pada lembar soal Google Form di atas sebelum keluar.
              </p>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Peserta:</span>
                <span className="font-semibold text-slate-900">{session.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ruangan Ujian:</span>
                <span className="font-semibold text-slate-900">{session.room || "Ruang 1"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Token Digunakan:</span>
                <span className="font-mono font-semibold text-[#0437AC] bg-[#DFE9FD]/70 px-1.5 py-0.5 rounded border border-[#598DF8]/30">
                  {session.token}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Catatan Pelanggaran:</span>
                <span className={`font-semibold ${violations > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {violations} kali
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Kembali ke Soal
              </button>
              <button
                onClick={confirmFinishExam}
                className="flex-1 rounded-lg bg-[#598DF8] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#4379ee] cursor-pointer"
              >
                Ya, Selesaikan Ujian
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}