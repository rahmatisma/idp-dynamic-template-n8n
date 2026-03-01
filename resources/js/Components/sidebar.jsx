import { useState, useEffect } from "react";
import { Link, usePage } from "@inertiajs/react";

// Icons
const Icons = {
    Dashboard: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
    ),
    Validasi: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    Template: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
    ),
    Users: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    Upload: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
    ),
    ChevronLeft: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
    ),
    Menu: () => (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    ),
    Close: () => (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
};

const navItems = [
    { label: "Dashboard", icon: Icons.Dashboard, href: "/dashboard" },
    { label: "Validasi Dokumen", icon: Icons.Validasi, href: "/validasi-dokumen" },
    { label: "Master Template", icon: Icons.Template, href: "/master-template" },
    { label: "User Management", icon: Icons.Users, href: "/user-management" },
    { label: "Upload Dokumen", icon: Icons.Upload, href: "/upload-dokumen" },
];

export default function Sidebar() {
    const { url } = usePage();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [url]);

    // Close on ESC key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") setMobileOpen(false);
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    const isActive = (href) => url === href || url.startsWith(href + "/");

    return (
        <>
            {/* ─── Mobile Topbar Toggle ─── */}
            <div className="fixed top-0 left-0 z-50 flex items-center gap-3 px-4 h-16 bg-white border-b border-slate-200 w-full md:hidden">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                >
                    <Icons.Menu />
                </button>
                <span className="font-bold text-slate-800 text-lg tracking-tight">DocSystem</span>
            </div>

            {/* ─── Mobile Overlay ─── */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ─── Sidebar ─── */}
            <aside
                className={[
                    "fixed top-0 left-0 z-50 h-full flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out",
                    // Desktop
                    "md:relative md:translate-x-0",
                    collapsed ? "md:w-[72px]" : "md:w-64",
                    // Mobile
                    mobileOpen ? "translate-x-0 w-72" : "-translate-x-full w-72",
                ].join(" ")}
            >
                {/* Logo */}
                <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/60">
                    {!collapsed && (
                        <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap overflow-hidden">
                            DocSystem
                        </span>
                    )}
                    {/* Desktop collapse button */}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className={[
                            "hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition",
                            collapsed ? "mx-auto" : "ml-auto",
                        ].join(" ")}
                    >
                        <span
                            className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
                        >
                            <Icons.ChevronLeft />
                        </span>
                    </button>
                    {/* Mobile close button */}
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="flex md:hidden ml-auto items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                    >
                        <Icons.Close />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                    {navItems.map(({ label, icon: Icon, href }) => {
                        const active = isActive(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={[
                                    "group flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150",
                                    active
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                    collapsed ? "md:justify-center" : "",
                                ].join(" ")}
                                title={collapsed ? label : undefined}
                            >
                                <span className="flex-shrink-0">
                                    <Icon />
                                </span>
                                {/* Label — hidden when collapsed on desktop */}
                                <span
                                    className={[
                                        "whitespace-nowrap transition-all duration-300",
                                        collapsed ? "md:hidden" : "",
                                    ].join(" ")}
                                >
                                    {label}
                                </span>

                                {/* Tooltip saat collapsed */}
                                {collapsed && (
                                    <span className="hidden md:group-hover:flex absolute left-[72px] bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap border border-slate-700 pointer-events-none z-50">
                                        {label}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer / User Info */}
                <div className="border-t border-slate-700/60 p-3">
                    <div
                        className={[
                            "flex items-center gap-3 px-2 py-2",
                            collapsed ? "md:justify-center" : "",
                        ].join(" ")}
                    >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white uppercase">
                            U
                        </div>
                        {!collapsed && (
                            <div className="overflow-hidden">
                                <p className="text-sm font-semibold text-white truncate">User</p>
                                <p className="text-xs text-slate-400 truncate">user@email.com</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Spacer untuk mobile topbar */}
            <div className="h-16 md:hidden" />
        </>
    );
}