import { useState } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, usePage } from "@inertiajs/react";
import {
    ComposedChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

// ── Tab navigasi (sama persis dengan Dashboard.jsx) ───────────────────
const DASHBOARD_TABS = [
    { label: "Ringkasan Dokumen",  href: "/dashboard" },
    { label: "Monitoring Baterai", href: "/dashboard/baterai" },
];

function DashboardTabs() {
    const { url } = usePage();
    const active = url.startsWith("/dashboard/baterai") ? "/dashboard/baterai" : "/dashboard";
    return (
        <div className="border-b border-gray-200">
            <nav className="-mb-px flex gap-1">
                {DASHBOARD_TABS.map(({ label, href }) => {
                    const isActive = active === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={[
                                "inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                                isActive
                                    ? "border-indigo-600 text-indigo-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                            ].join(" ")}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}

// ── Threshold baterai (formulir PT Lintasarta FM-LAP-D2-SOP-003-010) ─
// Ubah di sini jika standar berubah; logika badge & garis chart ikut otomatis.
const VOLTAGE_THRESHOLD = 12;  // VDC/Battery minimum
const SOH_THRESHOLD     = 80;  // SOH % minimum

/**
 * Status perlu monitoring HANYA jika KEDUA kondisi terpenuhi (AND).
 * Sumber: "Standard min 12 VDC/Battery" DAN "Standard SOH 80%" di formulir.
 */
function needsAlert(voltage, soh) {
    return voltage < VOLTAGE_THRESHOLD && soh < SOH_THRESHOLD;
}

// ── Badge status ───────────────────────────────────────────────────────
function StatusBadge({ voltage, soh }) {
    if (needsAlert(voltage, soh)) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                ⚠️ Perlu Monitoring
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            Normal
        </span>
    );
}

// ── Tooltip kustom Recharts ────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-sm">
            <p className="mb-1.5 font-semibold text-gray-800">{label}</p>
            {payload.map((entry) => (
                <p key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name}: <span className="font-bold">{entry.value}</span>
                    {entry.dataKey === "voltage" ? " V" : " %"}
                </p>
            ))}
        </div>
    );
}

// ── Halaman utama ─────────────────────────────────────────────────────
export default function BatteryMonitoring({ sites = [], banks = [], chartData = {}, summary = [] }) {
    const [selectedSite, setSelectedSite] = useState(sites[0] ?? "");
    const [selectedBank, setSelectedBank] = useState(banks[0] ?? "");

    const bankInfo = chartData[selectedSite]?.[selectedBank];
    const series   = bankInfo?.series ?? [];
    const latest   = series[series.length - 1];

    return (
        <AuthenticatedLayout header="Dashboard">
            <Head title="Monitoring Baterai" />

            <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">

                {/* Tab navigasi */}
                <DashboardTabs />

                {/* ── Banner data dummy ── */}
                <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5">
                    <span className="text-lg">⚠️</span>
                    <div>
                        <p className="text-sm font-semibold text-amber-800">
                            Data contoh — belum terhubung ke hasil ekstraksi OCR asli
                        </p>
                        <p className="mt-0.5 text-xs text-amber-700">
                            Data ini dibuat statis untuk keperluan prototype tampilan.
                            Nilai SOH dan Voltage dari dokumen <strong>FM-LAP-D2-SOP-003-010</strong> belum
                            divalidasi akurasi ekstrkasinya, sehingga belum dipakai di sini.
                        </p>
                    </div>
                </div>

                {/* ── Filter ── */}
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Site / Lokasi</label>
                        <select
                            value={selectedSite}
                            onChange={(e) => setSelectedSite(e.target.value)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            {sites.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Bank Baterai</label>
                        <select
                            value={selectedBank}
                            onChange={(e) => setSelectedBank(e.target.value)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            {banks.map((b) => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Panel chart ── */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

                    {/* Header panel + badge status */}
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">
                                Tren Voltage & SOH — {selectedSite} · {selectedBank}
                            </h2>
                            {bankInfo && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                    {bankInfo.battery_type} · {bankInfo.battery_brand}
                                </p>
                            )}
                        </div>

                        {/* Badge status berdasarkan titik data TERBARU */}
                        {latest && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                    Status terkini ({latest.month}):
                                </span>
                                <StatusBadge voltage={latest.voltage} soh={latest.soh} />
                            </div>
                        )}
                    </div>

                    {/* Keterangan threshold */}
                    <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-blue-400" />
                            Batas minimum voltage: {VOLTAGE_THRESHOLD} V
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-green-500" />
                            Batas minimum SOH: {SOH_THRESHOLD}%
                        </span>
                        <span className="text-gray-400">(Standar PT Lintasarta FM-LAP-D2-SOP-003-010)</span>
                    </div>

                    {series.length === 0 ? (
                        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                            Tidak ada data untuk kombinasi site & bank ini.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={320}>
                            <ComposedChart data={series} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 12, fill: "#6b7280" }}
                                    axisLine={{ stroke: "#e5e7eb" }}
                                    tickLine={false}
                                />

                                {/* Sumbu Y kiri: Voltage */}
                                <YAxis
                                    yAxisId="voltage"
                                    orientation="left"
                                    domain={["auto", "auto"]}
                                    tick={{ fontSize: 12, fill: "#3b82f6" }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `${v}V`}
                                    width={48}
                                />

                                {/* Sumbu Y kanan: SOH */}
                                <YAxis
                                    yAxisId="soh"
                                    orientation="right"
                                    domain={[0, 100]}
                                    tick={{ fontSize: 12, fill: "#10b981" }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `${v}%`}
                                    width={44}
                                />

                                <Tooltip content={<ChartTooltip />} />
                                <Legend
                                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                                    formatter={(value) =>
                                        value === "voltage" ? "Voltage (V)" : "SOH (%)"
                                    }
                                />

                                {/* Garis threshold Voltage (sumbu kiri) */}
                                <ReferenceLine
                                    yAxisId="voltage"
                                    y={VOLTAGE_THRESHOLD}
                                    stroke="#3b82f6"
                                    strokeDasharray="5 4"
                                    strokeWidth={1.5}
                                    label={false}
                                />

                                {/* Garis threshold SOH (sumbu kanan) — TERPISAH dari voltage */}
                                <ReferenceLine
                                    yAxisId="soh"
                                    y={SOH_THRESHOLD}
                                    stroke="#10b981"
                                    strokeDasharray="5 4"
                                    strokeWidth={1.5}
                                    label={false}
                                />

                                <Line
                                    yAxisId="voltage"
                                    type="monotone"
                                    dataKey="voltage"
                                    name="voltage"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    yAxisId="soh"
                                    type="monotone"
                                    dataKey="soh"
                                    name="soh"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* ── Tabel ringkasan per Bank ── */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-6 py-4">
                        <h2 className="text-base font-semibold text-gray-900">Ringkasan Semua Bank</h2>
                        <p className="mt-0.5 text-xs text-gray-500">
                            Nilai terbaru (Oktober) — data contoh, belum dari OCR
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">Site</th>
                                    <th className="px-6 py-3">Bank</th>
                                    <th className="px-6 py-3">Tipe Baterai</th>
                                    <th className="px-6 py-3">Merk</th>
                                    <th className="px-6 py-3">Voltage Terakhir</th>
                                    <th className="px-6 py-3">SOH Terakhir</th>
                                    <th className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {summary.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        className="hover:bg-gray-50 cursor-pointer"
                                        onClick={() => {
                                            setSelectedSite(row.site);
                                            setSelectedBank(row.bank);
                                            window.scrollTo({ top: 0, behavior: "smooth" });
                                        }}
                                    >
                                        <td className="px-6 py-3 text-gray-700">{row.site}</td>
                                        <td className="px-6 py-3 font-medium text-gray-900">{row.bank}</td>
                                        <td className="px-6 py-3 text-gray-600">{row.battery_type}</td>
                                        <td className="px-6 py-3 text-gray-600">{row.battery_brand}</td>
                                        <td className="px-6 py-3 font-mono text-blue-700">
                                            {row.voltage} V
                                        </td>
                                        <td className="px-6 py-3 font-mono text-emerald-700">
                                            {row.soh}%
                                        </td>
                                        <td className="px-6 py-3">
                                            <StatusBadge voltage={row.voltage} soh={row.soh} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </AuthenticatedLayout>
    );
}
