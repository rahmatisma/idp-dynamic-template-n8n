import { useState, useEffect } from "react";
import { Link, usePage } from "@inertiajs/react";

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — mirrors AuthenticatedLayout for consistency
// ─────────────────────────────────────────────────────────────────────────────
const tokens = {
    dark: {
        bgSidebar:   "#111111",
        bgHover:     "#1a1a1a",
        bgHoverNav:  "rgba(16,185,129,0.08)",
        border:      "#2a2a2a",
        textPrimary: "#f5f5f5",
        textSecond:  "#888888",
        accent:      "#10b981",
        accentBg:    "rgba(16,185,129,0.12)",
        accentBar:   "#10b981",
        topbarBg:    "#111111",
        tooltipBg:   "#1a1a1a",
        tooltipBdr:  "#333333",
        scrollbar:   "#2a2a2a",
    },
    light: {
        bgSidebar:   "#ffffff",
        bgHover:     "#f1f5f9",
        bgHoverNav:  "rgba(16,185,129,0.06)",
        border:      "#e2e8f0",
        textPrimary: "#0f172a",
        textSecond:  "#64748b",
        accent:      "#10b981",
        accentBg:    "rgba(16,185,129,0.08)",
        accentBar:   "#10b981",
        topbarBg:    "#ffffff",
        tooltipBg:   "#0f172a",
        tooltipBdr:  "#1e293b",
        scrollbar:   "#e2e8f0",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Icon = {
    Home: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
    ),
    Upload: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
    ),
    Clipboard: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="m9 12 2 2 4-4"/>
        </svg>
    ),
    Template: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
        </svg>
    ),
    Users: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    ),
    ChevronLeft: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
    ),
    Menu: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
    ),
    Close: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    ),
    Doc: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
        </svg>
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// NAV ITEMS
// ─────────────────────────────────────────────────────────────────────────────
const navItems = [
    { label: "Dashboard",        icon: Icon.Home,      href: "/dashboard" },
    { label: "Upload Dokumen",   icon: Icon.Upload,    href: "/upload-dokumen" },
    { label: "Validasi Dokumen", icon: Icon.Clipboard, href: "/validasi-dokumen" },
    { label: "Master Template",  icon: Icon.Template,  href: "/master-template" },
    { label: "User Management",  icon: Icon.Users,     href: "/user-management", roles: ["admin"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Sidebar() {
    const { url, props } = usePage();
    const user = props.auth?.user;

    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem("idp-sidebar-collapsed") === "true"; }
        catch { return false; }
    });

    const [mobileOpen, setMobileOpen] = useState(false);

    const [isDark, setIsDark] = useState(() => {
        try { const v = localStorage.getItem("idp-theme"); return v !== null ? v === "dark" : true; }
        catch { return true; }
    });

    const t = tokens[isDark ? "dark" : "light"];

    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
        : "U";

    const isActive = (href) => url === href || url.startsWith(href + "/");

    const visibleNav = navItems.filter(({ roles }) => !roles || roles.includes(user?.role));

    useEffect(() => {
        try { localStorage.setItem("idp-sidebar-collapsed", String(collapsed)); } catch {}
    }, [collapsed]);

    useEffect(() => { setMobileOpen(false); }, [url]);

    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") setMobileOpen(false); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    // Sync theme changes from other tabs / AuthenticatedLayout
    useEffect(() => {
        const h = () => {
            try {
                const v = localStorage.getItem("idp-theme");
                setIsDark(v !== null ? v === "dark" : true);
            } catch {}
        };
        window.addEventListener("storage", h);
        return () => window.removeEventListener("storage", h);
    }, []);

    const sidebarContent = (isDrawer = false) => (
        <div className="flex flex-col h-full" style={{ color: t.textPrimary }}>

            {/* ── Brand ── */}
            <div
                className="flex items-center h-16 px-4 flex-shrink-0"
                style={{ borderBottom: `1px solid ${t.border}` }}
            >
                <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg"
                    style={{
                        width: 32, height: 32,
                        background: t.accent,
                        color: "#fff",
                        boxShadow: `0 0 12px ${t.accent}55`,
                    }}
                >
                    <Icon.Doc />
                </div>

                {(!collapsed || isDrawer) && (
                    <div className="ml-3 min-w-0 overflow-hidden flex-1">
                        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: t.textPrimary, whiteSpace: "nowrap" }}>
                            IDP Lintasarta
                        </p>
                        <p style={{ fontSize: 10, color: t.textSecond, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            Document Processing
                        </p>
                    </div>
                )}

                {/* Close (mobile drawer) */}
                {isDrawer && (
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="ml-auto flex items-center justify-center rounded-lg transition-colors"
                        style={{ width: 30, height: 30, color: t.textSecond }}
                        onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; e.currentTarget.style.color = t.textPrimary; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textSecond; }}
                    >
                        <Icon.Close />
                    </button>
                )}
            </div>

            {/* ── Section label ── */}
            {(!collapsed || isDrawer) && (
                <div className="px-4 pt-5 pb-1.5 flex-shrink-0">
                    <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textSecond }}>
                        Navigasi
                    </p>
                </div>
            )}

            {/* ── Nav ── */}
            <nav
                className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5"
                style={{ scrollbarWidth: "none" }}
            >
                {visibleNav.map(({ label, icon: NavIcon, href }) => {
                    const active = isActive(href);
                    const isCollapsed = collapsed && !isDrawer;
                    return (
                        <div key={href} className="relative group">
                            <Link
                                href={href}
                                className="flex items-center rounded-lg transition-all"
                                style={{
                                    gap: isCollapsed ? 0 : 10,
                                    padding: isCollapsed ? "10px 0" : "9px 12px",
                                    justifyContent: isCollapsed ? "center" : "flex-start",
                                    background: active ? t.accentBg : "transparent",
                                    color: active ? t.accent : t.textSecond,
                                    fontSize: 13,
                                    fontWeight: active ? 600 : 500,
                                    position: "relative",
                                }}
                                onMouseEnter={e => {
                                    if (!active) {
                                        e.currentTarget.style.background = t.bgHoverNav;
                                        e.currentTarget.style.color = t.textPrimary;
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!active) {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = t.textSecond;
                                    }
                                }}
                            >
                                {active && !isCollapsed && (
                                    <span
                                        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                                        style={{ width: 3, height: 18, background: t.accentBar }}
                                    />
                                )}
                                <span className="flex-shrink-0"><NavIcon /></span>
                                {!isCollapsed && (
                                    <span className="truncate">{label}</span>
                                )}
                            </Link>

                            {/* Tooltip when collapsed (desktop) */}
                            {isCollapsed && (
                                <div
                                    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[9999] hidden group-hover:block"
                                    style={{ whiteSpace: "nowrap" }}
                                >
                                    <div
                                        className="text-xs px-3 py-1.5 rounded-lg shadow-xl"
                                        style={{
                                            background: t.tooltipBg,
                                            color: "#f5f5f5",
                                            border: `1px solid ${t.tooltipBdr}`,
                                            fontSize: 12,
                                        }}
                                    >
                                        {label}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* ── Collapse toggle (desktop only) ── */}
            {!isDrawer && (
                <div
                    className="flex-shrink-0 flex items-center px-2 py-3"
                    style={{ borderTop: `1px solid ${t.border}` }}
                >
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="flex items-center justify-center rounded-lg transition-all w-full"
                        style={{ height: 32, color: t.textSecond, background: "transparent", gap: 6, fontSize: 12 }}
                        onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; e.currentTarget.style.color = t.textPrimary; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textSecond; }}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 300ms" }}>
                            <Icon.ChevronLeft />
                        </span>
                        {!collapsed && <span style={{ fontWeight: 500 }}>Tutup panel</span>}
                    </button>
                </div>
            )}

            {/* ── User footer ── */}
            <div
                className="flex-shrink-0 p-3"
                style={{ borderTop: `1px solid ${t.border}` }}
            >
                <Link
                    href="/profile"
                    className="flex items-center rounded-lg transition-colors"
                    style={{
                        gap: 10,
                        padding: "8px 10px",
                        justifyContent: (collapsed && !isDrawer) ? "center" : "flex-start",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                    <div
                        className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
                        style={{ width: 32, height: 32, background: t.accent, fontSize: 11, letterSpacing: "0.05em" }}
                    >
                        {initials}
                    </div>
                    {(!collapsed || isDrawer) && (
                        <div className="flex-1 min-w-0">
                            <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, lineHeight: 1.3 }}>
                                {user?.name ?? "User"}
                            </p>
                            <p className="truncate capitalize" style={{ fontSize: 11, color: t.textSecond, lineHeight: 1.4 }}>
                                {user?.role ?? "user"}
                            </p>
                        </div>
                    )}
                </Link>
            </div>
        </div>
    );

    return (
        <>
            <style>{`
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: ${t.scrollbar}; border-radius: 4px; }
            `}</style>

            {/* ── Mobile Topbar ── */}
            <div
                className="fixed top-0 left-0 z-50 flex items-center gap-3 px-4 w-full md:hidden"
                style={{ height: 64, background: t.topbarBg, borderBottom: `1px solid ${t.border}` }}
            >
                <button
                    onClick={() => setMobileOpen(true)}
                    className="flex items-center justify-center rounded-lg transition-colors"
                    style={{ width: 36, height: 36, color: t.textSecond }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                    <Icon.Menu />
                </button>
                <div className="flex items-center gap-2.5">
                    <div
                        className="flex items-center justify-center rounded-lg"
                        style={{ width: 28, height: 28, background: t.accent, color: "#fff" }}
                    >
                        <Icon.Doc />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: t.textPrimary, letterSpacing: "-0.01em" }}>
                        IDP Lintasarta
                    </span>
                </div>
            </div>

            {/* ── Mobile Overlay ── */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 md:hidden"
                    style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ── Mobile Drawer ── */}
            <aside
                className="fixed top-0 left-0 z-50 h-full md:hidden"
                style={{
                    width: 280,
                    background: t.bgSidebar,
                    borderRight: `1px solid ${t.border}`,
                    transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform 300ms cubic-bezier(0.4,0,0.2,1), background 200ms, border-color 200ms",
                    boxShadow: mobileOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
                }}
            >
                {sidebarContent(true)}
            </aside>

            {/* ── Desktop Sidebar ── */}
            <aside
                className="hidden md:flex flex-col flex-shrink-0"
                style={{
                    width: collapsed ? 72 : 260,
                    background: t.bgSidebar,
                    borderRight: `1px solid ${t.border}`,
                    transition: "width 300ms cubic-bezier(0.4,0,0.2,1), background 200ms, border-color 200ms",
                    overflow: "hidden",
                    height: "100vh",
                    position: "sticky",
                    top: 0,
                }}
            >
                {sidebarContent(false)}
            </aside>

            {/* Mobile topbar spacer */}
            <div className="h-16 md:hidden" />
        </>
    );
}
