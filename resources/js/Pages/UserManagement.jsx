import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, router, usePage } from "@inertiajs/react";

// ── Icons ─────────────────────────────────────────────────────────
const SearchIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);
const CheckIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);
const BanIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
);
const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const UsersIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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

// ── Role badge ────────────────────────────────────────────────────
const ROLE_STYLES = {
    admin: "bg-violet-50 text-violet-700 border border-violet-200",
    manager: "bg-blue-50  text-blue-700  border border-blue-200",
    engineer: "bg-slate-100 text-slate-600 border border-slate-200",
    operator: "bg-amber-50 text-amber-700 border border-amber-200",
};
const ROLE_LABELS = {
    admin: "Admin",
    manager: "Manager",
    engineer: "Engineer",
    operator: "Operator",
};

function RoleBadge({ role }) {
    const cls = ROLE_STYLES[role] ?? ROLE_STYLES.engineer;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
            {ROLE_LABELS[role] ?? role}
        </span>
    );
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ active }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${active ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-400"}`} />
            {active ? "Aktif" : "Nonaktif"}
        </span>
    );
}

// ── Avatar initials ───────────────────────────────────────────────
const AVATAR_COLORS = [
    "from-violet-500 to-indigo-500",
    "from-blue-500   to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-pink-500   to-rose-500",
];
function Avatar({ name, id }) {
    const initials = name
        .split(" ").slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");
    const color = AVATAR_COLORS[id % AVATAR_COLORS.length];
    return (
        <div className={`flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
            {initials}
        </div>
    );
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, colorClass }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────
export default function UserManagement({ users, filters = {}, flash = {} }) {
    const [search, setSearch] = useState(filters.search ?? "");
    const [roleFilter, setRole] = useState(filters.role ?? "all");
    const [statusFilter, setStatus] = useState(filters.status ?? "all");
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmToggle, setConfirmToggle] = useState(null);

    // Apply filters to server
    const applyFilters = (overrides = {}) => {
        router.get(
            "/user-management",
            { search, role: roleFilter, status: statusFilter, ...overrides },
            { preserveState: true, replace: true }
        );
    };

    const handleSearchKey = (e) => {
        if (e.key === "Enter") applyFilters({ search: e.target.value });
    };

    const handleDelete = () => {
        router.delete(`/user-management/${confirmDelete.id}`, {
            onSuccess: () => setConfirmDelete(null),
        });
    };

    const handleToggle = () => {
        const url = confirmToggle.is_active
            ? `/user-management/${confirmToggle.id}/reject`
            : `/user-management/${confirmToggle.id}/approve`;
        router.patch(url, {}, { onSuccess: () => setConfirmToggle(null) });
    };

    // Stats derived from paginated data (current page indicator)
    const totalUsers = users.total;
    const activeUsers = users.data.filter((u) => u.is_active).length;
    const newUsers = users.data.filter((u) => !u.is_active).length;

    return (
        <AuthenticatedLayout header="User Management">
            <Head title="User Management" />

            <div className="space-y-5">

                {/* Flash */}
                {flash.success && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                        <CheckIcon /> {flash.success}
                    </div>
                )}
                {flash.error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                        {flash.error}
                    </div>
                )}

                {/* Page header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-800">Manajemen Pengguna</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Kelola akun, peran, dan status aktif seluruh pengguna sistem.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-xl">
                        <UsersIcon />
                        <span><strong className="text-slate-700">{totalUsers}</strong> Total Pengguna</span>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard label="Total Pengguna" value={users.total} sub="Terdaftar di sistem" colorClass="text-slate-800" />
                    <StatCard label="Aktif" value={users.data.filter(u => u.is_active).length} sub="Halaman ini" colorClass="text-emerald-600" />
                    <StatCard label="Nonaktif" value={users.data.filter(u => !u.is_active).length} sub="Halaman ini" colorClass="text-red-500" />
                    <StatCard label="Halaman" value={`${users.current_page} / ${users.last_page}`} sub={`${users.per_page} per halaman`} colorClass="text-indigo-600" />
                </div>

                {/* Search & Filter bar */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleSearchKey}
                            onBlur={() => applyFilters({ search })}
                            placeholder="Cari nama atau email… (Enter untuk cari)"
                            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                        />
                    </div>

                    {/* Role filter */}
                    <select
                        value={roleFilter}
                        onChange={(e) => { setRole(e.target.value); applyFilters({ role: e.target.value }); }}
                        className="py-2.5 pl-3 pr-8 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition text-slate-600 bg-white"
                    >
                        <option value="all">Semua Peran</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="engineer">Engineer</option>
                        <option value="operator">Operator</option>
                    </select>

                    {/* Status filter */}
                    <div className="flex gap-2">
                        {[{ k: "all", l: "Semua" }, { k: "active", l: "Aktif" }, { k: "inactive", l: "Nonaktif" }].map(({ k, l }) => (
                            <button
                                key={k}
                                onClick={() => { setStatus(k); applyFilters({ status: k }); }}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${statusFilter === k ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {users.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <UsersIcon />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-slate-600">Tidak ada pengguna ditemukan</p>
                                <p className="text-xs text-slate-400 mt-1">Coba ubah filter atau kata pencarian</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/60">
                                        {["Pengguna", "Email", "Peran", "Status", "Bergabung", "Aksi"].map((h) => (
                                            <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {users.data.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50/70 transition group">
                                            {/* Name + Avatar */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.name} id={user.id} />
                                                    <div>
                                                        <p className="font-semibold text-slate-800 leading-tight">{user.name}</p>
                                                        <p className="text-xs text-slate-400">ID #{user.id}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Email */}
                                            <td className="px-5 py-4 text-slate-600">{user.email}</td>

                                            {/* Role */}
                                            <td className="px-5 py-4"><RoleBadge role={user.role} /></td>

                                            {/* Status */}
                                            <td className="px-5 py-4"><StatusBadge active={user.is_active} /></td>

                                            {/* Joined */}
                                            <td className="px-5 py-4 text-slate-400 text-xs whitespace-nowrap">{user.joined_at}</td>

                                            {/* Actions */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition">
                                                    {/* Toggle aktif/nonaktif */}
                                                    <button
                                                        onClick={() => setConfirmToggle(user)}
                                                        title={user.is_active ? "Nonaktifkan" : "Aktifkan"}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${user.is_active
                                                                ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                                                                : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                                            }`}
                                                    >
                                                        {user.is_active ? <BanIcon /> : <CheckIcon />}
                                                        {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                                                    </button>

                                                    {/* Hapus */}
                                                    <button
                                                        onClick={() => setConfirmDelete(user)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition"
                                                    >
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

                {/* Pagination */}
                {users.last_page > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Menampilkan {users.from}–{users.to} dari {users.total} pengguna
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={!users.prev_page_url}
                                onClick={() => router.get(users.prev_page_url)}
                                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                <ChevronLeftIcon />
                            </button>

                            {/* Page numbers */}
                            {Array.from({ length: users.last_page }, (_, i) => i + 1)
                                .filter(p => Math.abs(p - users.current_page) <= 2 || p === 1 || p === users.last_page)
                                .reduce((acc, p, idx, arr) => {
                                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) =>
                                    p === "..." ? (
                                        <span key={`e${i}`} className="px-2 text-slate-400 text-sm">…</span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => router.get(`/user-management?page=${p}&search=${search}&role=${roleFilter}&status=${statusFilter}`)}
                                            className={`w-9 h-9 rounded-xl text-sm font-medium transition ${p === users.current_page
                                                    ? "bg-indigo-600 text-white shadow-sm"
                                                    : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )
                            }

                            <button
                                disabled={!users.next_page_url}
                                onClick={() => router.get(users.next_page_url)}
                                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                <ChevronRightIcon />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Modal: Konfirmasi Toggle Status ── */}
            {confirmToggle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
                        <div>
                            <h3 className="font-semibold text-slate-800 text-base">
                                {confirmToggle.is_active ? "Nonaktifkan" : "Aktifkan"} Pengguna?
                            </h3>
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                                {confirmToggle.is_active
                                    ? <>Akun <strong>{confirmToggle.name}</strong> akan dinonaktifkan dan tidak bisa login.</>
                                    : <>Akun <strong>{confirmToggle.name}</strong> akan diaktifkan dan bisa login kembali.</>
                                }
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmToggle(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleToggle}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition ${confirmToggle.is_active
                                        ? "bg-amber-500 hover:bg-amber-600"
                                        : "bg-emerald-500 hover:bg-emerald-600"
                                    }`}
                            >
                                {confirmToggle.is_active ? "Ya, Nonaktifkan" : "Ya, Aktifkan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Konfirmasi Hapus ── */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
                        <div>
                            <h3 className="font-semibold text-slate-800 text-base">Hapus Pengguna?</h3>
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                                Akun <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) akan dihapus permanen dari sistem. Tindakan ini tidak dapat dibatalkan.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition"
                            >
                                Ya, Hapus Permanen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
