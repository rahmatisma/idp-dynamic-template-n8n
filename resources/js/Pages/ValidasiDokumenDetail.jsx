import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// ── Icons ──────────────────────────────────────────────────────
const BackIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
);
const CheckIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);
const XIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const WarningIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

// ── Confidence thresholds ─────────────────────────────────────
const CONF_LOW = 50;
const CONF_MED = 75;

// ── Helpers ────────────────────────────────────────────────────
const KNOWN_LABELS = {
    no: "No", descriptions: "Deskripsi", result: "Hasil",
    standard: "Standar", status: "Status", remarks: "Keterangan",
};
const colLabel = (k) => KNOWN_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const STATUS_OK  = new Set(["ok", "yes", "ya", "baik", "normal"]);
const STATUS_NOK = new Set(["nok", "no", "tidak", "rusak", "abnormal"]);
const STATUS_KEYS = new Set(["status", "status_ok", "status_nok", "ok", "nok", "result_ok", "result_nok", "kondisi"]);

function StatusCell({ value }) {
    if (!value?.trim()) return <span className="text-slate-300">—</span>;
    const n = value.trim().toLowerCase();
    if (STATUS_OK.has(n))  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">✓ {value}</span>;
    if (STATUS_NOK.has(n)) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-bold">✗ {value}</span>;
    // Nilai tidak dikenal → kemungkinan OCR salah baca (mis. "informal" padahal "normal")
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <WarningIcon /> {value}
        </span>
    );
}

// ── Confidence Alert ───────────────────────────────────────────
function ConfidenceAlert({ score }) {
    if (score == null || score >= 80) return null;
    const isLow = score < 60;
    return (
        <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${
            isLow ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
            <span className={`flex-shrink-0 mt-0.5 ${isLow ? "text-red-500" : "text-amber-500"}`}><WarningIcon /></span>
            <div>
                <p className="font-semibold">
                    {isLow ? "Kualitas OCR Rendah — Banyak Data Perlu Dikoreksi" : "Beberapa Data Perlu Diverifikasi"}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                    {isLow
                        ? `Confidence ${score}%. Sel yang ditandai merah/kuning kemungkinan terbaca salah.`
                        : `Confidence ${score}%. Periksa sel yang ditandai sebelum menyetujui.`}
                </p>
            </div>
        </div>
    );
}

// ── Tabel Hasil OCR ────────────────────────────────────────────
function ResultTable({ rows }) {
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">Tidak ada data tabel.</p>;

    const rawKeys = Object.keys(rows[0]).filter(k => !k.startsWith("_conf_") && !k.startsWith("_"));
    const noKey   = rawKeys.find(k => ["no", "nomor", "number", "#"].includes(k.toLowerCase())) ?? null;
    const descKey = rawKeys.find(k => ["descriptions", "description", "desc", "deskripsi", "item", "uraian"].includes(k.toLowerCase())) ?? null;
    const otherKeys = rawKeys.filter(k => k !== noKey && k !== descKey);
    // Urutan tampil: no → descriptions → kolom data lainnya (result, status, dll.)
    const colKeys = [...(noKey ? [noKey] : []), ...(descKey ? [descKey] : []), ...otherKeys];

    // Hitung apakah ada sel yang perlu diperiksa (confidence rendah ATAU nilai status tidak dikenal)
    const flaggedCount = rows.reduce((acc, row) => {
        return acc + colKeys.filter(k => {
            const conf = row[`_conf_${k}`];
            const val  = (row[k] ?? "").trim().toLowerCase();
            const isLowConf = conf != null && conf < CONF_MED;
            const isUnknownStatus = STATUS_KEYS.has(k.toLowerCase()) && val && !STATUS_OK.has(val) && !STATUS_NOK.has(val);
            return isLowConf || isUnknownStatus;
        }).length;
    }, 0);

    return (
        <div>
            {flaggedCount > 0 && (
                <p className="text-xs text-amber-600 font-medium mb-2 flex items-center gap-1">
                    <WarningIcon /> {flaggedCount} sel ditandai — periksa sebelum menyetujui
                </p>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-700 text-white">
                            {colKeys.map(k => (
                                <th key={k} className="px-3 py-2.5 text-left text-xs font-semibold border-r border-slate-600 last:border-0">
                                    {colLabel(k)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row, idx) => {
                            // Section header: kolom no terisi, tapi kolom DATA (bukan descriptions) kosong semua
                            const isHeader = noKey && (row[noKey] ?? "").trim() !== ""
                                && otherKeys.every(k => !(row[k] ?? "").trim());
                            return (
                                <tr key={idx} className={isHeader ? "bg-slate-100" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                                    {colKeys.map(k => {
                                        const val  = (row[k] ?? "").trim();
                                        const conf = row[`_conf_${k}`];
                                        const isLowConf = conf != null && conf < CONF_LOW;
                                        const isMedConf = conf != null && conf >= CONF_LOW && conf < CONF_MED;
                                        const cellBg = isLowConf ? "bg-red-50/70" : isMedConf ? "bg-amber-50/70" : "";

                                        if (isHeader) {
                                            return k === noKey
                                                ? <td key={k} className="px-3 py-2 border-r border-slate-200 text-xs font-bold text-slate-600">{val}</td>
                                                : <td key={k} className="px-4 py-2 font-semibold text-slate-700 text-sm border-r border-slate-200 last:border-0" colSpan={1}>{val}</td>;
                                        }

                                        return (
                                            <td key={k} className={`px-3 py-2.5 border-r border-slate-100 last:border-0 align-top ${cellBg}`}>
                                                <div className="flex items-start gap-1">
                                                    <div className="flex-1">
                                                        {STATUS_KEYS.has(k.toLowerCase())
                                                            ? <StatusCell value={val} />
                                                            : val
                                                                ? <span className="text-slate-700 text-xs">{val}</span>
                                                                : <span className="text-slate-300 text-xs">—</span>
                                                        }
                                                    </div>
                                                    {(isLowConf || isMedConf) && (
                                                        <span
                                                            title={`Confidence: ${conf?.toFixed(0)}% — perlu diperiksa`}
                                                            className={`flex-shrink-0 mt-0.5 ${isLowConf ? "text-red-400" : "text-amber-400"}`}
                                                        >
                                                            <WarningIcon />
                                                        </span>
                                                    )}
                                                </div>
                                                {(isLowConf || isMedConf) && (
                                                    <p className={`text-[9px] mt-0.5 ${isLowConf ? "text-red-400" : "text-amber-500"}`}>
                                                        conf {conf?.toFixed(0)}%
                                                    </p>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Field Grid ─────────────────────────────────────────────────
function FieldGrid({ fields }) {
    const entries = Object.entries(fields ?? {}).filter(([k, v]) => {
        if (k === "copyright") return false;
        if (Array.isArray(v)) return false;
        if (typeof v === "object") return false;
        return true;
    });
    if (!entries.length) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map(([k, v]) => {
                const val     = String(v ?? "").trim();
                const isEmpty = !val;
                return (
                    <div key={k} className={`p-3 rounded-lg border flex flex-col gap-0.5 ${
                        isEmpty ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100"
                    }`}>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{colLabel(k)}</span>
                            {isEmpty && <span title="Tidak terdeteksi" className="text-amber-400"><WarningIcon /></span>}
                        </div>
                        <span className="text-sm font-medium">
                            {isEmpty
                                ? <span className="text-slate-400 font-normal">-</span>
                                : <span className="text-slate-800">{val}</span>
                            }
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────
export default function ValidasiDokumenDetail({ document }) {
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [rejectReason, setRejectReason]     = useState("");
    const [submitting, setSubmitting]          = useState(false);

    const data  = document.extracted_data ?? {};
    const pages = data.pages ?? [];

    const handleApprove = () => {
        if (!confirm("Setujui dokumen ini sebagai valid?")) return;
        setSubmitting(true);
        router.patch(
            `/validasi-dokumen/${document.id}/approve`,
            { extracted_data: document.extracted_data },
            { onFinish: () => setSubmitting(false) }
        );
    };

    const handleReject = () => {
        if (!rejectReason.trim()) return;
        setSubmitting(true);
        router.patch(
            `/validasi-dokumen/${document.id}/reject`,
            { rejection_reason: rejectReason },
            { onFinish: () => { setSubmitting(false); setShowRejectForm(false); } }
        );
    };

    const score = document.confidence_score;
    const scoreColor = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";

    return (
        <AuthenticatedLayout>
            <Head title={`Validasi #${document.id}`} />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">

                {/* Breadcrumb */}
                <Link href="/validasi-dokumen"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition font-medium">
                    <BackIcon /> Kembali ke Antrian Validasi
                </Link>

                {/* ── Panel Aksi Admin ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-slate-800 px-6 py-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Validasi Dokumen</p>
                            <h1 className="text-base font-bold text-white leading-snug truncate max-w-lg">
                                {document.original_name}
                            </h1>
                            <p className="text-xs text-slate-400 mt-1">
                                #{document.id} · {document.template?.type_name ?? "Tanpa template"}
                                · Diunggah oleh {document.uploaded_by ?? "—"} · {document.uploaded_at}
                            </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Kualitas Baca</p>
                            <p className={`text-xl font-bold ${scoreColor}`}>
                                {score != null ? `${score}%` : "—"}
                            </p>
                        </div>
                    </div>

                    <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-b border-slate-100">
                        <p className="text-sm text-slate-600 flex-1">
                            Periksa hasil ekstraksi di bawah. Sel bertanda{" "}
                            <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold">⚠ kuning</span>{" "}
                            atau{" "}
                            <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">⚠ merah</span>{" "}
                            perlu diverifikasi sebelum disetujui.
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => setShowRejectForm(!showRejectForm)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-semibold transition disabled:opacity-50"
                            >
                                <XIcon /> Tolak
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold transition disabled:opacity-50 shadow-sm"
                            >
                                <CheckIcon /> {submitting ? "Menyimpan..." : "Setujui"}
                            </button>
                        </div>
                    </div>

                    {/* Form tolak */}
                    {showRejectForm && (
                        <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                            <p className="text-sm font-semibold text-red-700 mb-2">Alasan penolakan</p>
                            <textarea
                                rows={3}
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Jelaskan alasan penolakan (mis: dokumen buram, template tidak sesuai, dll)..."
                                className="w-full px-3 py-2 text-sm border border-red-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={handleReject}
                                    disabled={!rejectReason.trim() || submitting}
                                    className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
                                >
                                    Konfirmasi Tolak
                                </button>
                                <button
                                    onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                                    className="px-4 py-2 bg-white text-red-600 text-sm font-semibold rounded-xl border border-red-200 hover:bg-red-50 transition"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Hasil Ekstraksi ── */}
                {pages.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                        Data ekstraksi tidak tersedia.
                    </div>
                ) : (
                    pages.map((page, pi) => {
                        const fields = page.fields ?? {};
                        const tables = page.tables ?? {};
                        const copyright = fields.copyright;

                        // Flatten field dari grup nested (document, header, dll) + top-level string
                        const primitiveFields = {};
                        for (const [k, v] of Object.entries(fields)) {
                            if (k === "copyright") continue;
                            if (typeof v === "string") {
                                primitiveFields[k] = v;
                            } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
                                for (const [ik, iv] of Object.entries(v)) {
                                    if (iv == null) continue;
                                    primitiveFields[ik] = typeof iv === "string" ? iv : String(iv);
                                }
                            }
                        }

                        return (
                            <div key={pi} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                                {/* Page header */}
                                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-slate-700">
                                        {pages.length > 1 ? `Halaman ${page.page}` : "Hasil Ekstraksi"}
                                    </h2>
                                    <span className={`text-xs font-bold ${
                                        (page.confidence ?? 0) >= 80 ? "text-emerald-600" :
                                        (page.confidence ?? 0) >= 60 ? "text-amber-600" : "text-red-500"
                                    }`}>
                                        Confidence: {page.confidence != null ? `${page.confidence}%` : "—"}
                                    </span>
                                </div>

                                <div className="p-6 space-y-6">
                                    <ConfidenceAlert score={page.confidence} />

                                    {/* Fields */}
                                    {Object.keys(primitiveFields).length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Informasi Dokumen</p>
                                            <FieldGrid fields={primitiveFields} />
                                        </div>
                                    )}

                                    {/* Tables */}
                                    {Object.entries(tables).map(([tableKey, rows]) =>
                                        Array.isArray(rows) && rows.length > 0 ? (
                                            <div key={tableKey}>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                    {colLabel(tableKey)}
                                                </p>
                                                <ResultTable rows={rows} />
                                            </div>
                                        ) : null
                                    )}

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
        </AuthenticatedLayout>
    );
}
