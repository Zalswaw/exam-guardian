import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Lock,
  KeyRound,
  Trash2,
  Volume2,
  VolumeX,
  RefreshCw,
  ExternalLink,
  LogOut,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Search,
  Radio,
  Clock,
  ArrowLeft,
  Eye,
  EyeOff,
  DoorOpen,
  Sliders,
  Settings2,
  Filter,
  Maximize2,
  Minimize2,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Dashboard Pengawas | CBT Exam Guardian" },
      {
        name: "description",
        content:
          "Pusat kendali dan monitoring ujian CBT real-time dengan dukungan 10 akun pengawas ruang dan sistem 1 token = 1 Google Form.",
      },
      { property: "og:title", content: "Dashboard Pengawas | CBT Exam Guardian" },
      {
        property: "og:description",
        content: "Kelola token ujian dan pantau pelanggaran peserta per ruang secara real-time.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AdminPage,
});

export const PROCTOR_ROOMS = [
  { id: "all", name: "Semua Ruang", label: "Admin Pusat (Semua Ruang)" },
  { id: "Ruang 1", name: "Ruang 1", label: "Pengawas Ruang 1" },
  { id: "Ruang 2", name: "Ruang 2", label: "Pengawas Ruang 2" },
  { id: "Ruang 3", name: "Ruang 3", label: "Pengawas Ruang 3" },
  { id: "Ruang 4", name: "Ruang 4", label: "Pengawas Ruang 4" },
  { id: "Ruang 5", name: "Ruang 5", label: "Pengawas Ruang 5" },
  { id: "Ruang 6", name: "Ruang 6", label: "Pengawas Ruang 6" },
  { id: "Ruang 7", name: "Ruang 7", label: "Pengawas Ruang 7" },
  { id: "Ruang 8", name: "Ruang 8", label: "Pengawas Ruang 8" },
  { id: "Ruang 9", name: "Ruang 9", label: "Pengawas Ruang 9" },
  { id: "Ruang 10", name: "Ruang 10", label: "Pengawas Ruang 10" },
];

type TokenRow = {
  id: string;
  token_string: string;
  is_active: boolean;
  form_url?: string | null;
  exam_title?: string | null;
  room?: string | null;
};

type LogRow = {
  id: string;
  student_name: string;
  violation_type: string;
  timestamp: string;
  room?: string | null;
};

type SessionRow = {
  id: string;
  student_name: string;
  token_used: string;
  status: string;
  room?: string | null;
};

const MASTER_PIN = (import.meta.env.VITE_ADMIN_PIN as string) || "123456";

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
}

function getStoredRoomPins(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("exam_room_pins") || "{}");
  } catch {
    return {};
  }
}

function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("admin_authenticated") === "true";
  });

  const [activeAccountRoom, setActiveAccountRoom] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return sessionStorage.getItem("admin_account_room") || "all";
  });

  const [selectedLoginRoom, setSelectedLoginRoom] = useState<string>("Ruang 1");
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Active view filter (defaults to the logged-in room or 'all')
  const [roomFilter, setRoomFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return sessionStorage.getItem("admin_account_room") || "all";
  });

  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Deleted logs tracking
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
  const [newTokenRoom, setNewTokenRoom] = useState<string>("Ruang 1");
  const [tokenFormError, setTokenFormError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [roomPins, setRoomPins] = useState<Record<string, string>>(getStoredRoomPins);
  const [editingRoomPin, setEditingRoomPin] = useState<string | null>(null);
  const [newPinValue, setNewPinValue] = useState("");
  const [isIncidentFullscreen, setIsIncidentFullscreen] = useState(false);
  const [schemaNeedsMigration, setSchemaNeedsMigration] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const MIGRATION_SQL = `-- 1. Tambahkan kolom form_url, exam_title, dan room ke tabel tokens
ALTER TABLE public.tokens 
ADD COLUMN IF NOT EXISTS form_url text,
ADD COLUMN IF NOT EXISTS exam_title text,
ADD COLUMN IF NOT EXISTS room text DEFAULT 'Ruang 1';

-- 2. Tambahkan kolom room ke tabel cheat_logs
ALTER TABLE public.cheat_logs 
ADD COLUMN IF NOT EXISTS room text;

-- 3. Beri hak akses lengkap ke anon dan authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tokens TO anon, authenticated;
GRANT ALL ON public.tokens TO service_role;

GRANT SELECT, INSERT, DELETE ON public.cheat_logs TO anon, authenticated;
GRANT ALL ON public.cheat_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sessions TO anon, authenticated;
GRANT ALL ON public.exam_sessions TO service_role;

-- 4. Aktifkan policy delete cheat_logs
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cheat_logs' AND policyname = 'cheat_logs_public_delete'
  ) THEN
    CREATE POLICY "cheat_logs_public_delete" ON public.cheat_logs FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';`;

  const copyMigrationSql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Sync with native fullscreen changes (e.g. user pressing ESC)
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsIncidentFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleIncidentFullscreen = () => {
    if (!isIncidentFullscreen) {
      setIsIncidentFullscreen(true);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      setIsIncidentFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

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
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.37);
      };
      play(880, 0);
      play(660, 0.18);
    } catch {
      /* audio tidak tersedia */
    }
  }, [getAudioContext]);

  // Handle Login with Room Account
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const enteredPin = pinInput.trim();

    // Check custom PIN for the selected room or Master PIN
    const storedPins = getStoredRoomPins();
    const expectedPin = storedPins[selectedLoginRoom] || MASTER_PIN;

    if (enteredPin === expectedPin || enteredPin === MASTER_PIN) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_authenticated", "true");
        sessionStorage.setItem("admin_account_room", selectedLoginRoom);
      }
      setIsAuthenticated(true);
      setActiveAccountRoom(selectedLoginRoom);
      setRoomFilter(selectedLoginRoom);
      setNewTokenRoom(selectedLoginRoom === "all" ? "Ruang 1" : selectedLoginRoom);
    } else {
      setPinError(`PIN untuk ${selectedLoginRoom === "all" ? "Admin Pusat" : selectedLoginRoom} tidak valid.`);
    }
  };

  const handleAdminLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_authenticated");
      sessionStorage.removeItem("admin_account_room");
    }
    setIsAuthenticated(false);
  };

  const saveRoomPin = (roomId: string, newPin: string) => {
    const clean = newPin.trim();
    if (clean.length < 4) {
      alert("PIN minimal 4 digit/karakter.");
      return;
    }
    const updated = { ...roomPins, [roomId]: clean };
    setRoomPins(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("exam_room_pins", JSON.stringify(updated));
    }
    setEditingRoomPin(null);
    setNewPinValue("");
  };

  // Load Tokens and merge room & form_url
  const loadTokens = useCallback(async () => {
    let result: TokenRow[] = [];
    const { data, error } = await supabase
      .from("tokens")
      .select("id, token_string, is_active, form_url, exam_title, room")
      .order("created_at", { ascending: false });

    if (error) {
      setSchemaNeedsMigration(true);
      const { data: fallbackData } = await supabase
        .from("tokens")
        .select("id, token_string, is_active")
        .order("created_at", { ascending: false });
      result = (fallbackData ?? []) as TokenRow[];
    } else {
      setSchemaNeedsMigration(false);
      result = (data ?? []) as TokenRow[];

      // Auto-sync local configs to Supabase if columns are available
      try {
        const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
        for (const t of result) {
          const localConf = stored[t.token_string];
          if (localConf && (!t.form_url || !t.room)) {
            void supabase
              .from("tokens")
              .update({
                form_url: localConf.form_url || t.form_url,
                exam_title: localConf.exam_title || t.exam_title,
                room: localConf.room || t.room || "Ruang 1",
              } as any)
              .eq("id", t.id);
          }
        }
      } catch {}
    }

    try {
      const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
      result = result.map((t) => ({
        ...t,
        form_url: t.form_url || stored[t.token_string]?.form_url,
        exam_title: t.exam_title || stored[t.token_string]?.exam_title,
        room: (t as any).room || stored[t.token_string]?.room || "Ruang 1",
      }));
    } catch {}

    // Filter out legacy GLOBAL token row if any
    setTokens(result.filter((t) => t.token_string !== "GLOBAL"));
  }, []);

  // Fetch cheat logs & sessions
  const fetchLogsAndSessions = useCallback(async () => {
    const { data: logsData } = await supabase
      .from("cheat_logs")
      .select("id, student_name, violation_type, timestamp")
      .order("timestamp", { ascending: false })
      .limit(80);

    if (logsData) {
      const hiddenIds = deletedLogIdsRef.current;
      setLogs(
        logsData
          .filter((l) => !hiddenIds.includes(l.id))
          .map((l) => {
            // Extract room if embedded in student_name like "Budi [Ruang 1]"
            const match = l.student_name.match(/\[(Ruang \d+|Semua Ruang)\]/i);
            return {
              ...l,
              room: match ? match[1] : (l as any).room || null,
            };
          }),
      );
    }

    const { data: sessionsData } = await supabase
      .from("exam_sessions")
      .select("id, student_name, token_used, status")
      .order("created_at", { ascending: false })
      .limit(80);

    if (sessionsData) {
      // Find room from matching token
      const storedConfigs = (() => {
        try {
          return JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
        } catch {
          return {};
        }
      })();

      setSessions(
        sessionsData.map((s) => ({
          ...s,
          room:
            (s as any).room ||
            storedConfigs[s.token_used]?.room ||
            tokens.find((t) => t.token_string === s.token_used)?.room ||
            "Ruang 1",
        })),
      );
    }
  }, [tokens]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadTokens(), fetchLogsAndSessions()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    void loadTokens();
    void fetchLogsAndSessions();

    const interval = setInterval(() => {
      void fetchLogsAndSessions();
    }, 3500);

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
            const match = newLog.student_name.match(/\[(Ruang \d+|Semua Ruang)\]/i);
            const enriched = {
              ...newLog,
              room: match ? match[1] : (newLog as any).room || null,
            };
            setLogs((prev) => [enriched, ...prev].slice(0, 100));
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

  const generateRandomToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const roomNum = newTokenRoom.replace(/\D/g, "") || "1";
    let res = `R${roomNum}-`;
    for (let i = 0; i < 5; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewToken(res);
  };

  // Add Token with REQUIRED Google Form Link & Room Assignment
  const addToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenFormError(null);

    const value = newToken.trim().toUpperCase();
    if (!value) return;

    let cleanFormUrl = newTokenFormUrl.trim();
    if (!cleanFormUrl) {
      setTokenFormError("Link Google Form wajib diisi karena setiap token harus memiliki lembar soal sendiri.");
      return;
    }

    if (cleanFormUrl.includes("forms.gle")) {
      setTokenFormError(
        "Link pendek forms.gle tidak bisa di-embed. Buka link tersebut di tab baru lalu salin URL lengkapnya (https://docs.google.com/forms/d/e/...)."
      );
      return;
    }

    // Auto fix common Google Form URL format issues
    if (cleanFormUrl.includes("/edit")) {
      cleanFormUrl = cleanFormUrl.replace(/\/edit.*$/, "/viewform?embedded=true");
    }
    if (cleanFormUrl.includes("/viewform") && !cleanFormUrl.includes("embedded=true")) {
      cleanFormUrl = cleanFormUrl.includes("?") ? `${cleanFormUrl}&embedded=true` : `${cleanFormUrl}?embedded=true`;
    }

    const titleVal = newExamTitle.trim() || `Ujian ${newTokenRoom}`;
    const roomVal = newTokenRoom || "Ruang 1";

    const payload: Record<string, unknown> = {
      token_string: value,
      is_active: true,
      form_url: cleanFormUrl,
      exam_title: titleVal,
      room: roomVal,
    };

    const { error } = await supabase.from("tokens").insert(payload as any);

    if (error) {
      // Fallback without room column if DB schema doesn't have it yet
      const { error: fbErr } = await supabase.from("tokens").insert({
        token_string: value,
        is_active: true,
        form_url: cleanFormUrl,
        exam_title: titleVal,
      } as any);

      if (fbErr) {
        // Fallback with basic fields
        await supabase.from("tokens").insert({
          token_string: value,
          is_active: true,
        });
        setSchemaNeedsMigration(true);
        setTokenFormError(
          "Peringatan: Kolom form_url belum ada di database Supabase (Error 400). Token tersimpan secara lokal di browser ini, namun siswa di perangkat/laptop lain belum bisa membuka soal sampai skrip migrasi SQL dijalankan di Supabase Dashboard.",
        );
      }
    }

    // Always store custom configuration locally as robust fallback
    try {
      const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
      stored[value] = {
        form_url: cleanFormUrl,
        exam_title: titleVal,
        room: roomVal,
      };
      localStorage.setItem("custom_token_configs", JSON.stringify(stored));
    } catch {}

    setNewToken("");
    setNewExamTitle("");
    setNewTokenFormUrl("");
    void loadTokens();
  };

  const deleteToken = async (id: string, tokenString: string) => {
    if (!window.confirm(`Hapus token "${tokenString}"? Peserta yang menggunakan token ini tidak dapat mengakses ujian.`)) return;
    await supabase.from("tokens").delete().eq("id", id);

    try {
      const stored = JSON.parse(localStorage.getItem("custom_token_configs") || "{}");
      delete stored[tokenString];
      localStorage.setItem("custom_token_configs", JSON.stringify(stored));
    } catch {}

    void loadTokens();
  };

  const toggleToken = async (row: TokenRow) => {
    await supabase.from("tokens").update({ is_active: !row.is_active }).eq("id", row.id);
    void loadTokens();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2500);
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
    if (!window.confirm("Apakah Anda yakin ingin menghapus SELURUH riwayat pelanggaran pada sesi ini?")) return;

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

  // Filter items by Room Filter
  const filteredTokens = tokens.filter((t) => {
    if (roomFilter === "all") return true;
    return t.room === roomFilter || t.room === "Semua Ruang";
  });

  const filteredSessions = sessions.filter((s) => {
    if (roomFilter === "all") return true;
    return s.room === roomFilter || s.room === "Semua Ruang";
  });

  const filteredLogs = logs.filter((log) => {
    // Match room filter
    if (roomFilter !== "all" && log.room && log.room !== roomFilter && log.room !== "Semua Ruang") {
      return false;
    }
    // Match search query
    if (!logSearchQuery) return true;
    const q = logSearchQuery.toLowerCase();
    return (
      log.student_name.toLowerCase().includes(q) ||
      log.violation_type.toLowerCase().includes(q) ||
      (log.room && log.room.toLowerCase().includes(q))
    );
  });

  const activeTokensCount = filteredTokens.filter((t) => t.is_active).length;

  // PIN LOGIN SCREEN WITH 10 ROOM ACCOUNTS
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-800 antialiased selection:bg-[#DFE9FD] selection:text-[#0437AC]">
        <div className="w-full border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="h-9 w-9 object-contain" />
              <div>
                <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
                  KONSOL PENGAWAS RUANG
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Sistem Pengawasan Terintegrasi 10 Ruangan
                </span>
              </div>
            </div>

            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#598DF8] transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali ke Portal Siswa</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm border border-slate-200">
                <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Masuk Pengawas Ujian
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Pilih ruangan yang Anda awasi (Ruang 1 s/d 10) lalu masukkan PIN pengawas.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <form onSubmit={handlePinSubmit} className="space-y-4">
                {/* Room Selector */}
                <div className="space-y-1.5">
                  <label htmlFor="room-select" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <DoorOpen className="h-3.5 w-3.5 text-[#598DF8]" />
                    Pilih Akun / Ruang Pengawas
                  </label>
                  <select
                    id="room-select"
                    value={selectedLoginRoom}
                    onChange={(e) => setSelectedLoginRoom(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#598DF8] focus:ring-3 focus:ring-[#DFE9FD] cursor-pointer"
                  >
                    <optgroup label="Pengawasan Khusus Ruang">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <option key={i + 1} value={`Ruang ${i + 1}`}>
                          Ruang {i + 1} (Pengawas Ruang {i + 1})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Pusat / Koordinator">
                      <option value="all">Semua Ruang (Admin Pusat / Koordinator)</option>
                    </optgroup>
                  </select>
                </div>

                {/* PIN Input */}
                <div className="space-y-1.5">
                  <label htmlFor="pin" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-[#598DF8]" />
                    PIN Pengawas {selectedLoginRoom === "all" ? "Pusat" : selectedLoginRoom}
                  </label>
                  <div className="relative">
                    <input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Masukkan PIN"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#598DF8] focus:ring-3 focus:ring-[#DFE9FD] pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {pinError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                    <span>{pinError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#598DF8] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#4379ee] active:bg-[#0437AC] focus:outline-none focus:ring-3 focus:ring-[#DFE9FD] cursor-pointer"
                >
                  Buka Dashboard {selectedLoginRoom === "all" ? "Semua Ruang" : selectedLoginRoom}
                </button>
              </form>

              {/* Quick default PIN tip */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Kredensial Default Ruangan:
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Semua akun dari <strong>Ruang 1 s/d 10</strong> memiliki default PIN:{" "}
                  <code className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    123456
                  </code>
                  . Anda dapat mengubah PIN tiap ruang di dalam dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white py-3 px-4 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} CBT Exam Guardian • Multi-Room Proctoring Console (Ruang 1 - 10)</p>
        </footer>
      </main>
    );
  }

  // AUTHENTICATED ADMIN DASHBOARD
  return (
    <main
      className="min-h-screen bg-slate-100 text-slate-800 flex flex-col antialiased selection:bg-[#DFE9FD] selection:text-[#0437AC]"
      onClick={getAudioContext}
      onKeyDown={getAudioContext}
    >
      {/* Top Proctor Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-9 w-9 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">
                  Konsol Pengawas Ujian
                </h1>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#DFE9FD]/80 px-2 py-0.5 text-[11px] font-bold text-[#0437AC] border border-[#598DF8]/30">
                  <DoorOpen className="h-3 w-3 text-[#598DF8]" />
                  {activeAccountRoom === "all" ? "Admin Pusat" : activeAccountRoom}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Mode 1 Token = 1 Google Form Soal • Pengawasan Multi-Ruangan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Indicator */}
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                live
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  live ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
              />
              <span className="hidden sm:inline">{live ? "Real-time Aktif" : "Menghubungkan..."}</span>
            </div>

            {/* 10 Rooms Accounts Modal Button */}
            <button
              onClick={() => setShowAccountsModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              title="Lihat & kelola 10 akun pengawas ruang"
            >
              <Settings2 className="h-3.5 w-3.5 text-[#598DF8]" />
              <span className="hidden md:inline">10 Akun Ruang</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                getAudioContext();
                setSoundOn((s) => !s);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                soundOn
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
              title={soundOn ? "Matikan suara peringatan" : "Aktifkan suara peringatan"}
            >
              {soundOn ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-[#598DF8]" />
                  <span className="hidden md:inline">Suara Aktif</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-amber-600" />
                  <span className="hidden md:inline">Suara Mati</span>
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              title="Perbarui data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#598DF8]" : ""}`} />
              <span className="hidden md:inline">Segarkan</span>
            </button>

            {/* Link to Student Portal */}
            <Link
              to="/"
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              title="Buka Portal Siswa di tab baru"
            >
              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden lg:inline">Portal Siswa</span>
            </Link>

            {/* Logout */}
            <button
              onClick={handleAdminLogout}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-600 hover:text-white transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 space-y-5">
        {/* Supabase Schema Warning Banner */}
        {schemaNeedsMigration && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm animate-in fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Perhatian: Kolom Database Supabase Belum Lengkap (Error 400)
                  </h4>
                  <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                    Database Supabase belum memiliki kolom <code>form_url</code>, <code>exam_title</code>, dan <code>room</code> sehingga link soal ujian tidak tersimpan ke cloud dan siswa di perangkat lain tidak bisa mengakses lembar soal ujian. 
                    Klik tombol di samping untuk menyalin skrip SQL, lalu jalankan di <strong>Supabase Dashboard &gt; SQL Editor</strong>.
                  </p>
                </div>
              </div>
              <button
                onClick={copyMigrationSql}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition cursor-pointer shadow-xs whitespace-nowrap"
              >
                {copiedSql ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedSql ? "Skrip SQL Tersalin!" : "Salin Skrip SQL Migrasi"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ROOM FILTER BAR: 10 Rooms Switcher */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#598DF8]" />
              Filter Tampilan Ruangan:
            </span>
            <span className="text-[11px] text-slate-500">
              Menampilkan data untuk: <strong className="text-slate-900">{roomFilter === "all" ? "Semua Ruang (1-10)" : roomFilter}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setRoomFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                roomFilter === "all"
                  ? "bg-[#598DF8] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua Ruang
            </button>

            {Array.from({ length: 10 }).map((_, i) => {
              const rName = `Ruang ${i + 1}`;
              const isSelected = roomFilter === rName;
              return (
                <button
                  key={rName}
                  onClick={() => setRoomFilter(rName)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    isSelected
                      ? "bg-[#598DF8] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {rName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Metric KPI Overview Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Peserta di {roomFilter === "all" ? "Semua Ruang" : roomFilter}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DFE9FD]/70 text-[#0437AC]">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {filteredSessions.length}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Siswa aktif</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Pelanggaran di {roomFilter === "all" ? "Semua Ruang" : roomFilter}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-red-600">
              {filteredLogs.length}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Insiden tercatat</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Token {roomFilter === "all" ? "Tersedia" : roomFilter}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <KeyRound className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {activeTokensCount}{" "}
              <span className="text-xs font-normal text-slate-400">/ {filteredTokens.length}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">1 Token = 1 GForm</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Status Akun Anda</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DFE9FD]/70 text-[#0437AC]">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-base font-bold text-slate-900">
                {activeAccountRoom === "all" ? "Admin Pusat" : activeAccountRoom}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">Pengawasan Aktif</p>
          </div>
        </div>

        {/* 2-Column Responsive Workspace */}
        <div className="grid gap-5 lg:grid-cols-[430px_1fr]">
          {/* LEFT COLUMN: Token Manager (Per Token = Per GForm) + Active Sessions */}
          <section className="space-y-5">
            {/* Token & Exam Management (Top card is gone as requested!) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-[#598DF8]" />
                    Kelola Token & Soal Ujian (Per Token = Per GForm)
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Setiap token memiliki Google Form soal masing-masing dan dialokasikan untuk ruangan tertentu.
                </p>
              </div>

              {/* Create Token Box */}
              <form onSubmit={addToken} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Kode Token Ujian:
                    </label>
                    <input
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value.toUpperCase())}
                      placeholder="CTH: R1-MATH01"
                      maxLength={32}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-900 uppercase placeholder:text-slate-400 outline-none focus:border-[#598DF8] focus:ring-2 focus:ring-[#DFE9FD]"
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={generateRandomToken}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition whitespace-nowrap cursor-pointer h-[34px]"
                      title="Generate token acak untuk ruang ini"
                    >
                      Acak
                    </button>
                  </div>
                </div>

                {/* Exam Title */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Nama Ujian / Mata Pelajaran:
                  </label>
                  <input
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="Contoh: Penilaian Akhir Matematika Kelas 8"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#598DF8] focus:ring-2 focus:ring-[#DFE9FD]"
                    required
                  />
                </div>

                {/* Target Room */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Peruntukan Ruang Ujian:
                  </label>
                  <select
                    value={newTokenRoom}
                    onChange={(e) => setNewTokenRoom(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-[#598DF8] focus:ring-2 focus:ring-[#DFE9FD] cursor-pointer"
                  >
                    {Array.from({ length: 10 }).map((_, i) => (
                      <option key={i + 1} value={`Ruang ${i + 1}`}>
                        Ruang {i + 1}
                      </option>
                    ))}
                    <option value="Semua Ruang">Semua Ruang (Bebas untuk Semua Ruangan)</option>
                  </select>
                </div>

                {/* Google Form URL (REQUIRED!) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Link Google Form Soal Ujian <span className="text-red-500 font-bold">*Wajib</span>:
                  </label>
                  <input
                    value={newTokenFormUrl}
                    onChange={(e) => setNewTokenFormUrl(e.target.value)}
                    placeholder="https://docs.google.com/forms/d/e/.../viewform?embedded=true"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#598DF8] focus:ring-2 focus:ring-[#DFE9FD]"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Pastikan memakai link lengkap <code>/viewform?embedded=true</code> (Bukan forms.gle).
                  </p>
                </div>

                {tokenFormError && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 mt-0.5" />
                    <span>{tokenFormError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#598DF8] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#4379ee] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambahkan Token & Link Soal Ujian</span>
                </button>
              </form>

              {/* Tokens List for active room filter */}
              <div className="space-y-2.5 max-h-84 overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Daftar Token ({filteredTokens.length})</span>
                  <span>Filter: {roomFilter}</span>
                </div>

                {filteredTokens.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Belum ada token ujian untuk {roomFilter}. Buat token baru di atas.
                  </div>
                ) : (
                  filteredTokens.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2 hover:border-slate-300 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-bold tracking-wider text-slate-900">
                            {t.token_string}
                          </span>
                          <span className="rounded-md bg-[#DFE9FD] px-2 py-0.5 text-[10px] font-bold text-[#0437AC]">
                            {t.room || "Ruang 1"}
                          </span>
                          <button
                            onClick={() => copyToClipboard(t.token_string)}
                            className="rounded p-1 text-slate-400 hover:text-[#598DF8] transition"
                            title="Salin token"
                          >
                            {copiedToken === t.token_string ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void toggleToken(t)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition cursor-pointer ${
                              t.is_active
                                ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {t.is_active ? "Aktif" : "Nonaktif"}
                          </button>

                          <button
                            onClick={() => void deleteToken(t.id, t.token_string)}
                            className="rounded p-1 text-slate-400 hover:text-red-600 transition"
                            title="Hapus token"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {t.exam_title && (
                        <p className="text-xs font-semibold text-slate-800">{t.exam_title}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                        {t.form_url ? (
                          <span className="text-emerald-700 font-medium flex items-center gap-1 truncate max-w-[280px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Form: {t.form_url.slice(0, 36)}...
                          </span>
                        ) : (
                          <span className="text-red-600 font-medium">Belum ada Link Form</span>
                        )}

                        {t.form_url && (
                          <a
                            href={t.form_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#598DF8] hover:underline flex items-center gap-1 font-semibold text-[10px]"
                          >
                            <span>Tes Form</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Sessions */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-[#598DF8]" />
                  Peserta Masuk di {roomFilter === "all" ? "Semua Ruang" : roomFilter} ({filteredSessions.length})
                </h2>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {filteredSessions.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Belum ada siswa yang masuk ke {roomFilter}.
                  </p>
                ) : (
                  filteredSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DFE9FD] font-bold text-[10px] text-[#0437AC]">
                          {s.student_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 truncate max-w-[150px]">
                          {s.student_name}
                        </span>
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[9px] font-bold text-slate-700">
                          {s.room || "Ruang 1"}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#0437AC] bg-[#DFE9FD]/60 px-1.5 py-0.5 rounded border border-[#598DF8]/30">
                        {s.token_used}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Live Incident Stream filtered by Room */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Radio className="h-4 w-4 text-red-500 animate-pulse" />
                  Live Incident Stream ({roomFilter === "all" ? "Semua Ruangan" : roomFilter})
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau pelanggaran siswa di {roomFilter === "all" ? "10 Ruangan Ujian" : roomFilter} secara seketika.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-red-700">
                  {filteredLogs.length} Insiden
                </span>

                {/* Layar Penuh Button */}
                <button
                  onClick={toggleIncidentFullscreen}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                  title="Tampilkan Live Incident Stream dalam mode layar penuh"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-[#598DF8]" />
                  <span>Layar Penuh</span>
                </button>

                {filteredLogs.length > 0 && (
                  <button
                    onClick={() => void clearAllLogs()}
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus Semua</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter / Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Cari nama peserta, ruang, atau jenis pelanggaran..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#598DF8] focus:bg-white focus:ring-2 focus:ring-[#DFE9FD]"
              />
              {logSearchQuery && (
                <button
                  onClick={() => setLogSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Logs List Feed */}
            <div className="flex-1 space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-200 rounded-xl">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-3">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Ruang Ujian Terkendali ({roomFilter})
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm">
                    {logSearchQuery
                      ? "Tidak ditemukan catatan pelanggaran yang cocok dengan pencarian Anda."
                      : `Belum ada pelanggaran terdeteksi di ${roomFilter}. Semua peserta tertib mengikuti aturan.`}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log, i) => {
                  const cleanStudentName = log.student_name.replace(/\[.*?\]/g, "").trim();
                  return (
                    <article
                      key={log.id}
                      className={`rounded-xl border p-3.5 shadow-2xs transition animate-in fade-in ${
                        i === 0
                          ? "border-red-300 bg-red-50/40 ring-2 ring-red-100"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 font-bold text-xs shrink-0 mt-0.5">
                            {cleanStudentName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900">
                                {cleanStudentName}
                              </h3>
                              {log.room && (
                                <span className="rounded bg-[#DFE9FD] px-1.5 py-0.5 text-[10px] font-bold text-[#0437AC] border border-[#598DF8]/30">
                                  {log.room}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                <ShieldAlert className="h-3 w-3" />
                                {log.violation_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatTime(log.timestamp)}
                          </span>
                          <button
                            onClick={() => void deleteLog(log.id)}
                            className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Hapus catatan ini"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {/* MODAL: DAFTAR 10 AKUN PENGAWAS RUANG & PENGATURAN PIN */}
      {showAccountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-[#598DF8]" />
                <h3 className="text-base font-bold text-slate-900">
                  Daftar 10 Akun Pengawas Ruang (Ruang 1 s/d 10)
                </h3>
              </div>
              <button
                onClick={() => setShowAccountsModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Masing-masing pengawas ruangan dapat masuk secara mandiri memilih ruangannya di halaman login. Anda dapat melihat dan menyesuaikan PIN tiap ruang di bawah ini:
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {PROCTOR_ROOMS.map((room) => {
                const currentPin = roomPins[room.id] || MASTER_PIN;
                const isEditing = editingRoomPin === room.id;

                return (
                  <div
                    key={room.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{room.name}</span>
                        <span className="text-[11px] text-slate-500 font-medium">({room.label})</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Kredensial Login: Masuk sebagai <strong>{room.name}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newPinValue}
                            onChange={(e) => setNewPinValue(e.target.value)}
                            placeholder="PIN Baru"
                            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRoomPin(room.id, newPinValue)}
                            className="rounded bg-[#598DF8] px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingRoomPin(null)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-white px-2 py-1 rounded border border-slate-200 font-semibold text-slate-800">
                            PIN: {currentPin}
                          </span>
                          <button
                            onClick={() => {
                              setEditingRoomPin(room.id);
                              setNewPinValue(currentPin);
                            }}
                            className="text-xs text-[#598DF8] hover:underline font-semibold"
                          >
                            Ubah PIN
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowAccountsModal(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMMERSIVE FULLSCREEN LIVE INCIDENT STREAM */}
      {isIncidentFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col p-4 sm:p-6 overflow-hidden animate-in fade-in duration-200">
          {/* Fullscreen Header */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                      <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                      Live Incident Stream — Mode Layar Penuh
                    </h2>
                    <span className="rounded-md bg-[#DFE9FD] px-2.5 py-0.5 text-xs font-bold text-[#0437AC] border border-[#598DF8]/30">
                      {roomFilter === "all" ? "Semua Ruang" : roomFilter}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pengawasan Real-Time Skala Penuh • Pembaruan Langsung Tanpa Refresh
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-red-100 border border-red-300 px-3 py-1 text-xs font-bold text-red-700">
                  {filteredLogs.length} Insiden Terdeteksi
                </span>

                {/* Sound Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    getAudioContext();
                    setSoundOn((s) => !s);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                    soundOn
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {soundOn ? (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-[#598DF8]" />
                      <span>Suara Aktif</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-amber-600" />
                      <span>Suara Mati</span>
                    </>
                  )}
                </button>

                {filteredLogs.length > 0 && (
                  <button
                    onClick={() => void clearAllLogs()}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus Semua</span>
                  </button>
                )}

                {/* Exit Fullscreen Button */}
                <button
                  onClick={toggleIncidentFullscreen}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Keluar Layar Penuh</span>
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">(ESC)</span>
                </button>
              </div>
            </div>

            {/* Room Filters & Search Bar in Fullscreen */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setRoomFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    roomFilter === "all"
                      ? "bg-[#598DF8] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Semua Ruang
                </button>
                {Array.from({ length: 10 }).map((_, i) => {
                  const rName = `Ruang ${i + 1}`;
                  const isSelected = roomFilter === rName;
                  return (
                    <button
                      key={rName}
                      onClick={() => setRoomFilter(rName)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        isSelected
                          ? "bg-[#598DF8] text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {rName}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Cari peserta / jenis pelanggaran..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#598DF8] focus:bg-white focus:ring-2 focus:ring-[#DFE9FD]"
                />
              </div>
            </div>
          </div>

          {/* Fullscreen Incident Cards Stream */}
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center h-full">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 border border-emerald-200">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Ruang Ujian Terkendali ({roomFilter})
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-md">
                  {logSearchQuery
                    ? "Tidak ditemukan catatan pelanggaran yang cocok dengan pencarian Anda."
                    : `Belum ada pelanggaran terdeteksi di ${roomFilter}. Semua peserta tertib mengikuti aturan.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredLogs.map((log, i) => {
                  const cleanStudentName = log.student_name.replace(/\[.*?\]/g, "").trim();
                  return (
                    <article
                      key={log.id}
                      className={`rounded-xl border p-4 shadow-2xs transition animate-in fade-in flex flex-col justify-between ${
                        i === 0
                          ? "border-red-300 bg-red-50/50 ring-2 ring-red-100"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700 font-bold text-sm shrink-0">
                            {cleanStudentName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900">
                                {cleanStudentName}
                              </h3>
                              {log.room && (
                                <span className="rounded bg-[#DFE9FD] px-1.5 py-0.5 text-[10px] font-bold text-[#0437AC] border border-[#598DF8]/30">
                                  {log.room}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {log.violation_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => void deleteLog(log.id)}
                          className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="Hapus catatan ini"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(log.timestamp)}
                        </span>
                        <span className="text-[10px] text-red-600 font-sans font-semibold">
                          Terdeteksi
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}