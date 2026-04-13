import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div className="flex" style={{ height: '100vh', overflow: 'hidden' }}>
            {/* ── Left branding panel ── */}
            <div className="relative hidden lg:flex lg:w-3/5 flex-col items-center justify-center overflow-hidden"
                 style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 45%, #1e40af 100%)', flexShrink: 0 }}>

                {/* Decorative background circles */}
                <div style={{
                    position: 'absolute', top: '-80px', left: '-80px',
                    width: '400px', height: '400px', borderRadius: '50%',
                    background: 'rgba(59,130,246,0.15)', filter: 'blur(60px)',
                    animation: 'pulse 6s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-120px', right: '-60px',
                    width: '500px', height: '500px', borderRadius: '50%',
                    background: 'rgba(99,102,241,0.2)', filter: 'blur(80px)',
                    animation: 'pulse 8s ease-in-out infinite reverse',
                }} />
                <div style={{
                    position: 'absolute', top: '50%', left: '60%',
                    width: '250px', height: '250px', borderRadius: '50%',
                    background: 'rgba(16,185,129,0.1)', filter: 'blur(50px)',
                    animation: 'pulse 5s ease-in-out infinite',
                }} />

                {/* Grid pattern overlay */}
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.04,
                    backgroundImage: `linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                }} />

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center text-center px-12">
                    {/* Logo */}
                    <Link href="/" className="mb-8 block">
                        <div style={{
                            width: '80px', height: '80px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '20px',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                        }}>
                            <ApplicationLogo style={{ width: '50px', height: '50px', fill: '#fff' }} />
                        </div>
                    </Link>

                    {/* Brand name */}
                    <h1 style={{
                        fontSize: '2rem', fontWeight: '700', color: '#fff',
                        letterSpacing: '-0.02em', marginBottom: '8px',
                        textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    }}>
                        IDP Lintasarta
                    </h1>
                    <p style={{
                        fontSize: '0.95rem', color: 'rgba(148,196,255,0.85)',
                        fontWeight: '400', marginBottom: '48px',
                        letterSpacing: '0.02em',
                    }}>
                        Intelligent Document Processing
                    </p>

                    {/* Feature list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', maxWidth: '340px' }}>
                        {[
                            { icon: '⚡', title: 'Pemrosesan Cepat', desc: 'Otomasi dokumen skala enterprise secara real-time' },
                            { icon: '🔒', title: 'Keamanan Tinggi', desc: 'Enkripsi end-to-end untuk setiap dokumen Anda' },
                            { icon: '📊', title: 'Laporan Akurat', desc: 'Data ekstraksi dengan tingkat presisi tinggi' },
                        ].map((f) => (
                            <div key={f.title} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '14px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px', padding: '14px 16px',
                                backdropFilter: 'blur(4px)',
                                textAlign: 'left',
                            }}>
                                <span style={{ fontSize: '1.25rem', marginTop: '1px', flexShrink: 0 }}>{f.icon}</span>
                                <div>
                                    <p style={{ color: '#fff', fontWeight: '600', fontSize: '0.9rem', marginBottom: '2px' }}>{f.title}</p>
                                    <p style={{ color: 'rgba(148,196,255,0.75)', fontSize: '0.8rem', lineHeight: '1.4' }}>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom copyright */}
                <p style={{
                    position: 'absolute', bottom: '24px',
                    color: 'rgba(148,163,184,0.6)', fontSize: '0.75rem',
                }}>
                    © {new Date().getFullYear()} Lintasarta. All rights reserved.
                </p>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex flex-1 flex-col items-center px-6 lg:px-16 guest-form-panel"
                 style={{
                     background: '#f8fafc',
                     overflowY: 'auto',
                     height: '100%',
                     justifyContent: 'flex-start',
                     paddingTop: '40px',
                     paddingBottom: '40px',
                 }}>
                {/* Mobile logo */}
                <div className="lg:hidden mb-6">
                    <Link href="/">
                        <ApplicationLogo style={{ width: '48px', height: '48px', fill: '#1e40af' }} />
                    </Link>
                </div>

                <div style={{
                    width: '100%', maxWidth: '420px',
                    background: '#fff',
                    borderRadius: '20px',
                    boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
                    padding: '40px 36px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    flexShrink: 0,
                }}>
                    {children}
                </div>

                <p className="mt-6 text-xs text-slate-400">
                    Secure connection · Powered by Lintasarta IDP
                </p>
            </div>

            {/* Global pulse animation */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.08); opacity: 0.8; }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                /* Pastikan html & body tidak punya scroll */
                html, body, #app {
                    height: 100%;
                    overflow: hidden;
                }
                /* Di layar besar, form panel center secara vertikal */
                @media (min-width: 1024px) {
                    .guest-form-panel {
                        justify-content: center !important;
                    }
                }
                /* Sembunyikan scrollbar visual di panel form (scroll tetap bisa) */
                .guest-form-panel::-webkit-scrollbar { display: none; }
                .guest-form-panel { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
