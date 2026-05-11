import { useState, useEffect, useRef } from "react";
import { Link, usePage, router } from "@inertiajs/react";
import Toast from "../Components/Toast";

// ─────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────
const Icons = {
    Dashboard: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
    ),
    Validasi: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    Template: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
    ),
    Users: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    Upload: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
    ),
    ChevronLeft: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
    ),
    Menu: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    ),
    Close: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
    Bell: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
    ),
    ChevronDown: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    ),
    Logout: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
    ),
    Profile: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    ),
};

// ─────────────────────────────────────────────
// NAV ITEMS
// ─────────────────────────────────────────────
const navItems = [
    { label: "Dashboard", icon: Icons.Dashboard, href: "/dashboard" },
    { label: "Upload Dokumen", icon: Icons.Upload, href: "/upload-dokumen" },
    { label: "Validasi Dokumen", icon: Icons.Validasi, href: "/validasi-dokumen" },
    { label: "Master Template", icon: Icons.Template, href: "/master-template" },
    { label: "User Management", icon: Icons.Users, href: "/user-management", roles: ["admin"] },
];

// ─────────────────────────────────────────────
// SIDEBAR INNER — dipakai oleh desktop & mobile
// ─────────────────────────────────────────────
function SidebarInner({ collapsed, setCollapsed, isMobile, setMobileOpen }) {
    const { url, props } = usePage();
    const user = props.auth?.user;
    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
        : "U";

    const isActive = (href) => url === href || url.startsWith(href + "/");

    // Filter menu berdasarkan role user
    const visibleNav = navItems.filter(
        ({ roles }) => !roles || roles.includes(user?.role)
    );

    return (
        <div className="flex flex-col h-full">
            {/* ── Brand ── */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/5 flex-shrink-0">
                {!collapsed && (
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <span className="font-bold text-white text-base tracking-tight whitespace-nowrap">
                            DocSystem
                        </span>
                    </div>
                )}

                {/* Collapse button (desktop) */}
                {!isMobile && (
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? "Expand" : "Collapse"}
                        className={[
                            "flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition flex-shrink-0",
                            collapsed ? "mx-auto" : "",
                        ].join(" ")}
                    >
                        <span className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
                            <Icons.ChevronLeft />
                        </span>
                    </button>
                )}

                {/* Close button (mobile) */}
                {isMobile && (
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition flex-shrink-0"
                    >
                        <Icons.Close />
                    </button>
                )}
            </div>

            {/* ── Section label ── */}
            {!collapsed && (
                <div className="px-4 pt-5 pb-1 flex-shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Menu Utama
                    </p>
                </div>
            )}

            {/* ── Nav ── */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
                {visibleNav.map(({ label, icon: Icon, href }) => {
                    const active = isActive(href);
                    return (
                        <div key={href} className="relative group">
                            <Link
                                href={href}
                                className={[
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                                    active
                                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/40"
                                        : "text-slate-400 hover:text-white hover:bg-white/[0.08]",
                                    collapsed ? "justify-center px-0" : "",
                                ].join(" ")}
                            >
                                {active && !collapsed && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/40 rounded-r-full" />
                                )}
                                <span className="flex-shrink-0"><Icon /></span>
                                {!collapsed && (
                                    <span className="whitespace-nowrap truncate">{label}</span>
                                )}
                            </Link>

                            {/* Tooltip saat collapsed */}
                            {collapsed && (
                                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[999] hidden group-hover:block">
                                    <div className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap">
                                        {label}
                                        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* ── User footer ── */}
            <div className="border-t border-white/5 p-3 flex-shrink-0">
                <Link
                    href="/profile"
                    className={[
                        "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.08] transition",
                        collapsed ? "justify-center" : "",
                    ].join(" ")}
                >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow-md">
                        {initials}
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm font-semibold text-white truncate leading-tight">
                                {user?.name ?? "User"}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                                {user?.email ?? ""}
                            </p>
                        </div>
                    )}
                </Link>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────
function Topbar({ setMobileOpen, header }) {
    const { props } = usePage();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const user = props.auth?.user;
    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
        : "U";

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <header className="flex-shrink-0 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-slate-200/70 shadow-sm">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="flex md:hidden items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                >
                    <Icons.Menu />
                </button>
                {header && (
                    <div className="text-slate-700 font-semibold text-base">{header}</div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {/* Bell */}
                <button className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                    <Icons.Bell />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                </button>

                {/* User dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {initials}
                        </div>
                        <div className="hidden sm:block text-left">
                            <p className="text-sm font-semibold text-slate-800 leading-tight">
                                {user?.name ?? "User"}
                            </p>
                            <p className="text-[11px] text-slate-400 leading-tight">
                                {user?.email ?? ""}
                            </p>
                        </div>
                        <span className={`text-slate-400 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}>
                            <Icons.ChevronDown />
                        </span>
                    </button>

                    {dropdownOpen && (
                        <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50">
                            <Link
                                href="/profile"
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition"
                                onClick={() => setDropdownOpen(false)}
                            >
                                <Icons.Profile />
                                Profile
                            </Link>
                            <hr className="my-1 border-slate-100" />
                            <button
                                onClick={() => router.post("/logout")}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition"
                            >
                                <Icons.Logout />
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────
// SKELETON SYSTEM
// ─────────────────────────────────────────────
function Sk({ className }) {
    return <div className={`bg-slate-200 rounded-full ${className}`} />;
}

// Deteksi jenis skeleton dari URL tujuan
function detectSkeletonType(pathname) {
    if (/^\/documents\//.test(pathname))        return "document-detail";
    if (pathname.startsWith("/user-management")) return "user-management";
    if (/^\/master-template\/.+/.test(pathname))return "editor";
    if (pathname.startsWith("/master-template")) return "master-template";
    if (pathname.startsWith("/upload-dokumen"))  return "upload-dokumen";
    if (pathname.startsWith("/validasi-dokumen"))return "table-list";
    return "simple";
}

// ── Skeleton: Document Detail ─────────────────
function SkeletonDocumentDetail() {
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
            <Sk className="h-4 w-32" />
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 flex items-start gap-4">
                    <div className="w-11 h-11 bg-slate-100 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2.5 pt-1">
                        <Sk className="h-4 w-2/3" />
                        <Sk className="h-3 w-1/3 bg-slate-100" />
                    </div>
                    <div className="h-6 w-20 bg-slate-100 rounded-full flex-shrink-0" />
                </div>
                <div className="px-6 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="space-y-2">
                            <Sk className="h-2 w-16 bg-slate-100" />
                            <Sk className="h-4 w-3/4" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="h-10 w-52 bg-slate-100 rounded-xl" />
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-800 px-6 py-5 space-y-2.5">
                    <Sk className="h-2.5 w-20 bg-slate-700" />
                    <Sk className="h-5 w-72 bg-slate-600" />
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                                <Sk className="h-2 w-14" />
                                <Sk className="h-4 w-32" />
                            </div>
                        ))}
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div>
                        <Sk className="h-2.5 w-28 mb-3" />
                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="h-9 bg-slate-700" />
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className={`flex gap-4 px-4 py-3 border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                                    <Sk className="h-3 w-6 flex-shrink-0" />
                                    <Sk className="h-3 flex-1" />
                                    <Sk className="h-3 w-16 flex-shrink-0" />
                                    <Sk className="h-3 w-12 flex-shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Skeleton: User Management ─────────────────
function SkeletonUserManagement() {
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Sk className="h-5 w-48" />
                    <Sk className="h-3 w-72 bg-slate-100" />
                </div>
                <div className="h-9 w-36 bg-slate-100 rounded-xl" />
            </div>
            <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
                        <Sk className="h-2.5 w-24 bg-slate-100" />
                        <Sk className="h-8 w-14" />
                        <Sk className="h-2 w-20 bg-slate-100" />
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-3">
                <div className="h-9 flex-1 bg-slate-100 rounded-xl" />
                <div className="h-9 w-28 bg-slate-100 rounded-xl" />
                <div className="h-9 w-28 bg-slate-100 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-11 bg-slate-50 border-b border-slate-100" />
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0">
                        <div className="w-9 h-9 bg-slate-200 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                            <Sk className="h-3.5 w-40" />
                            <Sk className="h-2.5 w-48 bg-slate-100" />
                        </div>
                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                        <div className="flex gap-2">
                            <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                            <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Skeleton: Master Template list ───────────
function SkeletonMasterTemplate() {
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Sk className="h-5 w-40" />
                    <Sk className="h-3 w-56 bg-slate-100" />
                </div>
                <div className="h-9 w-36 bg-indigo-100 rounded-xl" />
            </div>
            <div className="flex gap-3">
                <div className="h-9 flex-1 bg-white border border-slate-200 rounded-xl" />
                <div className="h-9 w-32 bg-white border border-slate-200 rounded-xl" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0" />
                            <div className="flex-1 space-y-2 pt-0.5">
                                <Sk className="h-4 w-full" />
                                <Sk className="h-3 w-3/4 bg-slate-100" />
                            </div>
                        </div>
                        <div className="h-px bg-slate-100" />
                        <div className="flex items-center justify-between">
                            <div className="h-5 w-14 bg-slate-100 rounded-full" />
                            <div className="flex gap-2">
                                <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                                <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Skeleton: Upload Dokumen ──────────────────
function SkeletonUploadDokumen() {
    return (
        <div className="space-y-5">
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl" />
                <div className="space-y-2 text-center">
                    <Sk className="h-4 w-48 mx-auto" />
                    <Sk className="h-3 w-64 mx-auto bg-slate-100" />
                </div>
                <div className="h-9 w-32 bg-slate-100 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <Sk className="h-4 w-36" />
                    <Sk className="h-3 w-20 bg-slate-100" />
                </div>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                            <Sk className="h-3.5 w-3/4" />
                            <Sk className="h-2.5 w-1/3 bg-slate-100" />
                        </div>
                        <div className="h-5 w-20 bg-slate-100 rounded-full" />
                        <div className="w-24 space-y-1.5">
                            <div className="h-1.5 bg-slate-100 rounded-full w-full" />
                            <Sk className="h-2.5 w-8 bg-slate-100" />
                        </div>
                        <div className="flex gap-2">
                            <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                            <div className="h-7 w-7 bg-slate-100 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Skeleton: Table list (validasi, dll) ──────
function SkeletonTableList() {
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <Sk className="h-5 w-44" />
                <div className="h-9 w-32 bg-slate-100 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex gap-3">
                    <div className="h-9 flex-1 bg-slate-100 rounded-xl" />
                    <div className="h-9 w-28 bg-slate-100 rounded-xl" />
                </div>
                <div className="h-11 bg-slate-50 border-b border-slate-100" />
                {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                            <Sk className="h-3.5 w-2/3" />
                            <Sk className="h-2.5 w-1/4 bg-slate-100" />
                        </div>
                        <div className="h-5 w-24 bg-slate-100 rounded-full" />
                        <div className="h-5 w-14 bg-slate-100 rounded-full" />
                        <div className="h-7 w-16 bg-slate-100 rounded-lg" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Skeleton: Simple (dashboard, profile, dll) ─
function SkeletonSimple() {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Sk className="h-5 w-40" />
                <Sk className="h-3 w-64 bg-slate-100" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <Sk className="h-4 w-full" />
                <Sk className="h-4 w-3/4" />
                <Sk className="h-4 w-1/2" />
            </div>
        </div>
    );
}

// ── Skeleton: Editor (template editor) ────────
function SkeletonEditor() {
    return (
        <div className="space-y-4 h-full">
            <div className="flex items-center justify-between">
                <Sk className="h-5 w-48" />
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-slate-100 rounded-xl" />
                    <div className="h-9 w-24 bg-indigo-100 rounded-xl" />
                </div>
            </div>
            <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-12rem)]">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-10 bg-slate-100 rounded-xl" />
                    ))}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center">
                    <div className="w-64 h-80 bg-slate-100 rounded-xl" />
                </div>
            </div>
        </div>
    );
}

const SKELETON_MAP = {
    "document-detail": SkeletonDocumentDetail,
    "user-management": SkeletonUserManagement,
    "master-template": SkeletonMasterTemplate,
    "upload-dokumen":  SkeletonUploadDokumen,
    "table-list":      SkeletonTableList,
    "editor":          SkeletonEditor,
    "simple":          SkeletonSimple,
};

// ─────────────────────────────────────────────
// MAIN LAYOUT
// ─────────────────────────────────────────────
export default function AuthenticatedLayout({ header, children }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [skeletonType, setSkeletonType] = useState(null);
    const navigatingRef = useRef(null);
    const { url } = usePage();

    useEffect(() => { setMobileOpen(false); }, [url]);
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") setMobileOpen(false); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        const removeStart = router.on("start", (event) => {
            const visit = event.detail.visit;

            // Skip skeleton untuk partial reload (auto-refresh polling, filter, dsb)
            if (visit.only && visit.only.length > 0) return;
            // Skip skeleton untuk navigasi ke URL yang sama (refresh manual)
            if (visit.url.pathname === window.location.pathname
                && visit.url.search === window.location.search) return;

            const type = detectSkeletonType(visit.url.pathname);
            navigatingRef.current = setTimeout(() => setSkeletonType(type), 200);
        });
        const removeFinish = router.on("finish", () => {
            clearTimeout(navigatingRef.current);
            setSkeletonType(null);
        });
        return () => { removeStart(); removeFinish(); };
    }, []);

    return (
        <>
            <link
                href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
                rel="stylesheet"
            />

            {/*
             * KEY FIX:
             * - w-screen + overflow-hidden → tidak ada scroll horizontal sama sekali
             * - Sidebar desktop = flex child biasa (bukan fixed/absolute)
             *   sehingga lebar sidebar langsung menggeser konten, bukan menimpa
             * - transition-[width] di sidebar → animasi collapse smooth
             */}
            <div
                className="flex h-screen w-screen overflow-hidden bg-slate-50"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
                {/* ─── Desktop Sidebar (flex child) ─── */}
                <aside
                    className={[
                        "hidden md:flex flex-col flex-shrink-0 bg-[#0f172a] text-white overflow-hidden",
                        "transition-[width] duration-300 ease-in-out",
                        collapsed ? "w-[70px]" : "w-64",
                    ].join(" ")}
                >
                    <SidebarInner
                        collapsed={collapsed}
                        setCollapsed={setCollapsed}
                        isMobile={false}
                        setMobileOpen={setMobileOpen}
                    />
                </aside>

                {/* ─── Mobile Sidebar (fixed drawer) ─── */}
                <>
                    {mobileOpen && (
                        <div
                            className="fixed inset-0 z-40 bg-black/50 md:hidden"
                            onClick={() => setMobileOpen(false)}
                        />
                    )}
                    <aside
                        className={[
                            "fixed top-0 left-0 z-50 h-full w-72 flex flex-col bg-[#0f172a] text-white shadow-2xl md:hidden",
                            "transition-transform duration-300 ease-in-out",
                            mobileOpen ? "translate-x-0" : "-translate-x-full",
                        ].join(" ")}
                    >
                        <SidebarInner
                            collapsed={false}
                            setCollapsed={setCollapsed}
                            isMobile={true}
                            setMobileOpen={setMobileOpen}
                        />
                    </aside>
                </>

                {/* ─── Konten kanan ─── */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <Topbar setMobileOpen={setMobileOpen} header={header} />
                    <main className="flex-1 overflow-y-auto p-4 md:p-6">
                        {skeletonType
                            ? (() => { const Skel = SKELETON_MAP[skeletonType] ?? SkeletonSimple; return <div className="animate-pulse"><Skel /></div>; })()
                            : children
                        }
                    </main>
                </div>
            </div>
            <Toast />
        </>
    );
}