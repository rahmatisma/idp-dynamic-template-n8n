import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link } from "@inertiajs/react";

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
const CopyIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

// ── Status Badge ───────────────────────────────────────────────
const STATUS_MAP = {
    queued:          { label: "Antrian",        cls: "bg-blue-50 text-blue-600 border-blue-100",       dot: "bg-blue-400" },
    processing:      { label: "Diproses",       cls: "bg-indigo-50 text-indigo-700 border-indigo-100", dot: "bg-indigo-500 animate-pulse" },
    need_validation: { label: "Perlu Validasi", cls: "bg-amber-50 text-amber-600 border-amber-100",    dot: "bg-amber-500" },
    completed:       { label: "Selesai",        cls: "bg-emerald-50 text-emerald-600 border-emerald-100", dot: "bg-emerald-500" },
    failed:          { label: "Gagal",          cls: "bg-red-50 text-red-600 border-red-100",          dot: "bg-red-500" },
};
function StatusBadge({ status }) {
    const s = STATUS_MAP[status] ?? STATUS_MAP.queued;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            {s.label}
        </span>
    );
}

// ── Confidence Bar ─────────────────────────────────────────────
function ConfidenceBar({ score }) {
    if (score === null || score === undefined) return <span className="text-xs text-slate-300">—</span>;
    const pct = Math.round(score);
    const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-slate-700">{pct}%</span>
        </div>
    );
}

// ── JSON Renderer ──────────────────────────────────────────────
function JsonBlock({ data }) {
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(data, null, 2);

    const handleCopy = () => {
        navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative">
            <button
                onClick={handleCopy}
                className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 bg-slate-800 hover:bg-slate-700 rounded-lg transition z-10"
                title="Copy JSON"
            >
                <CopyIcon />
                {copied ? "Tersalin!" : "Copy"}
            </button>
            <pre className="bg-slate-900 text-slate-100 rounded-xl p-5 overflow-auto text-xs leading-relaxed font-mono max-h-[70vh]">
                <code>{json}</code>
            </pre>
        </div>
    );
}

// ── Halaman Utama ──────────────────────────────────────────────
import { useState } from "react";

export default function DocumentDetail({ document }) {
    const hasData = document.extracted_data && Object.keys(document.extracted_data).length > 0;

    return (
        <AuthenticatedLayout>
            <Head title={`Detail Dokumen #${document.id}`} />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

                {/* ── Breadcrumb & Kembali ── */}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Link
                        href="/upload-dokumen"
                        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition font-medium"
                    >
                        <BackIcon />
                        Kembali ke Upload
                    </Link>
                    <span>/</span>
                    <span className="text-slate-700 font-medium truncate max-w-xs">{document.original_name}</span>
                </div>

                {/* ── Info Card ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-400">
                            <FileIcon />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-lg font-semibold text-slate-800 truncate">
                                {document.original_name}
                            </h1>
                            <p className="text-sm text-slate-400 mt-0.5">
                                ID #{document.id} · Diupload {document.uploaded_at}
                            </p>
                        </div>
                        <StatusBadge status={document.status} />
                    </div>

                    <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                            <p className="text-xs text-slate-400 mb-1">Template</p>
                            <p className="text-sm font-medium text-slate-700">
                                {document.template_name ?? <span className="text-slate-300 italic">Tidak terdeteksi</span>}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1">Akurasi OCR</p>
                            <ConfidenceBar score={document.confidence_score} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1">Status Ekstraksi</p>
                            <p className="text-sm font-medium text-slate-700">
                                {hasData
                                    ? <span className="text-emerald-600">Data tersedia</span>
                                    : <span className="text-slate-400 italic">Belum ada data</span>
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Hasil Ekstraksi JSON ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-slate-800">Hasil Ekstraksi</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Raw JSON data yang diekstrak dari dokumen</p>
                        </div>
                        {hasData && (
                            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
                                Data Tersedia
                            </span>
                        )}
                    </div>

                    <div className="p-6">
                        {hasData ? (
                            <JsonBlock data={document.extracted_data} />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-slate-500">Data ekstraksi belum tersedia</p>
                                <p className="text-xs text-slate-400 text-center max-w-xs">
                                    Dokumen masih diproses atau belum berhasil diekstrak. Coba refresh halaman beberapa saat lagi.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </AuthenticatedLayout>
    );
}
