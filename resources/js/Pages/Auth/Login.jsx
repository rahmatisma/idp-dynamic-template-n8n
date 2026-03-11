import InputError from '@/Components/InputError';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

// ── Icon components ────────────────────────────────────────────────
function IconEmail() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
            viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
        </svg>
    );
}

function IconLock() {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
            viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    );
}

function IconSpinner() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ animation: 'spin 0.8s linear infinite' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
    );
}

// ── Input field with icon ──────────────────────────────────────────
function IconInput({ id, type, name, value, onChange, placeholder, Icon, autoComplete, autoFocus }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                color: '#94a3b8', pointerEvents: 'none', display: 'flex',
            }}>
                <Icon />
            </span>
            <input
                id={id}
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete={autoComplete}
                autoFocus={autoFocus}
                required
                style={{
                    width: '100%', boxSizing: 'border-box',
                    paddingLeft: '44px', paddingRight: '14px',
                    paddingTop: '13px', paddingBottom: '13px',
                    borderRadius: '10px',
                    border: '1.5px solid #e2e8f0',
                    fontSize: '0.9rem', color: '#0f172a',
                    background: '#f8fafc',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                }}
                onFocus={e => {
                    e.target.style.borderColor = '#3b82f6';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
                    e.target.style.background = '#fff';
                }}
                onBlur={e => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = '#f8fafc';
                }}
            />
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────
export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('login'), { onFinish: () => reset('password') });
    };

    return (
        <GuestLayout>
            <Head title="Log in" />

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(18px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .login-form-wrapper { animation: fadeSlideUp 0.45s ease both; }
            `}</style>

            <div className="login-form-wrapper">
                {/* Header */}
                <div style={{ marginBottom: '28px' }}>
                    <h2 style={{
                        fontSize: '1.6rem', fontWeight: '700',
                        color: '#0f172a', letterSpacing: '-0.03em', marginBottom: '6px',
                    }}>
                        Selamat datang 👋
                    </h2>
                    <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
                        Silakan masuk ke akun Anda untuk melanjutkan.
                    </p>
                </div>

                {/* Status message */}
                {status && (
                    <div style={{
                        marginBottom: '18px', padding: '10px 14px',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        borderRadius: '8px', color: '#15803d', fontSize: '0.85rem',
                    }}>
                        {status}
                    </div>
                )}

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Email */}
                    <div>
                        <label htmlFor="email" style={{
                            display: 'block', marginBottom: '6px',
                            fontSize: '0.82rem', fontWeight: '600', color: '#374151',
                        }}>
                            Alamat Email
                        </label>
                        <IconInput
                            id="email" type="email" name="email"
                            value={data.email}
                            onChange={e => setData('email', e.target.value)}
                            placeholder="nama@perusahaan.com"
                            autoComplete="username"
                            autoFocus
                            Icon={IconEmail}
                        />
                        <InputError message={errors.email} className="mt-1" />
                    </div>

                    {/* Password */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label htmlFor="password" style={{
                                fontSize: '0.82rem', fontWeight: '600', color: '#374151',
                            }}>
                                Kata Sandi
                            </label>
                            {canResetPassword && (
                                <Link
                                    href={route('password.request')}
                                    style={{
                                        fontSize: '0.78rem', color: '#3b82f6',
                                        textDecoration: 'none', fontWeight: '500',
                                    }}
                                    onMouseEnter={e => e.target.style.color = '#1d4ed8'}
                                    onMouseLeave={e => e.target.style.color = '#3b82f6'}
                                >
                                    Lupa kata sandi?
                                </Link>
                            )}
                        </div>
                        <IconInput
                            id="password" type="password" name="password"
                            value={data.password}
                            onChange={e => setData('password', e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            Icon={IconLock}
                        />
                        <InputError message={errors.password} className="mt-1" />
                    </div>

                    {/* Remember me */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <input
                                type="checkbox"
                                name="remember"
                                checked={data.remember}
                                onChange={e => setData('remember', e.target.checked)}
                                style={{
                                    width: '16px', height: '16px', cursor: 'pointer',
                                    accentColor: '#3b82f6',
                                }}
                            />
                        </div>
                        <span style={{ fontSize: '0.83rem', color: '#64748b', userSelect: 'none' }}>
                            Ingat saya di perangkat ini
                        </span>
                    </label>

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={processing}
                        style={{
                            width: '100%', padding: '13px',
                            borderRadius: '10px', border: 'none',
                            background: processing
                                ? 'linear-gradient(135deg, #93c5fd, #818cf8)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
                            color: '#fff', fontWeight: '600',
                            fontSize: '0.95rem', cursor: processing ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: processing ? 'none' : '0 4px 14px rgba(59,130,246,0.4)',
                            transition: 'transform 0.15s, box-shadow 0.15s, background 0.2s',
                            letterSpacing: '0.01em',
                        }}
                        onMouseEnter={e => {
                            if (!processing) {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.5)';
                            }
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = processing ? 'none' : '0 4px 14px rgba(59,130,246,0.4)';
                        }}
                    >
                        {processing ? (
                            <>
                                <IconSpinner />
                                Memproses...
                            </>
                        ) : (
                            'Masuk ke Akun'
                        )}
                    </button>
                </form>
            </div>
        </GuestLayout>
    );
}
