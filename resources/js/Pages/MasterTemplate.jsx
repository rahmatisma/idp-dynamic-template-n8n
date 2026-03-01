import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

const PlusIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);
const SearchIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);
const EditIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);
const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const DocIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

function StatusBadge({ isActive }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
        }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
            {isActive ? "Aktif" : "Nonaktif"}
        </span>
    );
}

export default function MasterTemplate({ templates = [], flash = {} }) {
    const [search, setSearch]           = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [confirmDelete, setConfirmDelete] = useState(null);

    const filtered = templates.filter((t) => {
        const q = search.toLowerCase();
        const matchSearch = t.type_name.toLowerCase().includes(q) || t.template_code.toLowerCase().includes(q);
        const matchStatus =
            filterStatus === "all" ||
            (filterStatus === "active" && t.is_active) ||
            (filterStatus === "inactive" && !t.is_active);
        return matchSearch && matchStatus;
    });

    const handleDelete = () => {
        router.delete(`/master-template/${confirmDelete.id}`, {
            onSuccess: () => setConfirmDelete(null),
        });
    };

    const toggleStatus = (template) => {
        router.patch(`/master-template/${template.id}`, { is_active: !template.is_active });
    };

    return (
        <AuthenticatedLayout header="Master Template">
            <Head title="Master Template" />

            <div className="space-y-5">

                {flash.success && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
                        {flash.success}
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-800">Daftar Template</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Kelola konfigurasi Dynamic Template Mapping untuk setiap jenis dokumen.
                        </p>
                    </div>
                    <Link
                        href="/master-template/create"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition shadow-sm shadow-indigo-200 whitespace-nowrap"
                    >
                        <PlusIcon /> Buat Template
                    </Link>
                </div>

                {/* Search & Filter */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari nama template atau kode…"
                            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                        />
                    </div>
                    <div className="flex gap-2">
                        {[{ key: "all", label: "Semua" }, { key: "active", label: "Aktif" }, { key: "inactive", label: "Nonaktif" }].map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setFilterStatus(key)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                                    filterStatus === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tabel */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <DocIcon />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-slate-600">
                                    {search ? `Tidak ada hasil untuk "${search}"` : "Belum ada template"}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {!search && "Klik 'Buat Template' untuk memulai"}
                                </p>
                            </div>
                            {!search && (
                                <Link href="/master-template/create" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition">
                                    <PlusIcon /> Buat Template Pertama
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/60">
                                        {["Nama Template", "Kode", "Jumlah Field", "Dibuat Oleh", "Tanggal", "Status", "Aksi"].map((h) => (
                                            <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide first:pl-5">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50/60 transition">
                                            <td className="px-5 py-4 font-medium text-slate-800">{t.type_name}</td>
                                            <td className="px-5 py-4">
                                                <code className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{t.template_code}</code>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold">
                                                    {t.field_count}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-slate-600">{t.created_by ?? "-"}</td>
                                            <td className="px-5 py-4 text-slate-500 text-xs">{t.created_at}</td>
                                            <td className="px-5 py-4">
                                                <button onClick={() => toggleStatus(t)}>
                                                    <StatusBadge isActive={t.is_active} />
                                                </button>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/master-template/${t.id}/edit`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
                                                        <EditIcon /> Edit
                                                    </Link>
                                                    <button onClick={() => setConfirmDelete(t)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition">
                                                        <TrashIcon /> Hapus
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

                {filtered.length > 0 && (
                    <p className="text-xs text-slate-400 text-right">
                        Menampilkan {filtered.length} dari {templates.length} template
                    </p>
                )}
            </div>

            {/* Modal Konfirmasi Hapus */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <div>
                            <h3 className="font-semibold text-slate-800">Hapus Template?</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Template <strong>"{confirmDelete.type_name}"</strong> akan dihapus permanen beserta seluruh konfigurasi field-nya.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition">
                                Batal
                            </button>
                            <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition">
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}