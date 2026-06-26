import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: true,
        }),
        react(),
    ],
    build: {
        rollupOptions: {
            output: {
                // Pisahkan vendor besar ke chunk tersendiri supaya browser bisa
                // cache React/Inertia secara independen dari kode aplikasi.
                // React dan Inertia dijadikan satu chunk vendor karena Inertia
                // mengimport React — Rollup akan menggabungkan keduanya.
                // Hasilnya: app.js jadi sangat kecil (hanya bootstrap), dan
                // vendor-react-inertia di-cache terpisah dari kode aplikasi.
                manualChunks: {
                    'vendor-react-inertia': ['react', 'react-dom', '@inertiajs/react'],
                },
            },
        },
    },
});
