import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// ── Icons ──────────────────────────────────────────────────────
const BackIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
);
const FileIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
);
const CheckCircleIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);
const XCircleIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const CopyIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);
const WarningIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

// ── Status Badge ───────────────────────────────────────────────
const STATUS_MAP = {
    queued:          { label: "Antrian",        cls: "bg-blue-50 text-blue-600 border-blue-200",      dot: "bg-blue-400" },
    processing:      { label: "Diproses",       cls: "bg-indigo-50 text-indigo-700 border-indigo-200",dot: "bg-indigo-500 animate-pulse" },
    need_validation: { label: "Perlu Validasi", cls: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
    completed:       { label: "Selesai",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    failed:          { label: "Gagal",          cls: "bg-red-50 text-red-600 border-red-200",         dot: "bg-red-500" },
};
function StatusBadge({ status }) {
    const s = STATUS_MAP[status] ?? STATUS_MAP.queued;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            {s.label}
        </span>
    );
}

// ── Confidence Bar ─────────────────────────────────────────────
function ConfidenceBar({ score }) {
    if (score === null || score === undefined) return <span className="text-xs text-slate-300">—</span>;
    const pct = Math.round(score);
    const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
    const textColor = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-600";
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-sm font-bold ${textColor}`}>{pct}%</span>
        </div>
    );
}

// ── Status cell untuk kolom status tabel ───────────────────────
const STATUS_OK_VARIANTS  = new Set(["ok", "yes", "ya", "baik", "normal"]);
const STATUS_NOK_VARIANTS = new Set(["nok", "no", "tidak", "rusak", "abnormal"]);

function StatusCell({ value }) {
    if (!value || !value.trim()) {
        return <span className="text-slate-300 select-none">—</span>;
    }
    const normalized = value.trim().toLowerCase();
    if (STATUS_OK_VARIANTS.has(normalized)) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <CheckCircleIcon /> {value}
            </span>
        );
    }
    if (STATUS_NOK_VARIANTS.has(normalized)) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                <XCircleIcon /> {value}
            </span>
        );
    }
    // Nilai tidak dikenal → kemungkinan OCR salah baca (mis. "informal" padahal "normal")
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <WarningIcon /> {value}
        </span>
    );
}

// ── Confidence thresholds ─────────────────────────────────────
const CONF_LOW  = 50;   // < 50  → merah
const CONF_MED  = 75;   // < 75  → kuning

// ── Peringatan kualitas OCR per halaman ───────────────────────
function ConfidenceAlert({ score }) {
    if (score == null || score >= 80) return null;
    const isLow = score < 60;
    return (
        <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${
            isLow
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
            <span className={`flex-shrink-0 mt-0.5 ${isLow ? "text-red-500" : "text-amber-500"}`}>
                <WarningIcon />
            </span>
            <div>
                <p className="font-semibold">
                    {isLow
                        ? "Kualitas OCR Rendah — Perlu Validasi Manual"
                        : "Kualitas OCR Kurang Meyakinkan"}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                    {isLow
                        ? `Confidence hanya ${score}%. Banyak teks kemungkinan terbaca salah. Admin harap periksa seluruh data sebelum digunakan.`
                        : `Confidence ${score}%. Beberapa sel mungkin perlu diverifikasi — ditandai dengan warna pada tabel di bawah.`}
                </p>
            </div>
        </div>
    );
}

// ── Template Match Badge ──────────────────────────────────────
function TemplateMatchBadge({ score, status }) {
    if (score == null && !status) return null;
    const isFailed = status === "failed" || status === "unknown"
                  || (score != null && score < 60);
    const isLow    = !isFailed && (status === "low_confidence"
                  || (score != null && score >= 60 && score < 80));
    if (isFailed) return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
            <XCircleIcon /> Tidak Dikenali
        </span>
    );
    if (isLow) return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <WarningIcon /> Low Confidence{score != null ? ` (${Math.round(score)}%)` : ""}
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <CheckCircleIcon /> Matched{score != null ? ` (${Math.round(score)}%)` : ""}
        </span>
    );
}

// ── Template Match Warning Box ─────────────────────────────────
function TemplateMatchWarning({ score, status }) {
    const isFailed = status === "failed" || status === "unknown"
                  || (score != null && score < 60);
    const isLow    = !isFailed && (status === "low_confidence"
                  || (score != null && score >= 60 && score < 80));
    if (!isFailed && !isLow) return null;
    return (
        <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${
            isFailed ? "bg-red-50 border-red-200 text-red-700"
                     : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
            <span className={`flex-shrink-0 mt-0.5 ${isFailed ? "text-red-500" : "text-amber-500"}`}>
                <WarningIcon />
            </span>
            <div>
                <p className="font-semibold">
                    {isFailed ? "Template tidak berhasil dideteksi otomatis."
                              : "Sistem tidak yakin template ini benar."}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                    {isFailed ? "Pilih template secara manual."
                              : "Mohon verifikasi sebelum menyimpan hasil."}
                </p>
            </div>
        </div>
    );
}

// ── Tabel Checklist ────────────────────────────────────────────
const KNOWN_COLUMN_LABELS = {
    no:           "No",
    descriptions: "Deskripsi",
    result:       "Hasil",
    standard:     "Standar",
    status:       "Status",
    status_ok:    "OK",
    status_nok:   "NOK",
    remarks:      "Keterangan",
    nilai:        "Nilai",
    keterangan:   "Keterangan",
};

function colLabel(key) {
    return KNOWN_COLUMN_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const COL_WIDTH = {
    no:           "w-12 min-w-[3rem]",
    descriptions: "min-w-[200px]",
    result:       "w-28 min-w-[7rem]",
    standard:     "w-36 min-w-[9rem]",
    status:       "w-24 min-w-[6rem] text-center",
    status_ok:    "w-16 min-w-[4rem] text-center",
    status_nok:   "w-16 min-w-[4rem] text-center",
};

// ── Deteksi kolom secara heuristik ────────────────────────────
// Tidak hardcode nama kolom agar bekerja dengan template apapun.

// Kolom "nomor" biasanya: pendek, berisi angka/huruf urutan (1., a., dll)
const NO_KEY_HINTS    = new Set(["no", "nomor", "number", "num", "#", "id"]);
// Kolom "deskripsi" biasanya: nama panjang, teks utama baris
const DESC_KEY_HINTS  = new Set(["descriptions", "description", "desc", "deskripsi", "item", "nama", "uraian", "keterangan"]);
// Kolom "status" biasanya: menentukan ok/nok
const STATUS_KEY_HINTS = new Set(["status", "status_ok", "status_nok", "ok", "nok", "result_ok", "result_nok", "kondisi"]);

function detectColumns(colKeys) {
    const noKey   = colKeys.find(k => NO_KEY_HINTS.has(k.toLowerCase()))
                 ?? (colKeys.length > 0 ? colKeys[0] : null);
    const descKey = colKeys.find(k => DESC_KEY_HINTS.has(k.toLowerCase()))
                 ?? colKeys.find(k => k !== noKey)
                 ?? null;
    return { noKey, descKey };
}

function isRowSectionHeader(row, noKey, otherKeys) {
    if (!noKey) return false;
    const hasNo    = (row[noKey] ?? "").trim() !== "";
    const allEmpty = otherKeys.filter(k => k !== noKey)
                              .every(k => !(row[k] ?? "").trim());
    return hasNo && allEmpty;
}

function isStatusKey(key) {
    return STATUS_KEY_HINTS.has(key.toLowerCase());
}

function ChecklistTable({ rows }) {
    if (!rows?.length) return null;

    const colKeys = Object.keys(rows[0]).filter(k => !k.startsWith("_"));
    const { noKey, descKey } = detectColumns(colKeys);
    const hasNoCol   = !!noKey;
    const hasDescCol = !!descKey;
    const otherKeys  = colKeys.filter(k => k !== noKey && k !== descKey);

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="bg-slate-700 text-white">
                        {hasNoCol && (
                            <th className={`px-3 py-2.5 text-left text-xs font-semibold tracking-wide border-r border-slate-600 ${COL_WIDTH[noKey] ?? COL_WIDTH.no}`}>
                                {colLabel(noKey)}
                            </th>
                        )}
                        {hasDescCol && (
                            <th className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide border-r border-slate-600 min-w-[200px]">
                                {colLabel(descKey)}
                            </th>
                        )}
                        {otherKeys.map(key => (
                            <th key={key} className={`px-3 py-2.5 text-left text-xs font-semibold tracking-wide border-r border-slate-600 last:border-r-0 ${COL_WIDTH[key] ?? "min-w-[6rem]"}`}>
                                {colLabel(key)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => {
                        const isSectionHeader = isRowSectionHeader(row, noKey, colKeys);
                        const desc = descKey ? (row[descKey] ?? "").trim() : "";
                        const isSubItem = !isSectionHeader && hasNoCol && !(row[noKey] ?? "").trim();

                        if (isSectionHeader) {
                            return (
                                <tr key={idx} className="bg-slate-100">
                                    {hasNoCol && (
                                        <td className="px-3 py-2 border-r border-slate-200 text-xs font-bold text-slate-600">
                                            {(row[noKey] ?? "").trim()}
                                        </td>
                                    )}
                                    <td
                                        colSpan={colKeys.filter(k => k !== noKey).length}
                                        className="px-4 py-2 font-semibold text-slate-700 text-sm"
                                    >
                                        {desc}
                                    </td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={idx} className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-indigo-50/30`}>
                                {hasNoCol && (
                                    <td className="px-3 py-2.5 border-r border-slate-100 text-xs text-slate-400 align-top pt-3">
                                        {(row[noKey] ?? "").trim() || ""}
                                    </td>
                                )}
                                {hasDescCol && (
                                    <td className="px-4 py-2.5 border-r border-slate-100 align-top">
                                        <span className={`text-slate-700 text-sm leading-snug ${isSubItem ? "pl-3 block" : ""}`}>
                                            {desc || <span className="text-slate-300 italic text-xs">—</span>}
                                        </span>
                                    </td>
                                )}
                                {otherKeys.map(key => {
                                    const val  = (row[key] ?? "").trim();
                                    const conf = row[`_conf_${key}`];
                                    const wasAttempted = row[`_ocr_source_${key}`] != null;
                                    const isEmpty = val === "" && wasAttempted;
                                    const isLowConf = conf != null && conf < CONF_LOW;
                                    const isMedConf = conf != null && conf >= CONF_LOW && conf < CONF_MED;
                                    const cellBg = isLowConf
                                        ? "bg-red-50/60"
                                        : (isMedConf || isEmpty)
                                            ? "bg-amber-50/60"
                                            : "";
                                    return (
                                        <td key={key} className={`px-3 py-2.5 border-r border-slate-100 last:border-r-0 align-top ${COL_WIDTH[key] ?? ""} ${cellBg}`}>
                                            <div className="flex items-start gap-1">
                                                <div className="flex-1">
                                                    {isStatusKey(key)
                                                        ? <StatusCell value={val} />
                                                        : val
                                                            ? <span className="text-slate-700 text-xs leading-snug">{val}</span>
                                                            : <span className="text-slate-300 select-none text-xs">—</span>
                                                    }
                                                </div>
                                                {(isLowConf || isMedConf || isEmpty) && (
                                                    <span
                                                        title={
                                                            isEmpty
                                                                ? "Nilai tidak terdeteksi — perlu diperiksa"
                                                                : `Confidence: ${conf?.toFixed(0)}% — perlu diperiksa`
                                                        }
                                                        className={`flex-shrink-0 mt-0.5 ${isLowConf ? "text-red-400" : "text-amber-400"}`}
                                                    >
                                                        <WarningIcon />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Section Fields (key-value pairs) ──────────────────────────
function FieldGrid({ fields }) {
    if (!fields) return null;

    const entries = Object.entries(fields).filter(([k, v]) => {
        if (k === "copyright") return false;
        if (Array.isArray(v)) return v.length > 0 && typeof v[0] === "string";
        if (typeof v === "object" && v !== null) return Object.keys(v).length > 0;
        return typeof v === "string";
    });

    if (!entries.length) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {entries.map(([key, value]) => {
                const label   = colLabel(key);
                const display = Array.isArray(value) ? value.join(", ") : String(value);
                const isEmpty = !display.trim();
                return (
                    <div key={key} className={`flex flex-col gap-0.5 p-3 rounded-lg border ${
                        isEmpty ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100"
                    }`}>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</span>
                            {isEmpty && (
                                <span title="Field tidak terdeteksi — perlu diperiksa" className="text-amber-400">
                                    <WarningIcon />
                                </span>
                            )}
                        </div>
                        <span className="text-sm font-medium leading-snug">
                            {isEmpty
                                ? <span className="text-slate-400 font-normal">-</span>
                                : <span className="text-slate-800">{display}</span>
                            }
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function flattenFields(fields, fieldOrder = []) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if (k === "copyright" || k === "field_order") continue;
        if (Array.isArray(v)) {
            if (v.length > 0 && typeof v[0] === "string")
                out[k] = v.join(", ");
        } else if (v !== null && typeof v === "object") {
            for (const [ik, iv] of Object.entries(v)) {
                out[ik] = iv == null ? "" : (typeof iv === "string" ? iv : String(iv));
            }
        } else if (typeof v === "string" || v === null) {
            out[k] = v ?? "";
        }
    }

    if (!fieldOrder.length) return out;

    const ordered = {};
    for (const key of fieldOrder) {
        if (key in out) ordered[key] = out[key];
    }
    for (const key of Object.keys(out)) {
        if (!(key in ordered)) ordered[key] = out[key];
    }
    return ordered;
}

// ── Raw JSON block ─────────────────────────────────────────────
function JsonBlock({ data }) {
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(data, null, 2);
    return (
        <div className="relative">
            <button
                onClick={() => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition z-10"
            >
                <CopyIcon /> {copied ? "Tersalin!" : "Copy"}
            </button>
            <pre className="bg-slate-900 text-slate-100 rounded-xl p-5 overflow-auto text-xs leading-relaxed font-mono max-h-[70vh]">
                <code>{json}</code>
            </pre>
        </div>
    );
}

// ── Stat Pill ──────────────────────────────────────────────────
function StatPill({ label, value, color }) {
    const colors = {
        green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
        red:    "bg-red-50 text-red-600 border-red-200",
        amber:  "bg-amber-50 text-amber-700 border-amber-200",
        slate:  "bg-slate-50 text-slate-600 border-slate-200",
    };
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${colors[color] ?? colors.slate}`}>
            <span className="text-[10px] font-normal opacity-70">{label}</span>
            <span className="font-bold">{value ?? "—"}</span>
        </div>
    );
}

// ── Halaman Utama ──────────────────────────────────────────────
export default function DocumentDetail({ document }) {
    const [activeTab, setActiveTab] = useState("dokumen");

    const data = document.extracted_data ?? {};
    const pages = data.pages ?? [];
    const hasData = pages.length > 0;

    return (
        <AuthenticatedLayout>
            <Head title={`Detail #${document.id} — ${document.original_name}`} />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">

                {/* ── Breadcrumb ── */}
                <Link
                    href="/upload-dokumen"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition font-medium"
                >
                    <BackIcon /> Kembali ke Upload
                </Link>

                {/* ── Info Card ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 flex items-start gap-4">
                        <div className="flex-shrink-0 w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center text-red-400">
                            <FileIcon />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-base font-semibold text-slate-800 truncate">{document.original_name}</h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                ID #{document.id}
                                {document.uploaded_at && <> · Upload {document.uploaded_at}</>}
                                {document.processing_ended_at && <> · Selesai {document.processing_ended_at}</>}
                            </p>
                        </div>
                        <StatusBadge status={document.status} />
                    </div>

                    <div className="px-6 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-4">
                        <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Template</p>
                            <p className="text-sm font-medium text-slate-700 leading-snug">
                                {document.template_name ?? <span className="text-slate-300 italic font-normal">Tidak terdeteksi</span>}
                            </p>
                            <div className="mt-1.5">
                                <TemplateMatchBadge score={document.template_match_score} status={pages[0]?.status} />
                            </div>
                            {pages[0]?.doc_version && (
                                <p className="mt-1 text-[10px] text-slate-400">
                                    Versi terdeteksi: {pages[0].doc_version}
                                </p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">
                                Kualitas Baca OCR
                                <span className="ml-1 text-[9px] font-normal text-slate-300 normal-case tracking-normal">
                                    (rata-rata per kata)
                                </span>
                            </p>
                            <ConfidenceBar score={document.confidence_score} />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Halaman</p>
                            <p className="text-sm font-medium text-slate-700">{data.total_pages ?? pages.length ?? "—"}</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Kualitas Ekstraksi</p>
                            <div className="flex flex-wrap gap-1.5">
                                <StatPill label="TP" value={document.tp_count} color="green" />
                                <StatPill label="FP" value={document.fp_count} color="amber" />
                                <StatPill label="FN" value={document.fn_count} color="red" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                    {[
                        { key: "dokumen", label: "Tampilan Dokumen" },
                        { key: "json",    label: "Raw JSON" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === tab.key
                                    ? "bg-white text-slate-800 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Tab: Tampilan Dokumen ── */}
                {activeTab === "dokumen" && (
                    <div className="space-y-6">
                        {!hasData ? (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-slate-500">Data ekstraksi belum tersedia</p>
                                <p className="text-xs text-slate-400 text-center max-w-xs">
                                    Dokumen masih diproses atau gagal diekstrak.
                                </p>
                            </div>
                        ) : (
                            pages.map((page, pi) => {
                                const fields = page.fields ?? {};
                                const tables = page.tables ?? {};
                                const copyright = fields.copyright ?? null;
                                const fieldOrder = Array.isArray(fields.field_order) ? fields.field_order : [];
                                const flatFields = flattenFields(fields, fieldOrder);
                                const tableOrder = Array.isArray(fields.table_order) ? fields.table_order : null;
                                const tableEntries = tableOrder
                                    ? tableOrder.filter(k => tables[k]).map(k => [k, tables[k]])
                                    : Object.entries(tables);

                                return (
                                    <div key={pi} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        {/* ── Document Header ── */}
                                        <div className="bg-slate-800 px-6 py-4 flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-1">
                                                    {pages.length > 1 ? `Halaman ${page.page}` : "Formulir PM"}
                                                </p>
                                                <h2 className="text-base font-bold text-white leading-snug">
                                                    {page.template_name ?? document.template_name ?? "—"}
                                                </h2>
                                                <div className="mt-1.5">
                                                    <TemplateMatchBadge score={page.template_match_score} status={page.status} />
                                                </div>
                                                {page.header && (
                                                    <p className="text-xs text-slate-400 mt-1">{page.header}</p>
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 text-right space-y-2">
                                                <div>
                                                    <p className="text-[9px] text-slate-400 uppercase tracking-wide">Kualitas Baca</p>
                                                    <p className={`text-base font-bold ${
                                                        (page.confidence ?? 0) >= 80 ? "text-emerald-400" :
                                                        (page.confidence ?? 0) >= 60 ? "text-amber-400" : "text-red-400"
                                                    }`}>
                                                        {page.confidence != null ? `${page.confidence}%` : "—"}
                                                    </p>
                                                </div>
                                                {page.template_match_score != null && (
                                                    <div>
                                                        <p className="text-[9px] text-slate-500 uppercase tracking-wide">Cocok Template</p>
                                                        <p className="text-sm font-semibold text-slate-400">
                                                            {page.template_match_score}%
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-6 space-y-6">
                                            {/* ── Confidence Alert ── */}
                                            <ConfidenceAlert score={page.confidence} />
                                            <TemplateMatchWarning score={page.template_match_score} status={page.status} />

                                            {/* ── Fields Section ── */}
                                            {Object.keys(flatFields).length > 0 && (
                                                <div>
                                                    <SectionLabel>Informasi Dokumen</SectionLabel>
                                                    <FieldGrid fields={flatFields} />
                                                </div>
                                            )}

                                            {/* ── Tables ── */}
                                            {tableEntries.map(([tableKey, rows]) => (
                                                Array.isArray(rows) && rows.length > 0 && (
                                                    <div key={tableKey}>
                                                        <SectionLabel>{colLabel(tableKey)}</SectionLabel>
                                                        <ChecklistTable rows={rows} />
                                                    </div>
                                                )
                                            ))}

                                            {/* ── Copyright footer ── */}
                                            {copyright && (
                                                <p className="text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
                                                    {copyright}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ── Tab: Raw JSON ── */}
                {activeTab === "json" && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-sm font-semibold text-slate-700">Raw Extracted Data</h2>
                            <p className="text-xs text-slate-400 mt-0.5">JSON lengkap hasil ekstraksi OCR</p>
                        </div>
                        <div className="p-6">
                            <JsonBlock data={document.extracted_data} />
                        </div>
                    </div>
                )}

            </div>
        </AuthenticatedLayout>
    );
}

// ── Section Label helper ───────────────────────────────────────
function SectionLabel({ children }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div className="w-0.5 h-4 bg-indigo-500 rounded-full" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{children}</h3>
        </div>
    );
}
