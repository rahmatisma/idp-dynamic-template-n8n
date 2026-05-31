import { useState, useRef, useCallback, useEffect } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, useForm, Link, router, usePage } from "@inertiajs/react";
import { supabase } from "@/Config/supabase";

// ── Icons ──────────────────────────────────────────────────────
const UploadCloudIcon = () => (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);
const FileIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
);
const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const EyeIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);
const CheckIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);
const EmptyIcon = () => (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
);

// ── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ── Status Badge ───────────────────────────────────────────────
const STATUS_MAP = {
    queued:          { label: "Antrian",       cls: "bg-blue-50 text-blue-600",        dot: "bg-blue-400" },
    processing:      { label: "Diproses",      cls: "bg-indigo-50 text-indigo-700 border-indigo-100", dot: "bg-indigo-500 animate-pulse" },
    need_validation: { label: "Perlu Validasi",cls: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
    completed:       { label: "Selesai",       cls: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
    failed:          { label: "Gagal",         cls: "bg-red-50 text-red-600",          dot: "bg-red-500" },
    rejected:        { label: "Ditolak",       cls: "bg-rose-50 text-rose-600",        dot: "bg-rose-500" },
};

function StatusBadge({ status }) {
    const s = STATUS_MAP[status] ?? STATUS_MAP.queued;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            {s.label}
        </span>
    );
}

// Badge status file saat memilih
function FileBadge({ status }) {
    const map = {
        idle:      { label: "Siap Upload", cls: "bg-slate-100 text-slate-600" },
        uploading: { label: "Mengupload…", cls: "bg-blue-100 text-blue-600" },
        success:   { label: "Berhasil",    cls: "bg-emerald-100 text-emerald-600" },
        error:     { label: "Gagal",       cls: "bg-red-100 text-red-600" },
    };
    const { label, cls } = map[status] ?? map.idle;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
            {status === "success" && <CheckIcon />}
            {label}
        </span>
    );
}

// ── File Item (di drop zone) ───────────────────────────────────
function FileItem({ file, onRemove }) {
    return (
        <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition group">
            <div className="flex-shrink-0 w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center text-red-400">
                <FileIcon />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>
            </div>
            <FileBadge status="idle" />
            <button
                onClick={() => onRemove(file.name)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
            >
                <TrashIcon />
            </button>
        </div>
    );
}

// ── Confidence Bar ─────────────────────────────────────────────
function ConfidenceBar({ score }) {
    if (score === null || score === undefined) return <span className="text-xs text-slate-300">—</span>;
    const pct = Math.round(score);
    const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-slate-600">{pct}%</span>
        </div>
    );
}

// ── Halaman Utama ──────────────────────────────────────────────
export default function UploadDokumen({ documents: initialDocuments = [], templates: initialTemplates = [], flash = {} }) {
    const { auth } = usePage().props;
    const [documents, setDocuments] = useState(initialDocuments);
    const [templates, setTemplates] = useState(initialTemplates);
    const [files, setFiles]   = useState([]);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });
    const inputRef = useRef(null);


    // ── Auto-Refresh Logic (Polling) ──
    // Karena n8n proses di background, kita cek setiap 4 detik 
    // apakah ada perubahan status atau dokumen baru.
    useEffect(() => {
        const interval = setInterval(() => {
            // Kita cuma reload data 'documents' saja, biar enteng
            router.reload({ 
                only: ['documents'], 
                preserveScroll: true,
                preserveState: true 
            });
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    // Update local state when prop changes
    useEffect(() => {
        setDocuments(initialDocuments);
    }, [initialDocuments]);

    const { data, setData, post, processing, errors, reset } = useForm({
        documents:   [],
        notes:       "",
    });

    const addFiles = useCallback((incoming) => {
        const newFiles = Array.from(incoming).filter(
            (f) => f.type === "application/pdf" && !files.some((ex) => ex.name === f.name)
        );
        if (newFiles.length === 0) return;
        const updated = [...files, ...newFiles];
        setFiles(updated);
        setData("documents", updated);
    }, [files, setData]);

    const removeFile = (name) => {
        const updated = files.filter((f) => f.name !== name);
        setFiles(updated);
        setData("documents", updated);
    };

    const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = ()  => setDragging(false);
    const onDrop      = (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };
    const onFileInput = (e) => addFiles(e.target.files);

    const handleDelete = (id) => {
        setConfirmModal({ isOpen: true, id });
    };

    const confirmDelete = () => {
        const id = confirmModal.id;
        setConfirmModal({ isOpen: false, id: null });
        
        setDeletingId(id);
        router.delete(`/dokumen/${id}`, {
            onSuccess: () => {
                setDeletingId(null);
            },
            onFinish: () => setDeletingId(null)
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (files.length === 0 || processing) return;

        post("/upload-dokumen", {
            onSuccess: () => {
                setFiles([]);
                reset();
            },
        });
    };

    return (
        <AuthenticatedLayout header="Upload Dokumen">
            <Head title="Upload Dokumen" />

            <div className="max-w-4xl mx-auto space-y-6 relative">

                {/* ── Custom Confirmation Modal ── */}
                {confirmModal.isOpen && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-8 text-center">
                                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
                                    <TrashIcon />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Hapus Dokumen?</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Tindakan ini tidak dapat dibatalkan. File dan data ekstraksi akan dihapus permanen.
                                </p>
                            </div>
                            <div className="flex border-t border-slate-800">
                                <button 
                                    onClick={() => setConfirmModal({ isOpen: false, id: null })}
                                    className="flex-1 px-6 py-4 text-sm font-semibold text-slate-400 hover:bg-slate-800 transition border-r border-slate-800"
                                >
                                    Batal
                                </button>
                                <button 
                                    onClick={confirmDelete}
                                    className="flex-1 px-6 py-4 text-sm font-semibold text-red-500 hover:bg-red-500 hover:text-white transition"
                                >
                                    Ya, Hapus
                                </button>
                            </div>
                        </div>\
                    </div>
                )}

                {/* ── Form Upload ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100">
                        <h2 className="text-base font-semibold text-slate-800">Upload Dokumen Teknis</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Upload file PDF dokumen operasional (PM, SPK, Checklist). Sistem akan mengekstraksi informasi secara otomatis.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">

                        {/* Drop Zone */}
                        <div
                            onClick={() => inputRef.current?.click()}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            className={[
                                "cursor-pointer rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4 transition-all duration-200",
                                dragging
                                    ? "border-indigo-500 bg-indigo-50 scale-[1.005]"
                                    : "border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/40",
                            ].join(" ")}
                        >
                            <div className={`transition-colors ${dragging ? "text-indigo-500" : "text-slate-400"}`}>
                                <UploadCloudIcon />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-semibold text-slate-700">
                                    Drag & drop PDF di sini, atau{" "}
                                    <span className="text-indigo-600 underline underline-offset-2">klik untuk pilih</span>
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Hanya file PDF · Maksimal 10 MB per file</p>
                            </div>
                            <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={onFileInput} />
                        </div>

                        {/* List File Dipilih */}
                        {files.length > 0 && (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <p className="text-sm font-semibold text-slate-700">
                                        File dipilih
                                        <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs rounded-full font-medium">
                                            {files.length}
                                        </span>
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => { setFiles([]); setData("documents", []); }}
                                        className="text-xs text-slate-400 hover:text-red-500 transition"
                                    >
                                        Hapus semua
                                    </button>
                                </div>
                                <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                                    {files.map((f) => (
                                        <FileItem key={f.name} file={f} onRemove={removeFile} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Catatan */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-slate-700">
                                Catatan <span className="font-normal text-slate-400">(opsional)</span>
                            </label>
                            <input
                                type="text"
                                value={data.notes}
                                onChange={(e) => setData("notes", e.target.value)}
                                placeholder="Tambahkan keterangan singkat (misal: Lokasi Site, Nama Engineer)..."
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                            />
                        </div>

                        {errors.documents && (
                            <p className="text-sm text-red-500">{errors.documents}</p>
                        )}

                        {/* Tombol */}
                        <div className="flex items-center justify-end gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => { setFiles([]); reset(); }}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
                            >
                                Reset
                            </button>
                            <button
                                type="submit"
                                disabled={files.length === 0 || uploading}
                                className={[
                                    "px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                                    files.length === 0 || uploading
                                        ? "bg-slate-300 cursor-not-allowed"
                                        : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-md shadow-indigo-200",
                                ].join(" ")}
                            >
                                {uploading ? "Mengupload…" : `Upload${files.length > 0 ? ` (${files.length} file)` : ""}`}
                            </button>
                        </div>
                    </form>
                </div>

                {/* ── Tabel Riwayat Dokumen ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-slate-800">Riwayat Upload</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Dokumen yang pernah kamu upload</p>
                        </div>
                        {documents.length > 0 && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                                {documents.length} dokumen
                            </span>
                        )}
                    </div>

                    {documents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <EmptyIcon />
                            </div>
                            <p className="text-sm font-medium text-slate-500">Belum ada dokumen diupload</p>
                            <p className="text-xs text-slate-400">Upload dokumen pertama kamu di atas</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/60">
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Dokumen</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Jenis</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Akurasi OCR</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tanggal Upload</th>
                                        <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {documents.map((doc) => (
                                        <tr key={doc.id} className="hover:bg-slate-50/60 transition group">
                                            {/* Nama Dokumen */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-shrink-0 w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center text-red-400">
                                                        <FileIcon />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-slate-800 truncate max-w-[200px]">{doc.original_name}</p>
                                                        <p className="text-xs text-slate-400 mt-0.5">ID #{doc.id}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Jenis */}
                                            <td className="px-5 py-4 text-slate-600">
                                                {doc.template_name ?? (
                                                    <span className="text-slate-300 italic text-xs">Otomatis</span>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-4">
                                                <StatusBadge status={doc.status} />
                                            </td>

                                            {/* Akurasi OCR */}
                                            <td className="px-5 py-4">
                                                <ConfidenceBar score={doc.confidence_score} />
                                            </td>

                                            {/* Tanggal */}
                                            <td className="px-5 py-4 text-xs text-slate-500">
                                                {doc.uploaded_at}
                                            </td>

                                            {/* Aksi */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    {/* Tombol Detail/Lihat */}
                                                    <Link
                                                        href={`/dokumen/${doc.id}/detail`}
                                                        className={[
                                                            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition",
                                                            doc.status === "completed"
                                                                ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                                                : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                                                        ].join(" ")}
                                                        title="Lihat Hasil Ekstraksi"
                                                    >
                                                        <EyeIcon />
                                                        <span className="hidden sm:inline">Detail</span>
                                                    </Link>

                                                    {/* Tombol Hapus */}
                                                    <button
                                                        onClick={() => handleDelete(doc.id, doc.file_path)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                                                        title="Hapus Dokumen"
                                                    >
                                                        <TrashIcon />
                                                        <span className="hidden sm:inline">Hapus</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}