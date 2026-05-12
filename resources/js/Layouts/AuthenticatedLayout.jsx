import { useState, useEffect, useRef, createContext, useContext } from "react";
import { Link, usePage, router } from "@inertiajs/react";
import Toast from "../Components/Toast";

// ─────────────────────────────────────────────────────────────────────────────
// THEME CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
const ThemeContext = createContext({ isDark: true });
const useTheme = () => useContext(ThemeContext);

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const tokens = {
    dark: {
        bgMain:      "#0a0a0a",
        bgSidebar:   "#111111",
        bgCard:      "#111111",
        bgHover:     "#1a1a1a",
        bgHoverNav:  "rgba(16,185,129,0.08)",
        border:      "#2a2a2a",
        textPrimary: "#f5f5f5",
        textSecond:  "#888888",
        accent:      "#10b981",
        accentHover: "#059669",
        accentBg:    "rgba(16,185,129,0.12)",
        accentBar:   "#10b981",
        skBase:      "#1e1e1e",
        skHigh:      "#2a2a2a",
        tooltipBg:   "#1a1a1a",
        tooltipBdr:  "#333333",
        dropBg:      "#161616",
        dropBdr:     "#2a2a2a",
        scrollbar:   "#2a2a2a",
    },
    light: {
        bgMain:      "#f8fafc",
        bgSidebar:   "#ffffff",
        bgCard:      "#ffffff",
        bgHover:     "#f1f5f9",
        bgHoverNav:  "rgba(16,185,129,0.06)",
        border:      "#e2e8f0",
        textPrimary: "#0f172a",
        textSecond:  "#64748b",
        accent:      "#10b981",
        accentHover: "#059669",
        accentBg:    "rgba(16,185,129,0.08)",
        accentBar:   "#10b981",
        skBase:      "#e2e8f0",
        skHigh:      "#f1f5f9",
        tooltipBg:   "#0f172a",
        tooltipBdr:  "#1e293b",
        dropBg:      "#ffffff",
        dropBdr:     "#e2e8f0",
        scrollbar:   "#e2e8f0",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// ICONS — Heroicons 2.x outline style
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
    Sun: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    ),
    Moon: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    ),
    Bell: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
    ),
    ChevronLeft: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
    ),
    ChevronRight: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
        </svg>
    ),
    ChevronDown: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
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
    Logout: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
    ),
    Profile: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
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
// SIDEBAR INNER
// ─────────────────────────────────────────────────────────────────────────────
function SidebarInner({ collapsed, setCollapsed, isMobile, setMobileOpen }) {
    const { url, props } = usePage();
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    const user = props.auth?.user;
    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
        : "U";
    const isActive = (href) => url === href || url.startsWith(href + "/");
    const visibleNav = navItems.filter(({ roles }) => !roles || roles.includes(user?.role));

    return (
        <div className="flex flex-col h-full" style={{ color: t.textPrimary }}>

            {/* ── Brand ── */}
            <div
                className="flex items-center h-16 px-4 flex-shrink-0"
                style={{ borderBottom: `1px solid ${t.border}` }}
            >
                {/* Logo mark */}
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

                {/* Brand text */}
                {!collapsed && (
                    <div className="ml-3 min-w-0 overflow-hidden flex-1">
                        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: t.textPrimary, whiteSpace: "nowrap" }}>
                            IDP Lintasarta
                        </p>
                        <p style={{ fontSize: 10, color: t.textSecond, whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            Document Processing
                        </p>
                    </div>
                )}

                {/* Close (mobile) */}
                {isMobile && (
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
            {!collapsed && (
                <div className="px-4 pt-5 pb-1.5 flex-shrink-0">
                    <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textSecond }}>
                        Navigasi
                    </p>
                </div>
            )}

            {/* ── Nav ── */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5"
                style={{ scrollbarWidth: "none" }}>
                {visibleNav.map(({ label, icon: NavIcon, href }) => {
                    const active = isActive(href);
                    return (
                        <div key={href} className="relative group">
                            <Link
                                href={href}
                                className="flex items-center rounded-lg transition-all"
                                style={{
                                    gap: collapsed ? 0 : 10,
                                    padding: collapsed ? "10px 0" : "9px 12px",
                                    justifyContent: collapsed ? "center" : "flex-start",
                                    background: active ? t.accentBg : "transparent",
                                    color: active ? t.accent : t.textSecond,
                                    fontSize: 13,
                                    fontWeight: active ? 600 : 500,
                                    position: "relative",
                                    overflow: "hidden",
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
                                {/* Active left bar */}
                                {active && !collapsed && (
                                    <span
                                        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                                        style={{ width: 3, height: 18, background: t.accentBar }}
                                    />
                                )}
                                <span className="flex-shrink-0" style={{ color: "inherit" }}>
                                    <NavIcon />
                                </span>
                                {!collapsed && (
                                    <span className="truncate" style={{ color: "inherit" }}>{label}</span>
                                )}
                            </Link>

                            {/* Tooltip when collapsed */}
                            {collapsed && (
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

            {/* ── Collapse toggle button (desktop only) ── */}
            {!isMobile && (
                <div
                    className="flex-shrink-0 flex items-center px-2 py-3"
                    style={{ borderTop: `1px solid ${t.border}` }}
                >
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="flex items-center justify-center rounded-lg transition-all w-full"
                        style={{
                            height: 32,
                            color: t.textSecond,
                            background: "transparent",
                            gap: 6,
                            fontSize: 12,
                        }}
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
                        justifyContent: collapsed ? "center" : "flex-start",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                    {/* Avatar */}
                    <div
                        className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
                        style={{
                            width: 32, height: 32,
                            background: t.accent,
                            fontSize: 11,
                            letterSpacing: "0.05em",
                        }}
                    >
                        {initials}
                    </div>
                    {!collapsed && (
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
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────────────────────────────────────
function Topbar({ setMobileOpen, header, isDark, toggleTheme }) {
    const { props } = usePage();
    const t = tokens[isDark ? "dark" : "light"];
    const [dropOpen, setDropOpen] = useState(false);
    const dropRef = useRef(null);
    const user = props.auth?.user;
    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
        : "U";

    useEffect(() => {
        const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const iconBtn = (onClick, title, children, extraStyle = {}) => (
        <button
            onClick={onClick}
            title={title}
            className="relative flex items-center justify-center rounded-lg transition-all"
            style={{ width: 36, height: 36, color: t.textSecond, background: "transparent", ...extraStyle }}
            onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; e.currentTarget.style.color = isDark ? t.accent : t.textPrimary; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textSecond; }}
        >
            {children}
        </button>
    );

    return (
        <header
            className="flex-shrink-0 flex items-center justify-between px-4 md:px-6"
            style={{
                height: 64,
                background: t.bgSidebar,
                borderBottom: `1px solid ${t.border}`,
            }}
        >
            {/* Left */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="flex md:hidden items-center justify-center rounded-lg transition-colors"
                    style={{ width: 36, height: 36, color: t.textSecond }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                    <Icon.Menu />
                </button>
                {header && (
                    <h1 style={{ fontSize: 18, fontWeight: 600, color: t.textPrimary, letterSpacing: "-0.01em" }}>
                        {header}
                    </h1>
                )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-1">
                {/* Theme toggle */}
                {iconBtn(toggleTheme, isDark ? "Switch to light mode" : "Switch to dark mode",
                    <span style={{ transition: "transform 400ms, opacity 400ms", transform: "scale(1)" }}>
                        {isDark ? <Icon.Sun /> : <Icon.Moon />}
                    </span>
                )}

                {/* Bell */}
                <div className="relative">
                    {iconBtn(null, "Notifikasi", <Icon.Bell />)}
                    <span
                        className="absolute rounded-full pointer-events-none"
                        style={{
                            top: 8, right: 8,
                            width: 6, height: 6,
                            background: t.accent,
                            boxShadow: `0 0 0 2px ${t.bgSidebar}`,
                        }}
                    />
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: t.border, margin: "0 6px" }} />

                {/* User dropdown */}
                <div className="relative" ref={dropRef}>
                    <button
                        onClick={() => setDropOpen(!dropOpen)}
                        className="flex items-center rounded-xl transition-colors"
                        style={{
                            gap: 8, padding: "6px 10px 6px 6px",
                            background: dropOpen ? t.bgHover : "transparent",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                        onMouseLeave={e => { if (!dropOpen) e.currentTarget.style.background = "transparent"; }}
                    >
                        <div
                            className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
                            style={{ width: 32, height: 32, background: t.accent, fontSize: 11 }}
                        >
                            {initials}
                        </div>
                        <div className="hidden sm:block text-left">
                            <p style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, lineHeight: 1.3 }}>
                                {user?.name ?? "User"}
                            </p>
                            <p style={{ fontSize: 11, color: t.textSecond, lineHeight: 1.4, textTransform: "capitalize" }}>
                                {user?.role ?? "user"}
                            </p>
                        </div>
                        <span
                            style={{
                                color: t.textSecond,
                                transform: dropOpen ? "rotate(180deg)" : "none",
                                transition: "transform 200ms",
                            }}
                        >
                            <Icon.ChevronDown />
                        </span>
                    </button>

                    {dropOpen && (
                        <div
                            className="absolute right-0 mt-1.5 rounded-xl shadow-2xl overflow-hidden z-50"
                            style={{
                                width: 200,
                                background: t.dropBg,
                                border: `1px solid ${t.dropBdr}`,
                            }}
                        >
                            {/* User info header */}
                            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>
                                    {user?.name ?? "User"}
                                </p>
                                <p style={{ fontSize: 11, color: t.textSecond }}>
                                    {user?.email ?? ""}
                                </p>
                            </div>

                            <div className="py-1">
                                <Link
                                    href="/profile"
                                    onClick={() => setDropOpen(false)}
                                    className="flex items-center transition-colors"
                                    style={{ gap: 8, padding: "9px 16px", color: t.textSecond, fontSize: 13 }}
                                    onMouseEnter={e => { e.currentTarget.style.background = t.bgHover; e.currentTarget.style.color = t.textPrimary; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textSecond; }}
                                >
                                    <Icon.Profile /> Profile
                                </Link>

                                <div style={{ height: 1, background: t.border, margin: "4px 0" }} />

                                <button
                                    onClick={() => router.post("/logout")}
                                    className="w-full flex items-center transition-colors"
                                    style={{ gap: 8, padding: "9px 16px", color: "#ef4444", fontSize: 13 }}
                                    onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(239,68,68,0.1)" : "#fef2f2"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                >
                                    <Icon.Logout /> Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON SYSTEM — 6 variants, theme-aware
// ─────────────────────────────────────────────────────────────────────────────
function Sk({ w, h, rounded = "9999px", style = {} }) {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{
            width: w, height: h,
            borderRadius: rounded,
            background: t.skBase,
            flexShrink: 0,
            ...style,
        }} />
    );
}

function SkCard({ children, style = {} }) {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            overflow: "hidden",
            ...style,
        }}>
            {children}
        </div>
    );
}

function detectSkeletonType(pathname) {
    if (/^\/documents\//.test(pathname))         return "document-detail";
    if (pathname.startsWith("/user-management"))  return "user-management";
    if (/^\/master-template\/.+/.test(pathname)) return "editor";
    if (pathname.startsWith("/master-template"))  return "master-template";
    if (pathname.startsWith("/upload-dokumen"))   return "upload-dokumen";
    if (pathname.startsWith("/validasi-dokumen")) return "table-list";
    return "simple";
}

function SkeletonDocumentDetail() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
            <Sk w={128} h={14} />
            <SkCard>
                <div style={{ padding: "20px 24px", display: "flex", gap: 16 }}>
                    <Sk w={44} h={44} rounded={12} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                        <Sk w="66%" h={14} />
                        <Sk w="33%" h={12} style={{ background: t.skHigh }} />
                    </div>
                    <Sk w={80} h={24} rounded={99} />
                </div>
                <div style={{ padding: "16px 24px 20px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, borderTop: `1px solid ${t.border}` }}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <Sk w={64} h={10} style={{ background: t.skHigh }} />
                            <Sk w="75%" h={14} />
                        </div>
                    ))}
                </div>
            </SkCard>
            <Sk w={210} h={38} rounded={10} />
            <SkCard>
                <div style={{ padding: "20px 24px", background: isDark ? "#1a1a1a" : "#1e293b", display: "flex", flexDirection: "column", gap: 10 }}>
                    <Sk w={80} h={10} style={{ background: isDark ? "#2a2a2a" : "#334155" }} />
                    <Sk w={288} h={20} style={{ background: isDark ? "#333" : "#475569" }} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} style={{ padding: 12, borderRadius: 10, background: t.skHigh, border: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                                <Sk w={56} h={10} />
                                <Sk w={128} h={14} />
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 1, background: t.border }} />
                    <div>
                        <Sk w={112} h={12} style={{ marginBottom: 12 }} />
                        <SkCard>
                            <div style={{ height: 36, background: isDark ? "#1a1a1a" : "#334155" }} />
                            {[...Array(6)].map((_, i) => (
                                <div key={i} style={{ display: "flex", gap: 16, padding: "12px 16px", borderTop: `1px solid ${t.border}`, background: i % 2 === 0 ? "transparent" : t.skHigh }}>
                                    <Sk w={24} h={12} />
                                    <Sk h={12} style={{ flex: 1 }} />
                                    <Sk w={64} h={12} />
                                    <Sk w={48} h={12} />
                                </div>
                            ))}
                        </SkCard>
                    </div>
                </div>
            </SkCard>
        </div>
    );
}

function SkeletonUserManagement() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Sk w={192} h={20} />
                    <Sk w={288} h={12} style={{ background: t.skHigh }} />
                </div>
                <Sk w={144} h={36} rounded={10} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                {[...Array(3)].map((_, i) => (
                    <SkCard key={i} style={{ padding: 20 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <Sk w={96} h={11} style={{ background: t.skHigh }} />
                            <Sk w={56} h={32} />
                            <Sk w={80} h={10} style={{ background: t.skHigh }} />
                        </div>
                    </SkCard>
                ))}
            </div>
            <SkCard style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12 }}>
                    <Sk h={36} rounded={10} style={{ flex: 1, background: t.skHigh }} />
                    <Sk w={112} h={36} rounded={10} style={{ background: t.skHigh }} />
                    <Sk w={112} h={36} rounded={10} style={{ background: t.skHigh }} />
                </div>
            </SkCard>
            <SkCard>
                <div style={{ height: 44, background: t.skHigh, borderBottom: `1px solid ${t.border}` }} />
                {[...Array(6)].map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: i < 5 ? `1px solid ${t.border}` : "none" }}>
                        <Sk w={36} h={36} rounded={99} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <Sk w={160} h={13} />
                            <Sk w={192} h={11} style={{ background: t.skHigh }} />
                        </div>
                        <Sk w={64} h={20} rounded={99} style={{ background: t.skHigh }} />
                        <Sk w={64} h={20} rounded={99} style={{ background: t.skHigh }} />
                        <div style={{ display: "flex", gap: 8 }}>
                            <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                            <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                        </div>
                    </div>
                ))}
            </SkCard>
        </div>
    );
}

function SkeletonMasterTemplate() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    const accentSk = isDark ? "rgba(16,185,129,0.15)" : "#d1fae5";
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Sk w={160} h={20} />
                    <Sk w={224} h={12} style={{ background: t.skHigh }} />
                </div>
                <Sk w={144} h={36} rounded={10} style={{ background: accentSk }} />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
                <SkCard style={{ height: 36, flex: 1 }} />
                <SkCard style={{ height: 36, width: 128 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                {[...Array(6)].map((_, i) => (
                    <SkCard key={i} style={{ padding: 20 }}>
                        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                            <Sk w={40} h={40} rounded={10} style={{ background: t.skHigh }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 2 }}>
                                <Sk w="100%" h={14} />
                                <Sk w="75%" h={12} style={{ background: t.skHigh }} />
                            </div>
                        </div>
                        <div style={{ height: 1, background: t.border, marginBottom: 12 }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Sk w={56} h={20} rounded={99} style={{ background: t.skHigh }} />
                            <div style={{ display: "flex", gap: 8 }}>
                                <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                                <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                            </div>
                        </div>
                    </SkCard>
                ))}
            </div>
        </div>
    );
}

function SkeletonUploadDokumen() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
                borderRadius: 16,
                padding: "48px 24px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                background: t.bgCard,
                border: `2px dashed ${t.border}`,
            }}>
                <Sk w={64} h={64} rounded={16} style={{ background: t.skHigh }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                    <Sk w={192} h={14} />
                    <Sk w={256} h={12} style={{ background: t.skHigh }} />
                </div>
                <Sk w={128} h={36} rounded={10} style={{ background: t.skHigh }} />
            </div>
            <SkCard>
                <div style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${t.border}` }}>
                    <Sk w={144} h={14} />
                    <Sk w={80} h={12} style={{ background: t.skHigh }} />
                </div>
                {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: i < 4 ? `1px solid ${t.border}` : "none" }}>
                        <Sk w={40} h={40} rounded={10} style={{ background: t.skHigh }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <Sk w="75%" h={13} />
                            <Sk w="33%" h={11} style={{ background: t.skHigh }} />
                        </div>
                        <Sk w={80} h={20} rounded={99} style={{ background: t.skHigh }} />
                        <div style={{ width: 96 }}>
                            <Sk w="100%" h={6} rounded={99} style={{ background: t.skHigh, marginBottom: 6 }} />
                            <Sk w={32} h={10} style={{ background: t.skHigh }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                            <Sk w={28} h={28} rounded={8} style={{ background: t.skHigh }} />
                        </div>
                    </div>
                ))}
            </SkCard>
        </div>
    );
}

function SkeletonTableList() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Sk w={176} h={20} />
                <Sk w={128} h={36} rounded={10} style={{ background: t.skHigh }} />
            </div>
            <SkCard>
                <div style={{ padding: "14px 24px", display: "flex", gap: 12, borderBottom: `1px solid ${t.border}` }}>
                    <Sk h={36} rounded={10} style={{ flex: 1, background: t.skHigh }} />
                    <Sk w={112} h={36} rounded={10} style={{ background: t.skHigh }} />
                </div>
                <div style={{ height: 44, background: t.skHigh, borderBottom: `1px solid ${t.border}` }} />
                {[...Array(7)].map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: i < 6 ? `1px solid ${t.border}` : "none" }}>
                        <Sk w={36} h={36} rounded={10} style={{ background: t.skHigh }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <Sk w="66%" h={13} />
                            <Sk w="25%" h={11} style={{ background: t.skHigh }} />
                        </div>
                        <Sk w={96} h={20} rounded={99} style={{ background: t.skHigh }} />
                        <Sk w={56} h={20} rounded={99} style={{ background: t.skHigh }} />
                        <Sk w={64} h={28} rounded={8} style={{ background: t.skHigh }} />
                    </div>
                ))}
            </SkCard>
        </div>
    );
}

function SkeletonSimple() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Sk w={160} h={20} />
                <Sk w={256} h={12} style={{ background: t.skHigh }} />
            </div>
            <SkCard style={{ padding: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Sk w="100%" h={14} />
                    <Sk w="75%" h={14} />
                    <Sk w="50%" h={14} />
                </div>
            </SkCard>
        </div>
    );
}

function SkeletonEditor() {
    const { isDark } = useTheme();
    const t = tokens[isDark ? "dark" : "light"];
    const accentSk = isDark ? "rgba(16,185,129,0.15)" : "#d1fae5";
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Sk w={192} h={20} />
                <div style={{ display: "flex", gap: 8 }}>
                    <Sk w={96} h={36} rounded={10} style={{ background: t.skHigh }} />
                    <Sk w={96} h={36} rounded={10} style={{ background: accentSk }} />
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, height: "calc(100vh - 12rem)" }}>
                <SkCard style={{ padding: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {[...Array(8)].map((_, i) => (
                            <Sk key={i} w="100%" h={40} rounded={10} style={{ background: t.skHigh }} />
                        ))}
                    </div>
                </SkCard>
                <SkCard style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Sk w={256} h={320} rounded={12} style={{ background: t.skHigh }} />
                </SkCard>
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export default function AuthenticatedLayout({ header, children }) {
    const { url } = usePage();

    const [isDark, setIsDark] = useState(() => {
        try { const v = localStorage.getItem("idp-theme"); return v !== null ? v === "dark" : true; }
        catch { return true; }
    });

    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem("idp-sidebar-collapsed") === "true"; }
        catch { return false; }
    });

    const [mobileOpen, setMobileOpen] = useState(false);
    const [skeletonType, setSkeletonType] = useState(null);
    const navigatingRef = useRef(null);

    const t = tokens[isDark ? "dark" : "light"];

    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev;
            try { localStorage.setItem("idp-theme", next ? "dark" : "light"); } catch {}
            return next;
        });
    };

    useEffect(() => {
        try { localStorage.setItem("idp-sidebar-collapsed", String(collapsed)); } catch {}
    }, [collapsed]);

    // Terapkan dark class + background ke <html> dan <body>
    useEffect(() => {
        const bg = isDark ? "#0a0a0a" : "#f8fafc";
        document.documentElement.classList.toggle("dark", isDark);
        document.documentElement.style.background = bg;
        document.body.style.background = bg;
    }, [isDark]);

    useEffect(() => { setMobileOpen(false); }, [url]);

    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") setMobileOpen(false); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    useEffect(() => {
        const removeStart = router.on("start", (event) => {
            const visit = event.detail.visit;
            if (visit.only && visit.only.length > 0) return;
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
        <ThemeContext.Provider value={{ isDark }}>
            {/* Global transition style */}
            <style>{`
                html, body { background: ${t.bgMain} !important; }
                *, *::before, *::after {
                    transition-property: background-color, border-color, color, box-shadow;
                    transition-duration: 200ms;
                    transition-timing-function: ease;
                }
                ::-webkit-scrollbar { width: 4px; height: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: ${t.scrollbar}; border-radius: 4px; }
            `}</style>

            <div
                className="flex h-screen w-screen overflow-hidden"
                style={{ background: t.bgMain, fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
                {/* ── Desktop Sidebar ── */}
                <aside
                    className="hidden md:flex flex-col flex-shrink-0"
                    style={{
                        width: collapsed ? 72 : 260,
                        background: t.bgSidebar,
                        borderRight: `1px solid ${t.border}`,
                        transition: "width 300ms cubic-bezier(0.4,0,0.2,1), background 200ms, border-color 200ms",
                        overflow: "hidden",
                    }}
                >
                    <SidebarInner
                        collapsed={collapsed}
                        setCollapsed={setCollapsed}
                        isMobile={false}
                        setMobileOpen={setMobileOpen}
                    />
                </aside>

                {/* ── Mobile Sidebar ── */}
                {mobileOpen && (
                    <div
                        className="fixed inset-0 z-40 md:hidden"
                        style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
                        onClick={() => setMobileOpen(false)}
                    />
                )}
                <aside
                    className="fixed top-0 left-0 z-50 h-full flex-col md:hidden"
                    style={{
                        width: 280,
                        background: t.bgSidebar,
                        borderRight: `1px solid ${t.border}`,
                        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                        transition: "transform 300ms cubic-bezier(0.4,0,0.2,1)",
                        display: "flex",
                        boxShadow: mobileOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
                    }}
                >
                    <SidebarInner
                        collapsed={false}
                        setCollapsed={setCollapsed}
                        isMobile={true}
                        setMobileOpen={setMobileOpen}
                    />
                </aside>

                {/* ── Main content ── */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <Topbar
                        setMobileOpen={setMobileOpen}
                        header={header}
                        isDark={isDark}
                        toggleTheme={toggleTheme}
                    />
                    <main
                        className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0a0a0a] dark:bg-[#0a0a0a]"
                        style={{ background: t.bgMain }}
                    >
                        {skeletonType
                            ? (() => {
                                const Skel = SKELETON_MAP[skeletonType] ?? SkeletonSimple;
                                return <div className="animate-pulse"><Skel /></div>;
                            })()
                            : children
                        }
                    </main>
                </div>
            </div>

            <Toast />
        </ThemeContext.Provider>
    );
}
