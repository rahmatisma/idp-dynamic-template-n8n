<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\DocumentTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class DocumentController extends Controller
{
    // ──────────────────────────────────────────────────────────────
    // HALAMAN & INERTIA
    // ──────────────────────────────────────────────────────────────

    /**
     * Halaman Upload Dokumen.
     * Kirim: daftar template aktif (untuk dropdown) + riwayat dokumen milik user ini.
     */
    public function create()
    {
        $templates = DocumentTemplate::whereRaw('is_active = true')
            ->orderBy('type_name')
            ->get(['id', 'type_name', 'template_code']);

        $documents = Document::with('template')
            ->where('user_id', Auth::id())
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn($doc) => [
                'id'               => $doc->id,
                'original_name'    => $doc->original_name,
                'status'           => $doc->status,
                'confidence_score' => $doc->confidence_score,
                'template_name'    => $doc->template?->type_name ?? null,
                'uploaded_at'      => $doc->created_at->format('d M Y, H:i'),
            ]);

        return Inertia::render('UploadDokumen', [
            'templates' => $templates,
            'documents' => $documents,
        ]);
    }

    // ──────────────────────────────────────────────────────────────
    // UPLOAD — Laravel hanya simpan file, n8n yang urus database
    // ──────────────────────────────────────────────────────────────

    /**
     * Proses upload dokumen dari Engineer/NMS.
     *
     * Alur:
     *   1. Validasi file PDF
     *   2. Simpan PDF ke storage
     *   3. Kirim ke n8n → n8n yang INSERT ke database & orkestrasi OCR
     *   4. Redirect kembali dengan pesan sukses
     *
     * PENTING: Laravel TIDAK insert ke tabel documents di sini.
     * Semua proses dokumen dikendalikan oleh n8n.
     */
    public function store(Request $request)
    {
        $request->validate([
            'documents'   => 'required|array|min:1',
            'documents.*' => 'required|file|mimes:pdf|max:10240',
            'notes'       => 'nullable|string|max:500',
        ]);

        $count = 0;

        foreach ($request->file('documents') as $file) {
            // 1. Simpan PDF ke storage lokal (public/documents)
            $filePath = $file->store('documents', 'public');

            // 2. TRIGGER n8n — n8n yang akan INSERT ke DB (Sesuai request lu)
            try {
                $n8nUrl = config('services.n8n.webhook_url');
                if ($n8nUrl) {
                    Http::timeout(5)->post($n8nUrl, [
                        'user_id'       => Auth::id(), // WAJIB ada buat n8n INSERT
                        'original_name' => $file->getClientOriginalName(),
                        'file_path'     => Storage::disk('public')->path($filePath),
                        'storage_path'  => $filePath,
                        'status'        => 'queued',
                        'notes'         => $request->notes,
                        'file_size'     => $file->getSize(),
                    ]);
                }
            } catch (\Exception $e) {
                \Log::warning("Gagal trigger n8n untuk file '{$file->getClientOriginalName()}': " . $e->getMessage());
            }

            $count++;
        }

        return back()->with('success', 'Dokumen berhasil diunggah.');
    }

    /**
     * Hapus dokumen.
     */
    public function destroy(Document $document)
    {
        // 1. Pastikan user cuma bisa hapus dokumen miliknya
        if ($document->user_id !== Auth::id()) {
            abort(403);
        }

        // 2. Hapus file fisik dari storage
        if ($document->file_path) {
            Storage::disk('public')->delete($document->file_path);
        }

        // 3. Pemicu n8n buat hapus baris di DB (Centralized logic)
        try {
            Http::post(env('N8N_WEBHOOK_URL'), [
                'action'      => 'delete',
                'document_id' => $document->id,
                'user_id'     => Auth::id(),
            ]);
        } catch (\Exception $e) {
            // Log error if needed
        }

        // 4. Hapus di lokal biar UI langsung update (Fail-safe)
        $document->delete();

        return back()->with('success', 'Berhasil dihapus.');
    }

    // ──────────────────────────────────────────────────────────────
    // WEBHOOK — Dipanggil oleh n8n (bukan user)
    // ──────────────────────────────────────────────────────────────

    /**
     * [WEBHOOK] n8n INSERT dokumen baru ke database.
     *
     * Dipanggil oleh n8n Node 2 setelah menerima trigger dari Laravel.
     * n8n mengirim data dokumen, Laravel menyimpan ke DB dan mengembalikan document_id.
     * document_id ini digunakan oleh node-node n8n berikutnya.
     *
     * Method: POST
     * URL: /api/webhook/create-document
     */
    public function createFromN8n(Request $request)
    {
        // Paksa konversi tipe data & alias path
        $request->merge([
            'user_id'      => intval($request->user_id),
            'template_id'  => $request->template_id ? intval($request->template_id) : null,
            'status'       => $request->status ?: 'queued',
            // Jika n8n kirim file_path (relatif), kita pake itu buat storage_path
            'storage_path' => $request->storage_path ?: $request->file_path,
        ]);

        $validated = $request->validate([
            'user_id'       => 'required|integer|exists:users,id',
            'storage_path'  => 'required|string', // Lokasi relatif
            'template_id'   => 'nullable|integer|exists:document_templates,id',
            'original_name' => 'required|string|max:255',
            'status'        => 'required|in:queued,processing',
        ]);

        $document = Document::create([
            'user_id'       => $validated['user_id'],
            'template_id'   => $validated['template_id'],
            'original_name' => $validated['original_name'],
            'file_path'     => $validated['storage_path'],
            'status'        => $validated['status'],
        ]);

        return response()->json([
            'success'     => true,
            'document_id' => $document->id,
            'message'     => "Dokumen #{$document->id} berhasil dibuat.",
        ], 201);
    }

    /**
     * [WEBHOOK] n8n UPDATE status dan hasil OCR dokumen.
     *
     * Dipanggil oleh n8n berkali-kali:
     *   - Node 3: status = "processing"
     *   - Node 6: status = "need_validation" + extracted_data + confidence_score
     *   - Jika error: status = "failed"
     *
     * Method: PATCH
     * URL: /api/webhook/ocr-result
     */
    public function receiveOcrResult(Request $request, Document $document = null)
    {
        // Jika tidak di-inject dari URL, cari dari body document_id
        if (!$document) {
            $document = Document::findOrFail($request->document_id);
        }

        $validated = $request->validate([
            'status'                => 'required|in:processing,need_validation,completed,failed',
            'template_id'           => 'nullable|exists:document_templates,id',
            'extracted_data'        => 'nullable|array',
            'confidence_score'      => 'nullable|numeric|min:0|max:100',
            'processing_started_at' => 'nullable|date',
            'processing_ended_at'   => 'nullable|date',
            'error'                 => 'nullable|string', // Tambahan buat Error Handler
            'tp'                    => 'nullable|integer',
            'fp'                    => 'nullable|integer',
            'fn'                    => 'nullable|integer',
        ]);

        $updateData = [
            'status'                => $validated['status'],
            'template_id'           => $validated['template_id'] ?? $document->template_id,
            'extracted_data'        => $validated['extracted_data'] ?? $document->extracted_data,
            'confidence_score'      => $validated['confidence_score'] ?? $document->confidence_score,
            'processing_started_at' => $validated['processing_started_at'] ?? $document->processing_started_at,
            'processing_ended_at'   => $validated['processing_ended_at'] ?? $document->processing_ended_at,
            'tp_count'              => $validated['tp'] ?? $document->tp_count,
            'fp_count'              => $validated['fp'] ?? $document->fp_count,
            'fn_count'              => $validated['fn'] ?? $document->fn_count,
        ];

        // Simpan pesan error ke metadata kalau ada
        if (isset($validated['error'])) {
            $currentMetadata = $document->metadata ?? [];
            $currentMetadata['last_error'] = $validated['error'];
            $updateData['metadata'] = $currentMetadata;
        }

        $document->update($updateData);

        return response()->json([
            'success' => true,
            'message' => "Dokumen #{$document->id} berhasil diperbarui.",
        ]);
    }

    // ──────────────────────────────────────────────────────────────
    // POLLING — Dipanggil React setiap 5 detik
    // ──────────────────────────────────────────────────────────────

    /**
     * [POLLING] React cek status dokumen secara berkala.
     *
     * Digunakan oleh UploadDokumen.jsx untuk update tabel tanpa full reload.
     * Hanya mengembalikan status + confidence_score (data ringan).
     *
     * Method: GET
     * URL: /internal-api/documents/{id}/status
     */
    public function getStatus(Document $document)
    {
        // Pastikan user hanya bisa cek dokumen miliknya sendiri
        if ($document->user_id !== Auth::id()) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json([
            'id'               => $document->id,
            'status'           => $document->status,
            'confidence_score' => $document->confidence_score,
        ]);
    }
}