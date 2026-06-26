import { useState, useCallback, useRef, createContext, useContext } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// Apakah badge/highlight peringatan confidence (oranye/merah) ditampilkan.
// Untuk dokumen "completed" peringatan disembunyikan (operator dianggap
// sudah menyetujui SELURUH data). Highlight "Diubah" (kuning) TIDAK
// terpengaruh. Nilai confidence asli tidak diubah — murni visual.
const ShowWarningsContext = createContext(true);

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

// Flatten page.fields satu level — group object dijadikan flat.
// Top-level key yang dimulai _ (mis. _repeating_sections) di-skip agar
// tidak tercampur ke field grid biasa.
function flattenFields(rawFields) {
    const result = {};
    for (const [k, v] of Object.entries(rawFields ?? {})) {
        if (k.startsWith('_')) continue;
        if (typeof v === "string") {
            result[k] = v;
        } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            for (const [ik, iv] of Object.entries(v)) {
                result[ik] = iv == null ? "" : (typeof iv === "string" ? iv : String(iv));
            }
        }
    }
    return result;
}

// ── Confidence Alert ───────────────────────────────────────────
function ConfidenceAlert({ score }) {
    const showWarnings = useContext(ShowWarningsContext);
    if (!showWarnings) return null;            // dok completed → sembunyikan
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
                        ? `Confidence ${score}%. Sel merah/kuning kemungkinan terbaca salah — klik untuk mengedit.`
                        : `Confidence ${score}%. Periksa sel yang ditandai sebelum menyetujui.`}
                </p>
            </div>
        </div>
    );
}

// ── Editable Field Grid ────────────────────────────────────────
function EditableFieldGrid({ pageIdx, fields, originalFields, onFieldChange }) {
    const showWarnings = useContext(ShowWarningsContext);
    const flat     = flattenFields(fields);
    const flatOrig = flattenFields(originalFields);

    const entries = Object.entries(flat).filter(([k]) => !k.startsWith("_") && k !== "copyright");
    if (!entries.length) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map(([k, v]) => {
                const val     = String(v ?? "");
                const origVal = String(flatOrig[k] ?? "");
                const isEdited = val !== origVal;

                const conf         = parseFloat(flat[`_conf_${k}`]);
                const wasAttempted = flat[`_ocr_source_${k}`] !== undefined && flat[`_ocr_source_${k}`] !== "";
                const isEmpty      = val === "" && wasAttempted;
                // Peringatan confidence hanya untuk dok belum completed
                const isLowConf    = showWarnings && !isNaN(conf) && conf < CONF_LOW;
                const isMedConf    = showWarnings && !isNaN(conf) && conf >= CONF_LOW && conf < CONF_MED;
                const showEmptyWarn = showWarnings && isEmpty;

                const cardCls = isEdited
                    ? "bg-yellow-50 border-yellow-300"
                    : isLowConf ? "bg-red-50/50 border-red-100"
                    : (isMedConf || showEmptyWarn) ? "bg-amber-50/50 border-amber-100"
                    : "bg-slate-50 border-slate-100";

                return (
                    <div key={k} className={`p-3 rounded-lg border flex flex-col gap-1.5 ${cardCls}`}>
                        <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                                    {colLabel(k)}
                                </span>
                                {!isEdited && (isLowConf || isMedConf || showEmptyWarn) && (
                                    <span
                                        title={isEmpty ? "Tidak terdeteksi — perlu diperiksa" : `Confidence rendah (${Math.round(conf)}%)`}
                                        className={isLowConf ? "text-red-400" : "text-amber-400"}
                                    >
                                        <WarningIcon />
                                    </span>
                                )}
                            </div>
                            {isEdited && (
                                <span className="text-[9px] font-bold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                    Diubah
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            value={val}
                            onChange={e => onFieldChange(pageIdx, k, e.target.value)}
                            placeholder={isEmpty ? "(kosong)" : ""}
                            className={`w-full px-2.5 py-1.5 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors ${
                                isEdited
                                    ? "border-yellow-400 bg-yellow-50 text-slate-800"
                                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                            }`}
                        />
                        {!isEdited && !isNaN(conf) && (isLowConf || isMedConf) && (
                            <p className={`text-[10px] ${isLowConf ? "text-red-400" : "text-amber-500"}`}>
                                conf {conf.toFixed(0)}%
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Editable Result Table ──────────────────────────────────────
function EditableResultTable({ pageIdx, tableKey, rows, originalRows, onCellChange, columnOrder }) {
    const showWarnings = useContext(ShowWarningsContext);
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">Tidak ada data tabel.</p>;

    const rawKeys    = Object.keys(rows[0]).filter(k => !k.startsWith("_"));
    const sortedKeys = columnOrder?.length
        ? [...rawKeys].sort((a, b) => {
            const iA = columnOrder.indexOf(a);
            const iB = columnOrder.indexOf(b);
            if (iA === -1 && iB === -1) return 0;
            if (iA === -1) return 1;
            if (iB === -1) return -1;
            return iA - iB;
          })
        : rawKeys;
    const noKey    = sortedKeys.find(k => ["no", "nomor", "number", "#"].includes(k.toLowerCase())) ?? null;
    const descKey  = sortedKeys.find(k => ["descriptions", "description", "desc", "deskripsi", "item", "uraian"].includes(k.toLowerCase())) ?? null;
    const otherKeys = sortedKeys.filter(k => k !== noKey && k !== descKey);
    const colKeys  = [...(noKey ? [noKey] : []), ...(descKey ? [descKey] : []), ...otherKeys];

    const editedCount = rows.reduce((acc, row, ri) => {
        const origRow = originalRows?.[ri] ?? {};
        return acc + colKeys.filter(k => (row[k] ?? "") !== (origRow[k] ?? "")).length;
    }, 0);

    return (
        <div>
            {editedCount > 0 && (
                <p className="text-xs text-yellow-600 font-medium mb-2 flex items-center gap-1">
                    ✏ {editedCount} sel telah diubah dari hasil OCR
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
                        {rows.map((row, ri) => {
                            const origRow = originalRows?.[ri] ?? {};
                            const isHeader = noKey && (row[noKey] ?? "").trim() !== ""
                                && otherKeys.every(k => !(row[k] ?? "").trim());

                            return (
                                <tr key={ri} className={
                                    isHeader ? "bg-slate-100"
                                    : ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                                }>
                                    {colKeys.map(k => {
                                        const val     = row[k] ?? "";
                                        const origVal = origRow[k] ?? "";
                                        const conf    = row[`_conf_${k}`];
                                        const isEdited  = val !== origVal;
                                        const isNoCol   = k === noKey;
                                        const isLowConf = showWarnings && !isEdited && !isHeader && conf != null && conf < CONF_LOW;
                                        const isMedConf = showWarnings && !isEdited && !isHeader && conf != null && conf >= CONF_LOW && conf < CONF_MED;

                                        // Header row tidak mendapat override warna cell (tr sudah bg-slate-100)
                                        const cellBg = isHeader ? ""
                                            : isEdited  ? "bg-yellow-50"
                                            : isLowConf ? "bg-red-50/70"
                                            : isMedConf ? "bg-amber-50/70"
                                            : "";

                                        // Input: kuning jika diubah, bold-abu jika baris header, normal jika biasa
                                        const inputCls = isEdited
                                            ? "border-yellow-400 bg-yellow-50/80 text-slate-800"
                                            : isHeader
                                                ? "border-transparent bg-transparent text-slate-600 font-semibold hover:border-slate-300 hover:bg-white/60"
                                                : "border-transparent bg-transparent text-slate-700 hover:border-slate-300 hover:bg-white";

                                        return (
                                            <td key={k} className={`px-2 py-1 border-r border-slate-100 last:border-0 align-top ${cellBg}`}>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        value={val}
                                                        onChange={e => onCellChange(pageIdx, tableKey, ri, k, e.target.value)}
                                                        className={`w-full ${isNoCol && !isHeader ? "min-w-[32px]" : "min-w-[60px]"} px-1.5 py-0.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-indigo-300 transition-colors ${inputCls}`}
                                                    />
                                                    {(isLowConf || isMedConf) && (
                                                        <span
                                                            title={`Confidence: ${conf?.toFixed(0)}% — perlu diperiksa`}
                                                            className={`flex-shrink-0 ${isLowConf ? "text-red-400" : "text-amber-400"}`}
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

// ── Main Page ──────────────────────────────────────────────────
export default function ValidasiDokumenDetail({ document }) {
    // Deep-clone extracted_data menjadi editable state
    const [editedData, setEditedData]       = useState(() => JSON.parse(JSON.stringify(document.extracted_data ?? {})));
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [rejectReason, setRejectReason]   = useState("");
    const [submitting, setSubmitting]       = useState(false);
    const [leftWidth, setLeftWidth]         = useState(50); // persen

    // Resize handle
    const containerRef = useRef(null);
    const dragging     = useRef(false);

    const startResize = useCallback((e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor     = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (ev) => {
            if (!dragging.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pct  = ((ev.clientX - rect.left) / rect.width) * 100;
            setLeftWidth(Math.min(75, Math.max(25, pct)));
        };

        const onUp = () => {
            dragging.current               = false;
            document.body.style.cursor     = "";
            document.body.style.userSelect = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, []);

    // Update field (flat key → cari di top-level atau nested group)
    const handleFieldChange = useCallback((pageIdx, key, value) => {
        setEditedData(prev => {
            const next       = JSON.parse(JSON.stringify(prev));
            const pageFields = next.pages?.[pageIdx]?.fields;
            if (!pageFields) return next;

            if (typeof pageFields[key] === "string") {
                pageFields[key] = value;
            } else {
                let found = false;
                for (const [gk, gv] of Object.entries(pageFields)) {
                    if (typeof gv === "object" && gv !== null && !Array.isArray(gv) && key in gv) {
                        gv[key] = value;
                        found = true;
                        break;
                    }
                }
                if (!found) pageFields[key] = value;
            }
            return next;
        });
    }, []);

    // Update cell di tabel
    const handleCellChange = useCallback((pageIdx, tableKey, rowIdx, colKey, value) => {
        setEditedData(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const cell = next.pages?.[pageIdx]?.tables?.[tableKey]?.[rowIdx];
            if (cell !== undefined) cell[colKey] = value;
            return next;
        });
    }, []);

    // Kirim revised_data ke controller
    const handleApprove = () => {
        const isCompleted = document.status === "completed";
        const confirmMsg  = isCompleted
            ? "Simpan perubahan data pada dokumen ini?"
            : "Setujui dokumen ini sebagai valid? Semua perubahan akan disimpan.";
        if (!confirm(confirmMsg)) return;

        // Kirim nilai hasil edit apa adanya. Backend yang membandingkan
        // terhadap data lama lalu menandai field/sel yang berubah dengan
        // confidence 100 + source "human" (lihat ValidationController@markHumanEdits).
        const revisedData = editedData;
        const endpoint    = isCompleted
            ? `/validasi-dokumen/${document.id}/update`
            : `/validasi-dokumen/${document.id}/approve`;

        setSubmitting(true);
        router.patch(
            endpoint,
            { revised_data: revisedData },
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

    const originalPages = document.extracted_data?.pages ?? [];
    const editedPages   = editedData?.pages ?? [];
    const score         = document.confidence_score;
    const scoreColor    = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";

    // Dokumen completed → peringatan confidence visual disembunyikan
    // (highlight "Diubah" kuning tetap aktif; nilai asli tidak diubah).
    const showWarnings = document.status !== "completed";

    return (
        <AuthenticatedLayout>
          <ShowWarningsContext.Provider value={showWarnings}>
            <Head title={`Validasi #${document.id}`} />

            {/*
             * -m-4 md:-m-6  → batalkan padding <main> dari AuthenticatedLayout
             * height: calc(100vh - 64px) → topbar = 64px, sisa = area kerja
             */}
            <div
                className="-m-4 md:-m-6 flex flex-col overflow-hidden"
                style={{ height: "calc(100vh - 64px)" }}
            >
                {/* ── Top Action Bar ── */}
                <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                        {/* Kiri: breadcrumb + info dokumen */}
                        <div className="min-w-0">
                            <Link
                                href="/validasi-dokumen"
                                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-300 transition mb-1"
                            >
                                <BackIcon /> Antrian Validasi
                            </Link>
                            <h1 className="text-sm font-bold text-white truncate max-w-lg">
                                {document.original_name}
                            </h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                #{document.id} · {document.template?.type_name ?? "Tanpa template"}
                                &nbsp;· {document.uploaded_by ?? "—"} · {document.uploaded_at}
                            </p>
                        </div>

                        {/* Kanan: score + tombol */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right hidden sm:block">
                                <p className="text-[9px] text-slate-400 uppercase tracking-wide">Kualitas Baca</p>
                                <p className={`text-lg font-bold leading-none ${scoreColor}`}>
                                    {score != null ? `${score}%` : "—"}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowRejectForm(!showRejectForm)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-800/60 text-sm font-semibold transition disabled:opacity-50"
                            >
                                <XIcon /> Tolak
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold transition disabled:opacity-50 shadow-sm"
                            >
                                <CheckIcon /> {submitting ? "Menyimpan..." : document.status === "completed" ? "Simpan Perubahan" : "Setujui"}
                            </button>
                        </div>
                    </div>

                    {/* Instruksi singkat */}
                    <p className="mt-2 text-xs text-slate-400">
                        Klik field atau sel tabel untuk mengedit langsung.{" "}
                        <span className="text-yellow-400 font-semibold">Kuning</span> = diubah dari OCR ·{" "}
                        <span className="text-red-400 font-semibold">Merah/oranye</span> = confidence rendah.
                    </p>
                </div>

                {/* Form tolak (collapse/expand di bawah top bar) */}
                {showRejectForm && (
                    <div className="flex-shrink-0 px-4 py-3 bg-red-950/60 border-b border-red-900/50">
                        <p className="text-xs font-semibold text-red-300 mb-1.5">Alasan penolakan</p>
                        <textarea
                            rows={2}
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Jelaskan alasan penolakan (mis: dokumen buram, template tidak sesuai, dll)..."
                            className="w-full px-3 py-2 text-sm border border-red-700 rounded-lg bg-red-950/50 text-red-100 placeholder-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={handleReject}
                                disabled={!rejectReason.trim() || submitting}
                                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
                            >
                                Konfirmasi Tolak
                            </button>
                            <button
                                onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                                className="px-3 py-1.5 bg-transparent text-red-300 text-xs font-semibold rounded-lg border border-red-700 hover:bg-red-900/30 transition"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Split View ── */}
                <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">

                    {/* Panel KIRI — PDF Viewer */}
                    <div
                        style={{ width: `${leftWidth}%` }}
                        className="flex flex-col flex-shrink-0 min-w-0 hidden md:flex"
                    >
                        <div className="flex-shrink-0 px-3 py-1.5 bg-slate-100 border-b border-r border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">Dokumen Asli (PDF)</span>
                            <a
                                href={document.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium transition"
                            >
                                Buka di tab baru ↗
                            </a>
                        </div>
                        <iframe
                            src={document.file_url}
                            className="flex-1 w-full border-0 border-r border-slate-200"
                            title="PDF Dokumen Asli"
                        />
                    </div>

                    {/* Resize handle (desktop only) */}
                    <div
                        className="hidden md:flex w-1.5 flex-shrink-0 bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 cursor-col-resize transition-colors items-center justify-center"
                        onMouseDown={startResize}
                        title="Geser untuk mengubah ukuran panel"
                    >
                        {/* Visual grip dots */}
                        <div className="flex flex-col gap-1 pointer-events-none">
                            {[0,1,2].map(i => (
                                <div key={i} className="w-1 h-1 rounded-full bg-slate-400" />
                            ))}
                        </div>
                    </div>

                    {/* Panel KANAN — Form editable */}
                    <div className="flex-1 overflow-y-auto min-w-0 bg-slate-50">
                        <div className="p-4 space-y-5">
                            {editedPages.length === 0 ? (
                                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                                    Data ekstraksi tidak tersedia.
                                </div>
                            ) : (
                                editedPages.map((page, pi) => {
                                    const origPage   = originalPages[pi] ?? {};
                                    const fields     = page.fields ?? {};
                                    const tables     = page.tables ?? {};
                                    const origFields = origPage.fields ?? {};
                                    const origTables = origPage.tables ?? {};
                                    const copyright  = fields.copyright;

                                    // Pisahkan repeating sections dari field biasa.
                                    // Fallback: jika _repeating_sections tidak ada di metadata
                                    // (dokumen diproses sebelum fix), inferensi dari objek
                                    // non-standar di fields yang punya tabel dengan prefix di tables.
                                    const STATIC_FIELD_KEYS = new Set([
                                        'document','header','checklist','notes','pelaksana',
                                        'mengetahui','copyright','field_order','table_order','combined_order'
                                    ]);
                                    const storedRsMeta = fields._repeating_sections ?? {};
                                    const rsMeta = Object.keys(storedRsMeta).length > 0
                                        ? storedRsMeta
                                        : (() => {
                                            const inferred = {};
                                            for (const [k, v] of Object.entries(fields)) {
                                                if (k.startsWith('_') || STATIC_FIELD_KEYS.has(k)) continue;
                                                if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
                                                const secTables    = Object.keys(tables).filter(tk => tk.startsWith(`${k}_`));
                                                const scalarFields = Object.keys(v).filter(fk => !fk.startsWith('_') && !Array.isArray(v[fk]));
                                                if (secTables.length > 0 || scalarFields.length > 0) {
                                                    inferred[k] = {
                                                        section_name: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                                                        fields:       scalarFields,
                                                        tables:       secTables,
                                                    };
                                                }
                                            }
                                            return inferred;
                                        })();
                                    const secKeySet = new Set(Object.keys(rsMeta));
                                    console.log('[DEBUG] storedRsMeta:', storedRsMeta);
                                    console.log('[DEBUG] rsMeta:', rsMeta);
                                    console.log('[DEBUG] secKeySet:', [...secKeySet]);
                                    console.log('[DEBUG] fields keys:', Object.keys(fields));
                                    console.log('[DEBUG] tables keys:', Object.keys(tables));
                                    const secTableKeys = new Set([
                                        ...Object.values(rsMeta).flatMap(s => s.tables ?? []),
                                        ...Object.keys(tables).filter(k =>
                                            Object.keys(rsMeta).some(sk => k.startsWith(`${sk}_`))
                                        )
                                    ]);

                                    // Field biasa: buang section keys & underscore keys
                                    const nonSecFields    = Object.fromEntries(Object.entries(fields).filter(([k]) => !secKeySet.has(k) && !k.startsWith('_')));
                                    const nonSecOrigFields = Object.fromEntries(Object.entries(origFields).filter(([k]) => !secKeySet.has(k) && !k.startsWith('_')));

                                    const flat      = flattenFields(nonSecFields);
                                    const hasFields = Object.keys(flat).some(k => !k.startsWith("_") && k !== "copyright");

                                    return (
                                        <div key={pi} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                            {/* Page header */}
                                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                                                <h2 className="text-sm font-semibold text-slate-700">
                                                    {editedPages.length > 1 ? `Halaman ${page.page}` : "Hasil Ekstraksi"}
                                                </h2>
                                                <span className={`text-xs font-bold ${
                                                    (page.confidence ?? 0) >= 80 ? "text-emerald-600" :
                                                    (page.confidence ?? 0) >= 60 ? "text-amber-600" : "text-red-500"
                                                }`}>
                                                    Confidence: {page.confidence != null ? `${page.confidence}%` : "—"}
                                                </span>
                                            </div>

                                            <div className="p-5 space-y-6">
                                                <ConfidenceAlert score={page.confidence} />

                                                {/* Editable Fields (tanpa section fields) */}
                                                {hasFields && (
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                            Informasi Dokumen
                                                        </p>
                                                        <EditableFieldGrid
                                                            pageIdx={pi}
                                                            fields={nonSecFields}
                                                            originalFields={nonSecOrigFields}
                                                            onFieldChange={handleFieldChange}
                                                        />
                                                    </div>
                                                )}

                                                {/* Repeating Sections (Bank 1, Bank 2, dll) */}
                                                {Object.entries(rsMeta).map(([secKey, secMeta]) => {
                                                    const secFields     = fields[secKey] ?? {};
                                                    const origSecFields = origFields[secKey] ?? {};
                                                    const secHasFields  = (secMeta.fields ?? []).length > 0;
                                                    const secHasTables  = Object.keys(tables).some(
                                                        k => k.startsWith(`${secKey}_`) && (tables[k] ?? []).length > 0
                                                    );
                                                    if (!secHasFields && !secHasTables) return null;
                                                    const secLabel = secMeta.section_name ?? secKey.replace(/_/g, " ").toUpperCase();
                                                    return (
                                                        <div key={secKey} className="rounded-xl overflow-hidden border border-violet-200">
                                                            <div className="px-4 py-2 bg-violet-600 flex items-center gap-2">
                                                                <span className="text-xs font-bold text-white uppercase tracking-widest">
                                                                    {secLabel}
                                                                </span>
                                                            </div>
                                                            <div className="p-4 space-y-4 bg-violet-50/20">
                                                                {secHasFields && (
                                                                    <EditableFieldGrid
                                                                        pageIdx={pi}
                                                                        fields={{ [secKey]: secFields }}
                                                                        originalFields={{ [secKey]: origSecFields }}
                                                                        onFieldChange={handleFieldChange}
                                                                    />
                                                                )}
                                                                {(() => {
                                                                    const metaTables   = new Set(secMeta.tables ?? []);
                                                                    const prefixTables = Object.keys(tables).filter(k => k.startsWith(`${secKey}_`) && !k.endsWith('__col_order'));
                                                                    const allSecTables = [...new Set([...metaTables, ...prefixTables])];
                                                                    return allSecTables.map(combinedKey => {
                                                                        const rows     = tables[combinedKey] ?? [];
                                                                        const origRows = origTables[combinedKey] ?? [];
                                                                        const tblLabel = combinedKey.replace(new RegExp(`^${secKey}_`), "");
                                                                        return rows.length > 0 ? (
                                                                            <div key={combinedKey}>
                                                                                <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-2">
                                                                                    {colLabel(tblLabel)}
                                                                                </p>
                                                                                <EditableResultTable
                                                                                    pageIdx={pi}
                                                                                    tableKey={combinedKey}
                                                                                    rows={rows}
                                                                                    originalRows={origRows}
                                                                                    onCellChange={handleCellChange}
                                                                                    columnOrder={tables[combinedKey + '__col_order']}
                                                                                />
                                                                            </div>
                                                                        ) : null;
                                                                    });
                                                                })()}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Editable Tables (checklist, dll — bukan section tables) */}
                                                {Object.entries(tables)
                                                    .filter(([k]) => !secTableKeys.has(k) && !k.endsWith('__col_order'))
                                                    .map(([tableKey, rows]) =>
                                                        Array.isArray(rows) && rows.length > 0 ? (
                                                            <div key={tableKey}>
                                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                                    {colLabel(tableKey)}
                                                                </p>
                                                                <EditableResultTable
                                                                    pageIdx={pi}
                                                                    tableKey={tableKey}
                                                                    rows={rows}
                                                                    originalRows={origTables[tableKey] ?? []}
                                                                    onCellChange={handleCellChange}
                                                                    columnOrder={tables[tableKey + '__col_order']}
                                                                />
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
                    </div>
                </div>
            </div>
          </ShowWarningsContext.Provider>
        </AuthenticatedLayout>
    );
}
