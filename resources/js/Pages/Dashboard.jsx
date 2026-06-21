import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link } from "@inertiajs/react";

// ── Konfigurasi tampilan per status ───────────────────────────────────
// label = teks badge, badge = warna Tailwind badge, bar = warna segmen distribusi
const STATUS_META = {
    queued:          { label: "Queued",          badge: "bg-gray-100 text-gray-700",  bar: "bg-gray-400" },
    processing:      { label: "Processing",      badge: "bg-blue-100 text-blue-700",  bar: "bg-blue-500" },
    completed:       { label: "Completed",       badge: "bg-green-100 text-green-700", bar: "bg-green-500" },
    need_validation: { label: "Need Validation", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
    failed:          { label: "Failed",          badge: "bg-red-100 text-red-700",     bar: "bg-red-500" },
    rejected:        { label: "Rejected",        badge: "bg-rose-100 text-rose-700",   bar: "bg-rose-500" },
};

const metaFor = (status) =>
    STATUS_META[status] ?? { label: status, badge: "bg-gray-100 text-gray-700", bar: "bg-gray-400" };

// Format detik → "1m 5s" / "42s" / "—"
function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
}

// ── Kartu statistik ────────────────────────────────────────────────────
function StatCard({ label, value, accent = "text-gray-900" }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
        </div>
    );
}

// ── Badge status ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const meta = metaFor(status);
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
            {meta.label}
        </span>
    );
}

// ── Visual distribusi status (segmented bar native — tanpa library chart) ─
function StatusDistribution({ statusCounts, total }) {
    const entries = Object.entries(statusCounts).filter(([, n]) => n > 0);

    if (total === 0) {
        return <p className="text-sm text-gray-500">Belum ada dokumen.</p>;
    }

    return (
        <div>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
                {entries.map(([status, n]) => (
                    <div
                        key={status}
                        className={metaFor(status).bar}
                        style={{ width: `${(n / total) * 100}%` }}
                        title={`${metaFor(status).label}: ${n}`}
                    />
                ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(statusCounts).map(([status, n]) => (
                    <li key={status} className="flex items-center gap-2 text-sm">
                        <span className={`h-2.5 w-2.5 rounded-full ${metaFor(status).bar}`} />
                        <span className="text-gray-600">{metaFor(status).label}</span>
                        <span className="ml-auto font-semibold text-gray-900">{n}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Dashboard({
    totalDocuments = 0,
    statusCounts = {},
    successRate = null,
    rejectedCount = 0,
    rejectionRate = null,
    avgLatencySeconds = null,
    latencySampleCount = 0,
    recentDocuments = [],
}) {
    return (
        <AuthenticatedLayout header="Dashboard">
            <Head title="Dashboard" />

            <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
                {/* Kartu statistik */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Total Dokumen" value={totalDocuments} />
                    <StatCard label="Selesai (Completed)" value={statusCounts.completed ?? 0} accent="text-green-600" />
                    <StatCard label="Perlu Validasi" value={statusCounts.need_validation ?? 0} accent="text-amber-600" />
                    <StatCard label="Gagal (Failed)" value={statusCounts.failed ?? 0} accent="text-red-600" />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Distribusi status */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                        <h2 className="mb-4 text-base font-semibold text-gray-900">Distribusi Status</h2>
                        <StatusDistribution statusCounts={statusCounts} total={totalDocuments} />
                    </div>

                    {/* Ringkasan kinerja */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="mb-4 text-base font-semibold text-gray-900">Ringkasan Kinerja</h2>
                        <dl className="space-y-4">
                            <div>
                                <dt className="text-sm text-gray-500">Success Rate Pipeline</dt>
                                <dd className="text-2xl font-bold text-gray-900">
                                    {successRate === null ? "—" : `${successRate}%`}
                                </dd>
                                <p className="mt-1 text-xs text-gray-400">
                                    (completed + need_validation) &divide; (completed + need_validation + failed).
                                    Rejected tidak dihitung.
                                </p>
                            </div>
                            <div>
                                <dt className="text-sm text-gray-500">Rata-rata Durasi Proses</dt>
                                <dd className="text-2xl font-bold text-gray-900">
                                    {formatDuration(avgLatencySeconds)}
                                </dd>
                                <p className="mt-1 text-xs text-gray-400">
                                    dari {latencySampleCount} dokumen dengan timestamp lengkap
                                </p>
                            </div>
                            {/* Metrik kualitas input — TERPISAH dari success rate pipeline */}
                            <div className="border-t border-gray-100 pt-4">
                                <dt className="text-sm text-gray-500">Ditolak (Rejected)</dt>
                                <dd className="text-2xl font-bold text-rose-600">
                                    {rejectedCount}
                                    {rejectionRate !== null && (
                                        <span className="ml-1 text-base font-medium text-gray-400">
                                            ({rejectionRate}%)
                                        </span>
                                    )}
                                </dd>
                                <p className="mt-1 text-xs text-gray-400">
                                    Metrik kualitas input (ditolak manusia), bukan kegagalan pipeline.
                                </p>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Tabel dokumen terbaru */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-6 py-4">
                        <h2 className="text-base font-semibold text-gray-900">Dokumen Terbaru</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">Nama File</th>
                                    <th className="px-6 py-3">Template</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3">Durasi</th>
                                    <th className="px-6 py-3">Diunggah</th>
                                    <th className="px-6 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentDocuments.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            Belum ada dokumen.
                                        </td>
                                    </tr>
                                ) : (
                                    recentDocuments.map((doc) => {
                                        // need_validation → halaman validasi detail; selain itu → detail dokumen
                                        const actionHref =
                                            doc.status === "need_validation"
                                                ? route("validasi-dokumen.show", doc.id)
                                                : route("documents.detail", doc.id);
                                        const actionLabel =
                                            doc.status === "need_validation" ? "Validasi" : "Detail";

                                        return (
                                            <tr key={doc.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-3 font-medium text-gray-900">
                                                    {doc.original_name}
                                                </td>
                                                <td className="px-6 py-3 text-gray-600">
                                                    {doc.template_name ?? "—"}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <StatusBadge status={doc.status} />
                                                </td>
                                                <td className="px-6 py-3 text-gray-600">
                                                    {formatDuration(doc.duration_seconds)}
                                                </td>
                                                <td className="px-6 py-3 text-gray-600">
                                                    {doc.created_at ?? "—"}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <Link
                                                        href={actionHref}
                                                        className="font-medium text-indigo-600 hover:text-indigo-800"
                                                    >
                                                        {actionLabel}
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
