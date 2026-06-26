<?php

namespace App\Http\Controllers;

use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class ValidationController extends Controller
{
    /**
     * Daftar dokumen validasi — bisa difilter by status via ?status=
     * Nilai: need_validation (default) | completed | all
     */
    public function index(Request $request)
    {
        $status = $request->get('status', 'need_validation');
        $search = trim((string) $request->get('search', ''));

        $query = Document::with(['uploader', 'template']);

        if ($status === 'completed') {
            $query->where('status', 'completed');
        } elseif ($status === 'all') {
            $query->whereIn('status', ['need_validation', 'completed']);
        } else {
            $status = 'need_validation';
            $query->where('status', 'need_validation');
        }

        // ── Pencarian server-side: diterapkan ke SELURUH data (sesuai filter
        // status di atas) SEBELUM paginate, bukan hanya ke halaman aktif. ──
        // Dibungkus closure agar OR pencarian tidak "membocorkan" filter status.
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('original_name', 'ilike', "%{$search}%")
                    ->orWhereHas('template', function ($t) use ($search) {
                        $t->where('type_name', 'ilike', "%{$search}%");
                    });
            });
        }

        $documents = $query->orderByDesc('processing_ended_at')
            ->paginate(15)
            ->withQueryString() // simpan ?status= & ?search= di link pagination
            ->through(fn($doc) => [
                'id'             => $doc->id,
                'original_name'  => $doc->original_name,
                'status'         => $doc->status,
                'confidence_score' => $doc->confidence_score,
                'uploaded_by'    => $doc->uploader?->name,
                'template_name'  => $doc->template?->type_name ?? 'Tidak ada template',
                'uploaded_at'    => $doc->created_at->format('d M Y, H:i'),
                'processed_at'   => $doc->processing_ended_at?->format('d M Y, H:i'),
            ]);

        return Inertia::render('ValidasiDokumen', [
            'documents'     => $documents,
            'currentStatus' => $status,
            'search'        => $search,
        ]);
    }

    /**
     * Halaman detail validasi satu dokumen (Split-View).
     * Menampilkan PDF asli di kiri, hasil ekstraksi AI di kanan.
     */
    public function show(Document $document)
    {
        return Inertia::render('ValidasiDokumenDetail', [
            'document' => [
                'id'             => $document->id,
                'original_name'  => $document->original_name,
                'status'         => $document->status,
                'file_url'       => $document->file_path,
                'extracted_data' => $document->extracted_data,
                'confidence_score' => $document->confidence_score,
                'template'       => $document->template ? [
                    'id'        => $document->template->id,
                    'type_name' => $document->template->type_name,
                ] : null,
                'uploaded_by'    => $document->uploader?->name,
                'uploaded_at'    => $document->created_at->format('d M Y, H:i'),
            ],
        ]);
    }

    /**
     * Simpan hasil validasi — data disetujui dan dokumen selesai.
     * Menerima revised_data (data yang sudah diedit operator) dan
     * menyimpannya sebagai extracted_data final.
     */
    public function approve(Request $request, Document $document)
    {
        $request->validate([
            'revised_data' => 'nullable|array',
        ]);

        // Gunakan revised_data jika ada, fallback ke extracted_data yang tersimpan.
        // Field/sel yang nilainya diubah operator ditandai conf=100 & source=human
        // (dibandingkan terhadap data lama di DB sebelum disimpan).
        $dataToSave = ($request->has('revised_data') && $request->revised_data !== null)
            ? $this->markHumanEdits($request->revised_data, $document->extracted_data)
            : $document->extracted_data;

        $document->update([
            'status'         => 'completed',
            'extracted_data' => $dataToSave,
            'validated_by'   => Auth::id(),
        ]);

        return redirect()->route('documents.detail', $document)->with('success', 'Dokumen berhasil divalidasi.');
    }

    /**
     * Update extracted_data saja tanpa mengubah status (untuk dokumen completed).
     */
    public function update(Request $request, Document $document)
    {
        $request->validate([
            'revised_data' => 'nullable|array',
        ]);

        $dataToSave = ($request->has('revised_data') && $request->revised_data !== null)
            ? $this->markHumanEdits($request->revised_data, $document->extracted_data)
            : $document->extracted_data;

        $document->update([
            'extracted_data' => $dataToSave,
            'validated_by'   => Auth::id(),
        ]);

        return redirect()->route('documents.detail', $document)->with('success', 'Data berhasil diperbarui.');
    }

    /**
     * Tolak dokumen — misalnya dokumen buram atau tidak sesuai format.
     */
    public function reject(Request $request, Document $document)
    {
        $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        $document->update([
            'status'           => 'rejected',
            'rejection_reason' => $request->rejection_reason,
            'validated_by'     => Auth::id(),
        ]);

        return back()->with('success', 'Dokumen ditandai sebagai ditolak.');
    }

    /**
     * Tandai field/sel yang DIUBAH operator sebagai hasil koreksi manusia.
     *
     * Membandingkan nilai pada $revised (data baru dari form) terhadap
     * $original (extracted_data lama di DB). Untuk setiap nilai yang BERBEDA:
     *   - _conf_{key}       di-set 100  (sudah pasti benar, dikoreksi manusia)
     *   - _ocr_source_{key} di-set "human"
     * Nilai yang TIDAK berubah dibiarkan apa adanya (confidence & source asli
     * dari OCR tetap dipertahankan). Berlaku konsisten untuk:
     *   - field skalar (mis. copyright bukan, tapi top-level string),
     *   - field di dalam grup (mis. document.no_dok, header.location),
     *   - sel di dalam tabel (mis. descriptions[r].result).
     *
     * Backend menjadi satu-satunya otoritas penandaan agar tidak bergantung
     * pada logika frontend (menghindari salah-tandai akibat key bernama sama).
     */
    private function markHumanEdits(array $revised, ?array $original): array
    {
        $original  = $original ?? [];
        $origPages = $original['pages'] ?? [];

        $changed = fn ($new, $old) => (string) ($new ?? '') !== (string) ($old ?? '');

        // Iterasi LANGSUNG atas $revised['pages'] (variabel asli, bukan hasil
        // ekspresi "?? []") supaya penulisan lewat referensi &$page tersimpan.
        if (empty($revised['pages']) || ! is_array($revised['pages'])) {
            return $revised;
        }

        foreach ($revised['pages'] as $pi => &$page) {
            if (! is_array($page)) {
                continue;
            }
            $origPage = $origPages[$pi] ?? [];

            // ── Fields: skalar top-level + field di dalam grup ──────────
            if (isset($page['fields']) && is_array($page['fields'])) {
                $origFields = $origPage['fields'] ?? [];

                foreach ($page['fields'] as $key => &$val) {
                    if (str_starts_with((string) $key, '_') || $key === 'copyright') {
                        continue;
                    }

                    if (is_array($val)) {
                        // Grup (mis. "document", "header", section berulang)
                        $origGroup = (isset($origFields[$key]) && is_array($origFields[$key]))
                            ? $origFields[$key] : [];
                        foreach ($val as $ik => $iv) {
                            if (str_starts_with((string) $ik, '_') || is_array($iv)) {
                                continue;
                            }
                            if ($changed($iv, $origGroup[$ik] ?? null)) {
                                $val["_conf_{$ik}"]       = 100;
                                $val["_ocr_source_{$ik}"] = 'human';
                            }
                        }
                        unset($iv);
                    } else {
                        // Field skalar di level fields
                        if ($changed($val, $origFields[$key] ?? null)) {
                            $page['fields']["_conf_{$key}"]       = 100;
                            $page['fields']["_ocr_source_{$key}"] = 'human';
                        }
                    }
                }
                unset($val);
            }

            // ── Tables: sel per baris ──────────────────────────────────
            if (isset($page['tables']) && is_array($page['tables'])) {
                $origTables = $origPage['tables'] ?? [];

                foreach ($page['tables'] as $tableKey => &$rows) {
                    if (! is_array($rows) || str_ends_with((string) $tableKey, '__col_order')) {
                        continue;
                    }
                    $origRows = $origTables[$tableKey] ?? [];

                    foreach ($rows as $ri => &$row) {
                        if (! is_array($row)) {
                            continue;
                        }
                        $origRow = $origRows[$ri] ?? [];
                        foreach ($row as $ck => $cv) {
                            if (str_starts_with((string) $ck, '_') || is_array($cv)) {
                                continue;
                            }
                            if ($changed($cv, $origRow[$ck] ?? null)) {
                                $row["_conf_{$ck}"]       = 100;
                                $row["_ocr_source_{$ck}"] = 'human';
                            }
                        }
                    }
                    unset($row);
                }
                unset($rows);
            }
        }
        unset($page);

        return $revised;
    }
}