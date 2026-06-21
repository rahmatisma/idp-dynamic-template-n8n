<?php

namespace App\Http\Controllers;

use App\Models\Document;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DashboardController extends Controller
{
    /**
     * Daftar status yang SELALU ditampilkan di dashboard (termasuk yang count-nya 0),
     * supaya kartu/visual tidak "hilang" ketika belum ada datanya.
     *
     * Catatan: 'rejected' dimasukkan karena ValidationController::reject() menyetel
     * status = 'rejected' (BUKAN 'failed'). Status di luar daftar ini (jika ada)
     * tetap ditambahkan secara dinamis di bawah agar tidak ada data yang hilang.
     */
    private const STATUS_KEYS = [
        'queued',
        'processing',
        'completed',
        'need_validation',
        'failed',
        'rejected',
    ];

    public function index()
    {
        // ── 1. Jumlah dokumen per status (termasuk yang 0) ────────────────
        $rawCounts = Document::select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $statusCounts = collect(self::STATUS_KEYS)
            ->mapWithKeys(fn ($s) => [$s => (int) ($rawCounts[$s] ?? 0)]);

        // Tambahkan status tak terduga (kalau suatu saat muncul) supaya tidak hilang.
        foreach ($rawCounts as $status => $total) {
            if (! $statusCounts->has($status)) {
                $statusCounts->put($status, (int) $total);
            }
        }

        // ── 2. Success rate — KINERJA PIPELINE OTOMATIS ───────────────────
        // DEFINISI FINAL (boleh dikutip langsung untuk skripsi):
        //   Success rate mengukur keberhasilan PIPELINE OTOMATIS (n8n + Python
        //   engine) memproses dokumen sampai tuntas, TERLEPAS dari penilaian
        //   kualitas input oleh manusia.
        //
        //   - Penyebut (dokumen final dari sisi pipeline):
        //         completed + need_validation + failed
        //       * 'queued'/'processing' BELUM final  → dikecualikan.
        //       * 'rejected' DIKECUALIKAN dari penyebut: rejected terjadi SETELAH
        //         pipeline otomatis sukses (admin menolak dokumen sumber yang
        //         tidak layak), jadi bukan bagian dari pengukuran apakah pipeline
        //         berhasil atau tidak.
        //   - Pembilang (pipeline berhasil sampai akhir):
        //         completed + need_validation
        //       ('failed' = kegagalan TEKNIS pipeline → tidak masuk pembilang.)
        //   - success_rate = (completed + need_validation)
        //                    / (completed + need_validation + failed) * 100
        $completed = $statusCounts['completed'];
        $needValidation = $statusCounts['need_validation'];
        $failed = $statusCounts['failed'];
        $rejected = $statusCounts['rejected'];

        $pipelineFinalTotal = $completed + $needValidation + $failed;
        $successRate = $pipelineFinalTotal > 0
            ? round(($completed + $needValidation) / $pipelineFinalTotal * 100, 1)
            : null; // null = belum ada dokumen final pipeline untuk dihitung

        // ── 2b. Rejection rate — METRIK KUALITAS INPUT (BUKAN kinerja pipeline) ─
        // CATATAN: ini metrik TERPISAH dan TIDAK boleh digabung ke success rate.
        // 'rejected' = dokumen yang pipeline-nya sukses tetapi DITOLAK manusia
        // karena sumbernya tidak layak (rusak/tidak lengkap/tidak valid). Ini
        // mengukur kualitas dokumen yang masuk, bukan keandalan sistem OCR.
        // Dihitung sebagai porsi dari SELURUH dokumen.
        $totalDocuments = (int) $statusCounts->sum();
        $rejectionRate = $totalDocuments > 0
            ? round($rejected / $totalDocuments * 100, 1)
            : null;

        // ── 3. Rata-rata latency end-to-end (pipeline otomatis) ───────────
        // Hanya dokumen yang punya processing_started_at DAN processing_ended_at.
        // Dokumen tanpa kedua nilai itu DIKECUALIKAN (bukan dihitung sebagai 0).
        // Latency ini murni waktu pipeline (n8n + Python engine): approve/update/
        // reject di ValidationController TIDAK menyentuh kedua kolom timestamp ini.
        $durations = Document::whereNotNull('processing_started_at')
            ->whereNotNull('processing_ended_at')
            ->get(['processing_started_at', 'processing_ended_at'])
            ->map(fn ($d) => $d->processing_started_at->diffInSeconds($d->processing_ended_at, true));

        $avgLatencySeconds = $durations->isNotEmpty()
            ? round($durations->avg(), 1)
            : null; // null = belum ada dokumen dengan timestamp lengkap
        $latencySampleCount = $durations->count();

        // ── 4. Dokumen terbaru (10), eager-load nama template ─────────────
        $recentDocuments = Document::with('template:id,type_name')
            ->latest() // created_at DESC
            ->take(10)
            ->get()
            ->map(function ($d) {
                $duration = ($d->processing_started_at && $d->processing_ended_at)
                    ? $d->processing_started_at->diffInSeconds($d->processing_ended_at, true)
                    : null; // null kalau timestamp belum lengkap

                return [
                    'id'               => $d->id,
                    'original_name'    => $d->original_name,
                    'template_name'    => $d->template?->type_name,
                    'status'           => $d->status,
                    'duration_seconds' => $duration,
                    'created_at'       => $d->created_at?->format('d M Y, H:i'),
                ];
            });

        return Inertia::render('Dashboard', [
            'totalDocuments'     => $totalDocuments,
            'statusCounts'       => $statusCounts,
            'successRate'        => $successRate,
            'rejectedCount'      => $rejected,
            'rejectionRate'      => $rejectionRate,
            'avgLatencySeconds'  => $avgLatencySeconds,
            'latencySampleCount' => $latencySampleCount,
            'recentDocuments'    => $recentDocuments,
        ]);
    }
}
