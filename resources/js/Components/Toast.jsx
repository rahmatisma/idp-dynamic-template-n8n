import React, { useEffect, useState } from 'react';
import { usePage, router } from '@inertiajs/react';

export default function Toast() {
    const { props } = usePage();
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [type, setType] = useState('success');

    // Fungsi untuk munculin toast
    const show = (msg, msgType = 'success') => {
        if (!msg) return;
        setVisible(false);
        setTimeout(() => {
            setMessage(msg);
            setType(msgType);
            setVisible(true);
        }, 100);

        setTimeout(() => setVisible(false), 3500);
    };

    // Pantau flash message berdasarkan timestamp unik
    useEffect(() => {
        const flash = props.flash || {};
        // HANYA muncul kalau ada timestamp (artinya ada aksi baru)
        if (flash.timestamp && (flash.success || flash.error)) {
            show(flash.success || flash.error, flash.success ? 'success' : 'error');
        }
    }, [props.flash?.timestamp]); 

    return (
        <div 
            className={`fixed top-10 right-10 z-[1000000] transition-all duration-700 ease-in-out transform ${
                visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-[-20px] opacity-0 scale-95 pointer-events-none'
            }`}
        >
            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-md ${
                type === 'success' 
                    ? 'bg-slate-900/95 border-emerald-500/30 text-white shadow-emerald-500/10' 
                    : 'bg-red-950/95 border-red-500/30 text-white shadow-red-500/10'
            }`}>
                
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                    {type === 'success' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                </div>

                <div className="flex flex-col min-w-[140px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-0.5">
                        {type === 'success' ? 'Notifikasi Sistem' : 'Pesan Error'}
                    </span>
                    <p className="text-sm font-semibold tracking-tight leading-tight">{message}</p>
                </div>

                <button 
                    onClick={() => setVisible(false)}
                    className="ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Garis Progress di bawah */}
                <div className="absolute bottom-0 left-0 h-1 w-full bg-white/5 overflow-hidden rounded-b-2xl">
                    <div 
                        className={`h-full transition-all duration-[3500ms] ease-linear ${
                            visible ? 'w-0' : 'w-full'
                        } ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
                    />
                </div>
            </div>
        </div>
    );
}
