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
        return Inertia::render('MasterTemplateEditor', [
            'editingTemplate' => [
                'id'               => $template->id,
                'type_name'        => $template->type_name,
                'template_code'    => $template->template_code,
                'mapping_config'   => $template->mapping_config,
                'master_file_url'  => $template->master_file_path
                    ? Storage::url($template->master_file_path)
                    : null,
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
            'pdf' => 'required|file|mimes:pdf|max:20480', // max 20MB
        ]);

        // 1. Simpan PDF
        $pdfPath = $request->file('pdf')->store('template-masters', 'public');
        $pdfFullPath = Storage::disk('public')->path($pdfPath);

        // 2. Kirim ke Python Engine
        try {
            $response = Http::timeout(60)
                ->attach('pdf', file_get_contents($pdfFullPath), basename($pdfFullPath))
                ->post(config('services.python_engine.url') . '/convert-pdf');

            \Log::info('[TemplateController] Python response status: ' . $response->status());
            \Log::info('[TemplateController] Python response body: ' . $response->body());

            if ($response->failed()) {
                $errBody = $response->json();
                return response()->json([
                    'error' => 'Python Engine gagal memproses PDF: ' . ($errBody['error'] ?? $response->body())
                ], 500);
            }

            $data = $response->json();

            return response()->json([
                'image_url'   => $data['image_url'],   // URL PNG dari Python
                'pdf_path'    => $pdfPath,              // Path untuk disimpan nanti
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

        // Untuk struktur nested ('groups'), kita simpan as-is dari frontend
        $mappingConfig = $validated['groups'];

        // Kirim ke n8n — n8n yang akan INSERT/UPDATE ke DB
        // (Laravel tidak langsung insert, sama seperti alur upload dokumen)
        try {
            Http::timeout(5)->post(config('services.n8n.template_webhook_url'), [
                'event'          => isset($validated['template_id']) ? 'update' : 'create',
                'template_id'    => $validated['template_id'] ?? null,
                'template_name'  => $validated['template_name'],
                'template_code'  => $templateCode,
                'type_name'      => $validated['type_name'],
                'pdf_path'       => $validated['pdf_path'],
                'mapping_config' => $mappingConfig,
                'created_by'     => Auth::id(),
                'is_active'      => true,
            ]);
        } catch (\Exception $e) {
            \Log::warning("Gagal trigger n8n untuk template '{$validated['template_name']}': " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Template sedang diproses oleh n8n.',
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