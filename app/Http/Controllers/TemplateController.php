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
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($t) => [
                'id'            => $t->id,
                'type_name'     => $t->type_name,
                'template_code' => $t->template_code,
                'is_active'     => $t->is_active,
                'field_count'   => count($t->mapping_config ?? []),
                'created_by'    => $t->creator?->name,
                'created_at'    => $t->created_at->format('d M Y'),
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
                'mapping_config'   => $template->mapping_config,
                'master_file_url'  => $previewUrl,
                'master_file_path' => $template->master_file_path,
            ],
        ]);
    }

    /**
     * Update template yang sudah ada.
     */
    public function update(Request $request, DocumentTemplate $template)
    {
        $validated = $request->validate([
            'type_name'      => 'required|string|max:255',
            'mapping_config' => 'required|array',
            'is_active'      => 'boolean',
        ]);

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
                'image_url'   => $localImageUrl,
                'image_path'  => $localImagePath,  // path untuk disimpan di DB
                'pdf_path'    => $pdfPath,
                'total_pages' => $data['total_pages'] ?? 1,
            ]);

        } catch (\Exception $e) {
            \Log::error('[TemplateController] Tidak bisa terhubung ke Python Engine: ' . $e->getMessage());
            return response()->json([
                'error' => 'Tidak bisa terhubung ke Python Engine: ' . $e->getMessage()
            ], 503);
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
            'template_name'  => 'required|string|max:255',
            'type_name'      => 'required|string|max:255',
            'pdf_path'       => 'required|string',
            'groups'         => 'required|array|min:1',
            'template_id'    => 'nullable|exists:document_templates,id',
        ]);

        $templateCode = Str::slug($validated['template_name'], '_');
        $mappingConfig = $validated['groups'];
        $imagePath = $request->input('image_path'); // bisa null jika mode edit tanpa upload ulang

        $updateData = [
            'template_code'    => $templateCode,
            'type_name'        => $validated['type_name'],
            'master_file_path' => $validated['pdf_path'],
            'mapping_config'   => $mappingConfig,
            'created_by'       => Auth::id() ?? 1,
            'is_active'        => true,
        ];
        if ($imagePath) {
            $updateData['master_image_path'] = $imagePath;
        }

        $template = DocumentTemplate::updateOrCreate(
            ['id' => $validated['template_id'] ?? null],
            $updateData
        );

        // 2. OPSIONAL: Tetap beri sinyal ke n8n (tanpa memblokir proses)
        try {
            Http::timeout(3)->post(config('services.n8n.template_webhook_url'), [
                'event'          => isset($validated['template_id']) ? 'update' : 'create',
                'template_id'    => $template->id,
                'template_code'  => $templateCode,
            ]);
        } catch (\Exception $e) {
            \Log::warning("Gagal trigger n8n untuk template (Abaikan, data sudah di DB): " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Template berhasil disimpan ke Database.',
            'id'      => $template->id
        ]);
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
        $request->merge([
            'created_by' => intval($request->created_by),
            'is_active'  => (bool) ($request->is_active ?? true),
        ]);

        $validated = $request->validate([
            'template_name'  => 'required|string|max:255',
            'template_code'  => 'required|string|max:255',
            'type_name'      => 'required|string|max:255',
            'pdf_path'       => 'required|string',
            'mapping_config' => 'required|array',
            'created_by'     => 'required|integer|exists:users,id',
            'is_active'      => 'boolean',
        ]);

        // Cek jika template_code sudah ada → update saja
        $template = DocumentTemplate::where('template_code', $validated['template_code'])->first();

        if ($template) {
            $template->update([
                'mapping_config'   => $validated['mapping_config'],
                'master_file_path' => $validated['pdf_path'],
            ]);
        } else {
            $template = DocumentTemplate::create([
                'type_name'        => $validated['type_name'],
                'template_code'    => $validated['template_code'],
                'created_by'       => $validated['created_by'],
                'master_file_path' => $validated['pdf_path'],
                'mapping_config'   => $validated['mapping_config'],
                'is_active'        => $validated['is_active'],
            ]);
        }

        return response()->json([
            'success'     => true,
            'template_id' => $template->id,
            'message'     => "Template #{$template->id} berhasil disimpan oleh n8n.",
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
        $templates = DocumentTemplate::where('is_active', true)
            ->orderBy('type_name')
            ->get(['id', 'type_name', 'template_code']);

        return response()->json($templates);
    }
}