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
        $templates = DocumentTemplate::where('is_active', true)
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
            'template_id' => 'nullable|exists:document_templates,id',
            'notes'       => 'nullable|string|max:500',
        ]);

        // Ambil template_code dari template yang dipilih
        $templateCode = null;
        if ($request->template_id) {
            $template     = DocumentTemplate::find($request->template_id);
            $templateCode = $template?->template_code;
        }

        $count = 0;

        foreach ($request->file('documents') as $file) {

            // 1. Simpan PDF ke storage — hanya ini yang dilakukan Laravel
            $filePath = $file->store('documents', 'public');

            // 2. Kirim ke n8n — n8n yang akan INSERT ke DB dan jalankan OCR
            try {
                Http::timeout(5)->post(config('services.n8n.webhook_url'), [
                    'user_id'       => Auth::id(),
                    'file_path'     => Storage::disk('public')->path($filePath),
                    'storage_path'  => $filePath,
                    'template_id'   => $request->template_id ?: null,
                    'template_code' => $templateCode,
                    'original_name' => $file->getClientOriginalName(),
                ]);
            } catch (\Exception $e) {
                \Log::warning("Gagal trigger n8n untuk file '{$file->getClientOriginalName()}': " . $e->getMessage());
            }

            $count++;
        }

        return back()->with('success', "{$count} dokumen berhasil diupload dan masuk dalam antrian pemrosesan.");
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
        // Paksa konversi tipe data sebelum validasi
        $request->merge([
            'user_id'     => intval($request->user_id),
            'template_id' => $request->template_id ? intval($request->template_id) : null,
            'status'      => $request->status ?: 'queued',
        ]);

        $validated = $request->validate([
            'user_id'       => 'required|integer|exists:users,id',
            'file_path'     => 'required|string',
            'storage_path'  => 'required|string',
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
    public function receiveOcrResult(Request $request)
    {
        $validated = $request->validate([
            'document_id'      => 'required|exists:documents,id',
            'status'           => 'required|in:processing,need_validation,failed',
            'extracted_data'   => 'nullable|array',
            'confidence_score' => 'nullable|numeric|min:0|max:100',
        ]);

        $document = Document::findOrFail($validated['document_id']);

        $document->update([
            'status'           => $validated['status'],
            'extracted_data'   => $validated['extracted_data'] ?? null,
            'confidence_score' => $validated['confidence_score'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => "Dokumen #{$document->id} diperbarui ke status '{$validated['status']}'.",
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