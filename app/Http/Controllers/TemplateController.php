<?php

namespace App\Http\Controllers;

use App\Models\DocumentTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;

class TemplateController extends Controller
{
    /**
     * Halaman daftar semua template.
     * Dikirim ke MasterTemplate.jsx sebagai prop "templates".
     */
    public function index()
    {
        $templates = DocumentTemplate::with('creator')
            ->withCount([
                'documents',
                'documents as active_documents_count' => fn($q) => $q->whereIn('status', ['queued', 'processing'])
            ])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($t) => [
                'id'              => $t->id,
                'type_name'       => $t->type_name,
                'template_code'   => $t->template_code,
                'identifier_text' => $t->identifier_text,
                'is_active'       => $t->is_active,
                'field_count'     => count($t->mapping_config ?? []),
                'created_by'      => $t->creator?->name,
                'created_at'      => $t->created_at->format('d M Y'),
                'total_docs'      => $t->documents_count,
                'active_docs'     => $t->active_documents_count,
                'master_file_url' => $t->master_file_path
                    ? Storage::url($t->master_file_path)
                    : null,
            ]);

        return Inertia::render('MasterTemplate', [
            'templates' => $templates,
        ]);
    }

    /**
     * Halaman form buat template baru.
     */
    public function create()
    {
        return Inertia::render('MasterTemplateEditor');
    }

    /**
     * Halaman edit template yang sudah ada.
     */
    public function edit(DocumentTemplate $template)
    {
        // Resolusi URL gambar preview: prioritaskan master_image_path (lokal), fallback ke PDF URL
        if ($template->master_image_path) {
            $previewUrl = Storage::url($template->master_image_path);
        } elseif ($template->master_file_path) {
            // Fallback lama: URL ke PDF (tidak bisa ditampilkan sebagai gambar, tapi setidaknya tidak null)
            $previewUrl = Storage::url($template->master_file_path);
        } else {
            $previewUrl = null;
        }

        return Inertia::render('MasterTemplateEditor', [
            'editingTemplate' => [
                'id'               => $template->id,
                'type_name'        => $template->type_name,
                'template_code'    => $template->template_code,
                'identifier_text'  => $template->identifier_text,
                'mapping_config'   => $template->mapping_config,
                'ui_metadata'      => $template->ui_metadata,
                'master_file_url'  => $previewUrl,
                'master_file_path' => $template->master_file_path,
                'image_path'       => $template->master_image_path,
                'python_image_path' => $template->master_image_path ? storage_path('app/public/' . $template->master_image_path) : null,
            ],
        ]);
    }

    /**
     * Update template yang sudah ada.
     */
    public function update(Request $request, DocumentTemplate $template)
    {
        $validated = $request->validate([
            'type_name'       => 'required|string|max:255',
            'identifier_text' => 'nullable|string|max:255',
            'mapping_config'  => 'required|array',
            'is_active'       => 'boolean',
        ]);

        // Proteksi: Cek apakah identifier_text berubah
        if ($request->has('identifier_text') && $request->identifier_text !== $template->identifier_text) {
            if ($template->hasActiveDocuments()) {
                return back()->with('error', 'Gagal: Identifier tidak boleh diubah karena masih ada dokumen status QUEUED/PROCESSING.');
            }
        }

        $template->update($validated);

        return back()->with('success', 'Template berhasil diperbarui.');
    }

    /**
     * Hapus template.
     */
    public function destroy(DocumentTemplate $template)
    {
        // Hapus file master PDF jika ada
        if ($template->master_file_path) {
            Storage::delete($template->master_file_path);
        }

        $template->delete();

        return back()->with('success', 'Template berhasil dihapus.');
    }

    /**
     * API: Convert PDF → PNG halaman 1.
     * Dipanggil dari MasterTemplate.jsx via fetch() saat Admin upload PDF master.
     *
     * Alur:
     *   1. Terima file PDF dari React
     *   2. Simpan PDF ke storage/app/public/template-masters/
     *   3. Kirim ke Python Engine untuk di-convert ke PNG
     *   4. Kembalikan URL PNG ke React untuk ditampilkan di canvas
     */
    public function convertPdf(Request $request)
    {
        $request->validate([
            'pdf' => 'required|file|mimes:pdf|max:20480',
        ]);

        // 1. Simpan PDF
        $pdfPath = $request->file('pdf')->store('template-masters', 'public');
        $pdfFullPath = Storage::disk('public')->path($pdfPath);

        // 2. Kirim ke Python Engine
        try {
            $response = Http::timeout(60)
                ->attach('pdf', file_get_contents($pdfFullPath), basename($pdfFullPath))
                ->post(config('services.python_engine.url') . '/convert-pdf');

            if ($response->failed()) {
                return response()->json([
                    'error' => 'Python Engine gagal memproses PDF: ' . ($response->json()['error'] ?? $response->body())
                ], 500);
            }

            $data = $response->json();
            $pythonImageUrl = $data['image_url'];

            // 3. Unduh PNG dari Python Engine dan simpan ke storage lokal
            $imageBaseName = pathinfo($pdfPath, PATHINFO_FILENAME) . '_preview.png';
            $localImagePath = 'template-previews/' . $imageBaseName;

            // Coba unduh dari Python engine (Python URL mungkin relatif atau absolut)
            $fullPythonUrl = str_starts_with($pythonImageUrl, 'http')
                ? $pythonImageUrl
                : config('services.python_engine.url') . $pythonImageUrl;

            $imageContent = @file_get_contents($fullPythonUrl);
            if ($imageContent !== false) {
                Storage::disk('public')->put($localImagePath, $imageContent);
                $localImageUrl = Storage::url($localImagePath);
            } else {
                // Fallback ke URL Python jika tidak bisa diunduh
                $localImageUrl = $pythonImageUrl;
                $localImagePath = null;
            }

            return response()->json([
                'image_url'         => $localImageUrl,
                'image_path'        => $localImagePath,  // path untuk disimpan di DB
                'python_image_path' => storage_path('app/public/' . $localImagePath), // path absolut
                'pdf_path'          => $pdfPath,
                'total_pages'       => $data['total_pages'] ?? 1,
            ]);

        } catch (\Exception $e) {
            \Log::error('[TemplateController] Tidak bisa terhubung ke Python Engine: ' . $e->getMessage());
            return response()->json([
                'error' => 'Tidak bisa terhubung ke Python Engine: ' . $e->getMessage()
            ], 503);
        }
    }
    
    /**
     * API: OCR Cepat pada area crop.
     * Digunakan untuk Auto-Fill nama field saat Admin menggambar kotak anchor.
     */
    public function ocrPredict(Request $request)
    {
        $request->validate([
            'image_path' => 'required|string',
            'box'        => 'required|array',
        ]);

        try {
            // Python Engine butuh path relatif terhadap BASE_DIR nya
            // Laravel kirim path dari image_path preview
            $response = Http::timeout(15)->post(config('services.python_engine.url') . '/predict-ocr', [
                'image_path' => $request->image_path,
                'box'        => $request->box,
            ]);

            if ($response->failed()) {
                return response()->json(['error' => 'OCR Engine error'], 500);
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    /**
     * API: Auto-Detect Header dari PDF Master.
     * Digunakan untuk menyarankan 'Identifier Text' secara otomatis di Editor.
     */
    public function detectHeader(Request $request)
    {
        $request->validate([
            'file_path' => 'required|string',
        ]);

        try {
            $response = Http::timeout(20)->post(config('services.python_engine.url') . '/detect-header', [
                'file_path' => $request->file_path,
            ]);

            if ($response->failed()) {
                return response()->json(['error' => 'Gagal mendeteksi header'], 500);
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 503);
        }
    }

    /**
     * API: Simpan konfigurasi template ke database.
     * Dipanggil dari MasterTemplate.jsx setelah Admin selesai gambar kotak.
     *
     * Body JSON yang diterima:
     * {
     *   "template_name": "form_pm_vendor_a",
     *   "type_name": "Formulir PM",
     *   "pdf_path": "template-masters/xxxx.pdf",
     *   "fields": [
     *     {
     *       "field_name": "location",
     *       "anchor_keyword": "Location",
     *       "anchor_box": { x, y, width, height },
     *       "value_box":  { x, y, width, height },
     *       "offset_x": 120,
     *       "offset_y": -2,
     *       "value_width": 200,
     *       "value_height": 27,
     *       "field_type": "handwritten"
     *     }
     *   ]
     * }
     */
    public function save(Request $request)
    {
        $validated = $request->validate([
            'template_name'   => 'required|string|max:255',
            'type_name'       => 'required|string|max:255',
            'identifier_text' => 'nullable|string|max:255',
            'pdf_path'        => 'required|string',
            'mapping_config'  => 'required|array',       // Includes fields and tables
            'ui_metadata'     => 'nullable|array',       // Format Flat untuk Editor
            'template_id'     => 'nullable|exists:document_templates,id',
            'image_path'      => 'nullable|string',
        ]);

        $templateCode = Str::slug($validated['template_name'], '_');

        // 1. KIRIM KE n8n (Delegasi Penyimpanan)
        // Laravel hanya sebagai pengirim pesan, DB akan diupdate n8n via webhook
        try {
            $n8nUrl = config('services.n8n.template_webhook_url');
            
            if (!$n8nUrl) {
                throw new \Exception("Konfigurasi services.n8n.template_webhook_url belum diset.");
            }

            $response = Http::timeout(10)->post($n8nUrl, [
                'event'           => isset($validated['template_id']) ? 'update' : 'create',
                'template_id'     => $validated['template_id'] ?? null,
                'template_name'   => $validated['template_name'],
                'template_code'   => $templateCode,
                'type_name'       => $validated['type_name'],
                'identifier_text' => $validated['identifier_text'] ?? null,
                'pdf_path'        => $validated['pdf_path'],
                'image_path'      => $validated['image_path'] ?? null,
                'mapping_config'  => $validated['mapping_config'],
                'ui_metadata'     => $validated['ui_metadata'] ?? [],
                'created_by'      => Auth::id() ?? 1,
            ]);

            if ($response->failed()) {
                throw new \Exception("n8n merespon dengan status: " . $response->status());
            }

            return response()->json([
                'success' => true,
                'message' => 'Permintaan simpan telah dikirim ke n8n. Tunggu sesaat hingga data muncul di daftar.',
            ]);

        } catch (\Exception $e) {
            \Log::error("Gagal mengirim data template ke n8n: " . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => 'Gagal terhubung ke n8n: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * [WEBHOOK] n8n INSERT template baru ke database.
     *
     * Dipanggil oleh n8n setelah menerima trigger dari Laravel.
     * Mirip dengan createFromN8n() di DocumentController.
     *
     * Method: POST
     * URL: /api/webhook/create-template
     */
    public function createFromN8n(Request $request)
    {
        \Log::info("Data masuk dari n8n ke createFromN8n:", $request->all());

        // n8n sering mengirimkan null/angka sebagai string, kita konversi paksa agar validasi lancar
        $input = $request->all();
        
        if (isset($input['template_id'])) {
            $input['template_id'] = ($input['template_id'] === 'null' || $input['template_id'] === '') ? null : (int) $input['template_id'];
        }
        
        if (isset($input['created_by'])) {
            $input['created_by'] = (int) $input['created_by'];
        }

        // Pastikan mapping_config adalah array (jika n8n mengirim string JSON, kita decode)
        if (isset($input['mapping_config']) && is_string($input['mapping_config'])) {
            $input['mapping_config'] = json_decode($input['mapping_config'], true);
        }

        $request->replace($input);

        $validated = $request->validate([
            'template_id'     => 'nullable|integer',
            'template_code'   => 'required|string|max:255',
            'type_name'       => 'required|string|max:255',
            'identifier_text' => 'nullable|string|max:255',
            'pdf_path'        => 'required|string',
            'image_path'      => 'nullable|string',
            'mapping_config'  => 'required|array',
            'ui_metadata'     => 'nullable|array',
            'created_by'      => 'required|integer',
            'is_active'       => 'boolean',
        ]);

        $template = DocumentTemplate::updateOrCreate(
            ['id' => $validated['template_id'] ?? null],
            [
                'template_code'     => $validated['template_code'],
                'type_name'         => $validated['type_name'],
                'identifier_text'   => $validated['identifier_text'],
                'master_file_path'  => $validated['pdf_path'],
                'master_image_path' => $validated['image_path'] ?? null,
                'mapping_config'    => $validated['mapping_config'],
                'ui_metadata'       => $validated['ui_metadata'] ?? [],
                'created_by'        => $validated['created_by'],
                'is_active'         => $validated['is_active'] ?? true,
            ]
        );

        return response()->json([
            'success'     => true,
            'template_id' => $template->id,
            'message'     => "Template #{$template->id} berhasil di-synchronize oleh n8n ke Database.",
        ], 201);
    }

    /**
     * API: Clone (duplikasi) template yang sudah ada.
     * Dipanggil dari MasterTemplate.jsx saat admin klik tombol "Clone".
     *
     * Method: POST
     * URL: /internal-api/template/{template}/clone
     */
    public function clone(DocumentTemplate $template)
    {
        $newTemplate = $template->replicate();
        $newTemplate->type_name        = $template->type_name . ' (Copy)';
        $newTemplate->template_code    = $template->template_code . '_copy_' . time();
        $newTemplate->created_by       = Auth::id() ?? 1;
        $newTemplate->is_active        = false; // Default non-aktif dulu sampai admin edit
        $newTemplate->save();

        return response()->json([
            'success'     => true,
            'message'     => 'Template berhasil diduplikasi.',
            'id'          => $newTemplate->id,
            'type_name'   => $newTemplate->type_name,
        ]);
    }

    /**
     * API: Ambil daftar template aktif untuk dropdown di halaman Upload Dokumen.
     */
    public function list()
    {
        $templates = DocumentTemplate::whereRaw('is_active = true')
            ->orderBy('type_name')
            ->get(['id', 'type_name', 'template_code', 'identifier_text']);

        return response()->json($templates);
    }

    /**
     * API: Ambil detail template untuk n8n (External).
     * URL: /api/templates/{template}
     */
    public function showApi(DocumentTemplate $template)
    {
        return response()->json([
            'id'              => $template->id,
            'type_name'       => $template->type_name,
            'template_code'   => $template->template_code,
            'identifier_text' => $template->identifier_text,
            'mapping_config'  => $template->mapping_config,
        ]);
    }

    /**
     * API: List template untuk n8n (External).
     * URL: /api/templates
     */
    public function listApi()
    {
        $templates = DocumentTemplate::whereRaw('is_active = true')
            ->get(['id', 'type_name', 'template_code', 'identifier_text', 'mapping_config']);

        return response()->json([
            'success' => true,
            'data'    => $templates
        ]);
    }
}