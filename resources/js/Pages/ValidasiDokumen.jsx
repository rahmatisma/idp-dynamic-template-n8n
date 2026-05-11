import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// ── Icons ──────────────────────────────────────────────────────
const SearchIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);
const EyeIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);
const WarningIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);
const FileIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
);
const ChevronLeftIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
);
const ChevronRightIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

// ── Confidence Bar ─────────────────────────────────────────────
function ConfidenceBar({ score }) {
    if (score == null) return <span className="text-xs text-slate-300">—</span>;
    const pct = Math.round(score);
    const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
    const textColor = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-600";
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
        </div>
    );
}

// ── Urgency Badge ──────────────────────────────────────────────
function UrgencyBadge({ score }) {
    if (score == null) return null;
    if (score < 60) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-semibold">
            <WarningIcon className="w-3 h-3" /> Kritis
        </span>
    );
    if (score < 80) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
            Perlu Cek
        </span>
    );
    return null;
}

// ── Main Page ──────────────────────────────────────────────────
export default function ValidasiDokumen({ documents, flash = {} }) {
    const [search, setSearch] = useState("");

    const filtered = (documents.data ?? []).filter(doc =>
        doc.original_name.toLowerCase().includes(search.toLowerCase()) ||
        (doc.template_name ?? "").toLowerCase().includes(search.toLowerCase())
    );

    const goToPage = (url) => { if (url) router.visit(url, { preserveScroll: true }); };

    // Hitung summary
    const totalDocs  = documents.total ?? filtered.length;
    const kritis     = (documents.data ?? []).filter(d => (d.confidence_score ?? 0) < 60).length;
    const perluCek   = (documents.data ?? []).filter(d => {
        const s = d.confidence_score ?? 0;
        return s >= 60 && s < 80;
    }).length;

    return (
        <AuthenticatedLayout header="Validasi Dokumen">
            <Head title="Validasi Dokumen" />

            <div className="space-y-5">

                {/* Flash */}
                {flash.success && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
                        {flash.success}
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-800">Antrian Validasi</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Dokumen yang memerlukan pemeriksaan manual oleh admin.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">
                            <span className="font-bold text-slate-800">{totalDocs}</span> dokumen
                        </div>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total Antrian</p>
                        <p className="text-2xl font-bold text-slate-800">{totalDocs}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 space-y-1">
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Kritis (&lt;60%)</p>
                        <p className="text-2xl font-bold text-red-600">{kritis}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 space-y-1">
                        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Perlu Cek (60–79%)</p>
                        <p className="text-2xl font-bold text-amber-600">{perluCek}</p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <SearchIcon />
                    </span>
                    <input
                        type="text"
                        placeholder="Cari nama file atau template..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
                    />
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <WarningIcon />
                            </div>
                            <p className="text-sm font-medium text-slate-500">
                                {search ? "Tidak ada dokumen yang cocok" : "Tidak ada dokumen dalam antrian validasi"}
                            </p>
                            {!search && (
                                <p className="text-xs text-slate-400">Semua dokumen sudah divalidasi</p>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Table header */}
                            <div className="grid grid-cols-[1fr_160px_110px_110px_90px] px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                <div>Dokumen</div>
                                <div>Template</div>
                                <div>Kualitas OCR</div>
                                <div>Diunggah</div>
                                <div className="text-center">Aksi</div>
                            </div>

                            {filtered.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="grid grid-cols-[1fr_160px_110px_110px_90px] px-6 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition items-center"
                                >
                                    {/* Nama file */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex-shrink-0 w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-400">
                                            <FileIcon />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                                                {doc.original_name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-slate-400">
                                                    #{doc.id} · {doc.uploaded_by ?? "—"}
                                                </span>
                                                <UrgencyBadge score={doc.confidence_score} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Template */}
                                    <div className="text-xs text-slate-600 truncate pr-3">
                                        {doc.template_name}
                                    </div>

                                    {/* Confidence */}
                                    <div>
                                        <ConfidenceBar score={doc.confidence_score} />
                                    </div>

                                    {/* Tanggal */}
                                    <div className="text-xs text-slate-500 leading-tight">
                                        <p>{doc.processed_at ?? doc.uploaded_at}</p>
                                    </div>

                                    {/* Aksi */}
                                    <div className="flex justify-center">
                                        <Link
                                            href={`/validasi-dokumen/${doc.id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold transition"
                                        >
                                            <EyeIcon /> Periksa
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Pagination */}
                {documents.last_page > 1 && (
                    <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>
                            Halaman {documents.current_page} dari {documents.last_page}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => goToPage(documents.prev_page_url)}
                                disabled={!documents.prev_page_url}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
                            >
                                <ChevronLeftIcon /> Prev
                            </button>
                            <button
                                onClick={() => goToPage(documents.next_page_url)}
                                disabled={!documents.next_page_url}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
                            >
                                Next <ChevronRightIcon />
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </AuthenticatedLayout>
    );
}
