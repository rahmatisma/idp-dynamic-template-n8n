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
    if (score == null) return <span className="text-xs text-zinc-500">—</span>;
    const pct = Math.round(score);
    const trackColor = "#2a2a2a";
    const barColor = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
    const textColor = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: trackColor }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="text-xs font-bold" style={{ color: textColor }}>{pct}%</span>
        </div>
    );
}

// ── Urgency Badge ──────────────────────────────────────────────
function UrgencyBadge({ score }) {
    if (score == null) return null;
    if (score < 60) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
            <span className="w-3 h-3 inline-flex"><WarningIcon /></span> Kritis
        </span>
    );
    if (score < 80) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
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

    const totalDocs = documents.total ?? filtered.length;
    const kritis    = (documents.data ?? []).filter(d => (d.confidence_score ?? 0) < 60).length;
    const perluCek  = (documents.data ?? []).filter(d => {
        const s = d.confidence_score ?? 0;
        return s >= 60 && s < 80;
    }).length;

    return (
        <AuthenticatedLayout header="Validasi Dokumen">
            <Head title="Validasi Dokumen" />

            <div className="space-y-5">

                {/* Flash */}
                {flash.success && (
                    <div className="text-sm px-4 py-3 rounded-xl"
                        style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}>
                        {flash.success}
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Antrian Validasi</h1>
                        <p className="text-sm mt-0.5" style={{ color: "#888" }}>
                            Dokumen yang memerlukan pemeriksaan manual oleh admin.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="px-4 py-2 text-sm rounded-xl"
                            style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888" }}>
                            <span className="font-bold" style={{ color: "#f5f5f5" }}>{totalDocs}</span> dokumen
                        </div>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                    {/* Total */}
                    <div className="rounded-2xl p-4 space-y-1"
                        style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#888" }}>
                            Total Antrian
                        </p>
                        <p className="text-2xl font-bold" style={{ color: "#f5f5f5" }}>{totalDocs}</p>
                    </div>

                    {/* Kritis */}
                    <div className="rounded-2xl p-4 space-y-1"
                        style={{ background: "#1a1a1a", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#f87171" }}>
                            Kritis (&lt;60%)
                        </p>
                        <p className="text-2xl font-bold" style={{ color: "#f87171" }}>{kritis}</p>
                    </div>

                    {/* Perlu Cek */}
                    <div className="rounded-2xl p-4 space-y-1"
                        style={{ background: "#1a1a1a", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
                            Perlu Cek (60–79%)
                        </p>
                        <p className="text-2xl font-bold" style={{ color: "#fbbf24" }}>{perluCek}</p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#888" }}>
                        <SearchIcon />
                    </span>
                    <input
                        type="text"
                        placeholder="Cari nama file atau template..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl outline-none transition"
                        style={{
                            background: "#1a1a1a",
                            border: "1px solid #2a2a2a",
                            color: "#f5f5f5",
                        }}
                        onFocus={e => { e.target.style.borderColor = "#10b981"; e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.12)"; }}
                        onBlur={e => { e.target.style.borderColor = "#2a2a2a"; e.target.style.boxShadow = "none"; }}
                    />
                </div>

                {/* Table */}
                <div className="rounded-2xl overflow-hidden"
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>

                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3"
                            style={{ color: "#888" }}>
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                style={{ background: "#2a2a2a" }}>
                                <WarningIcon />
                            </div>
                            <p className="text-sm font-medium" style={{ color: "#aaa" }}>
                                {search ? "Tidak ada dokumen yang cocok" : "Tidak ada dokumen dalam antrian validasi"}
                            </p>
                            {!search && (
                                <p className="text-xs" style={{ color: "#666" }}>Semua dokumen sudah divalidasi</p>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Table header */}
                            <div
                                className="grid grid-cols-[1fr_160px_110px_110px_90px] px-6 py-3 text-[10px] font-semibold uppercase tracking-widest"
                                style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", color: "#666" }}
                            >
                                <div>Dokumen</div>
                                <div>Template</div>
                                <div>Kualitas OCR</div>
                                <div>Diunggah</div>
                                <div className="text-center">Aksi</div>
                            </div>

                            {filtered.map((doc, idx) => (
                                <div
                                    key={doc.id}
                                    className="grid grid-cols-[1fr_160px_110px_110px_90px] px-6 py-4 items-center transition-colors"
                                    style={{
                                        borderBottom: idx < filtered.length - 1 ? "1px solid #222" : "none",
                                        cursor: "default",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#222"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                >
                                    {/* Nama file */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                                            style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                                            <FileIcon />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate leading-tight" style={{ color: "#f5f5f5" }}>
                                                {doc.original_name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px]" style={{ color: "#666" }}>
                                                    #{doc.id} · {doc.uploaded_by ?? "—"}
                                                </span>
                                                <UrgencyBadge score={doc.confidence_score} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Template */}
                                    <div className="text-xs truncate pr-3" style={{ color: "#aaa" }}>
                                        {doc.template_name}
                                    </div>

                                    {/* Confidence */}
                                    <div>
                                        <ConfidenceBar score={doc.confidence_score} />
                                    </div>

                                    {/* Tanggal */}
                                    <div className="text-xs leading-tight" style={{ color: "#888" }}>
                                        <p>{doc.processed_at ?? doc.uploaded_at}</p>
                                    </div>

                                    {/* Aksi */}
                                    <div className="flex justify-center">
                                        <Link
                                            href={`/validasi-dokumen/${doc.id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                            style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(16,185,129,0.2)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(16,185,129,0.1)"; }}
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
                    <div className="flex items-center justify-between text-sm" style={{ color: "#888" }}>
                        <span>
                            Halaman {documents.current_page} dari {documents.last_page}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => goToPage(documents.prev_page_url)}
                                disabled={!documents.prev_page_url}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa" }}
                                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#222"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "#1a1a1a"; }}
                            >
                                <ChevronLeftIcon /> Prev
                            </button>
                            <button
                                onClick={() => goToPage(documents.next_page_url)}
                                disabled={!documents.next_page_url}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa" }}
                                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#222"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "#1a1a1a"; }}
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
