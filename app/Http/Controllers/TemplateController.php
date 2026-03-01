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
        return Inertia::render('MasterTemplate', [
            'templates' => [],
            'mode'      => 'create',
        ]);
    }

    /**
     * Halaman edit template yang sudah ada.
     */
    public function edit(DocumentTemplate $template)
    {
        return Inertia::render('MasterTemplate', [
            'templates'       => [],
            'mode'            => 'edit',
            'editingTemplate' => [
                'id'              => $template->id,
                'type_name'       => $template->type_name,
                'template_code'   => $template->template_code,
                'mapping_config'  => $template->mapping_config,
                'master_file_url' => $template->master_file_path
                    ? Storage::url($template->master_file_path)
                    : null,
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

            if ($response->failed()) {
                return response()->json([
                    'error' => 'Python Engine gagal memproses PDF.'
                ], 500);
            }

            $data = $response->json();

            return response()->json([
                'image_url'   => $data['image_url'],   // URL PNG dari Python
                'pdf_path'    => $pdfPath,              // Path untuk disimpan nanti
                'total_pages' => $data['total_pages'] ?? 1,
            ]);

        } catch (\Exception $e) {
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
            'fields'         => 'required|array|min:1',
            'fields.*.field_name'      => 'required|string',
            'fields.*.anchor_keyword'  => 'required|string',
            'fields.*.offset_x'        => 'required|numeric',
            'fields.*.offset_y'        => 'required|numeric',
            'fields.*.value_width'     => 'required|numeric',
            'fields.*.value_height'    => 'required|numeric',
            'fields.*.field_type'      => 'required|in:handwritten,printed',
        ]);

        // Generate template_code unik dari nama template
        $templateCode = Str::slug($validated['template_name'], '_');

        // Cek jika template_code sudah ada, update saja
        $template = DocumentTemplate::where('template_code', $templateCode)->first();

        $mappingConfig = collect($validated['fields'])->map(fn($field) => [
            'field_name'      => $field['field_name'],
            'anchor_keyword'  => $field['anchor_keyword'],
            'anchor_box'      => $field['anchor_box'] ?? null,
            'value_box'       => $field['value_box'] ?? null,
            'offset_x'        => $field['offset_x'],
            'offset_y'        => $field['offset_y'],
            'value_width'     => $field['value_width'],
            'value_height'    => $field['value_height'],
            'field_type'      => $field['field_type'],
        ])->toArray();

        if ($template) {
            $template->update([
                'mapping_config'   => $mappingConfig,
                'master_file_path' => $validated['pdf_path'],
            ]);
        } else {
            $template = DocumentTemplate::create([
                'type_name'        => $validated['type_name'],
                'template_code'    => $templateCode,
                'created_by'       => Auth::id(),
                'master_file_path' => $validated['pdf_path'],
                'mapping_config'   => $mappingConfig,
                'is_active'        => true,
            ]);
        }

        return response()->json([
            'success'  => true,
            'message'  => 'Template berhasil disimpan.',
            'template' => [
                'id'            => $template->id,
                'template_code' => $template->template_code,
            ],
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