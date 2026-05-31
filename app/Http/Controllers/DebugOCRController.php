<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\DocumentTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;

class DebugOCRController extends Controller
{
    /**
     * Halaman Debug OCR.
     * Kirim dokumen (status bukan queued/processing) + daftar template aktif.
     */
    public function index()
    {
        $documents = Document::with('template')
            ->whereNotIn('status', ['queued', 'processing'])
            ->orderByDesc('updated_at')
            ->limit(100)
            ->get()
            ->map(fn($doc) => [
                'id'            => $doc->id,
                'original_name' => $doc->original_name,
                'status'        => $doc->status,
                'template_name' => $doc->template?->type_name,
                'file_path'     => $doc->file_path,
                'processed_at'  => $doc->updated_at->format('d M Y, H:i'),
            ]);

        $templates = DocumentTemplate::whereRaw('is_active = true')
            ->orderBy('type_name')
            ->get(['id', 'type_name', 'template_code', 'mapping_config']);

        return Inertia::render('DebugOCR', [
            'documents'       => $documents,
            'templates'       => $templates,
            'pythonEngineUrl' => config('services.python_engine.url'),
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    // MODE 1 — Paddle OCR global scan
    // ─────────────────────────────────────────────────────────────

    /**
     * Proxy POST /internal-api/debug-ocr → Python Engine /debug-ocr.
     */
    public function proxy(Request $request)
    {
        $request->validate([
            'document_id' => 'required|integer|exists:documents,id',
        ]);

        $document  = Document::findOrFail($request->document_id);
        $imagePath = $this->deriveImagePath($document);

        try {
            $response = Http::timeout(90)->post(
                config('services.python_engine.url') . '/debug-ocr',
                ['image_path' => $imagePath]
            );

            if ($response->failed()) {
                return response()->json(['error' => 'Python Engine error: ' . $response->body()], 500);
            }

            return response()->json($response->json());

        } catch (\Exception $e) {
            return response()->json(['error' => 'Tidak bisa terhubung ke Python Engine: ' . $e->getMessage()], 503);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // MODE 2 — Template Mapping debug
    // ─────────────────────────────────────────────────────────────

    /**
     * Proxy POST /internal-api/debug-template → Python Engine /debug-template.
     * Ambil mapping_config dari template yang dipilih, kirim ke Python bersama image_path.
     * Python mengembalikan anchor/value boxes per field dan per tabel.
     */
    public function debugTemplate(Request $request)
    {
        $request->validate([
            'document_id' => 'required|integer|exists:documents,id',
            'template_id' => 'required|integer|exists:document_templates,id',
        ]);

        $document  = Document::findOrFail($request->document_id);
        $template  = DocumentTemplate::findOrFail($request->template_id);
        $imagePath = $this->deriveImagePath($document);

        try {
            $response = Http::timeout(120)->post(
                config('services.python_engine.url') . '/debug-template',
                [
                    'image_path'     => $imagePath,
                    'mapping_config' => $template->mapping_config ?? [],
                ]
            );

            if ($response->failed()) {
                return response()->json(['error' => 'Python Engine error: ' . $response->body()], 500);
            }

            return response()->json($response->json());

        } catch (\Exception $e) {
            return response()->json(['error' => 'Tidak bisa terhubung ke Python Engine: ' . $e->getMessage()], 503);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // HELPER
    // ─────────────────────────────────────────────────────────────

    /**
     * Derivasi image_path ke Python engine dari file_path dokumen di Supabase.
     *
     * Konvensi Python engine saat download Supabase:
     *   pdf_path = INPUT_DIR / "temp_{id}_{filename}"
     *   pages    → storage/pages/temp_{id}_{filestem}/page_1.png
     */
    private function deriveImagePath(Document $document): string
    {
        $filename = basename($document->file_path);             // "abc123_name.pdf"
        $fileStem = pathinfo($filename, PATHINFO_FILENAME);     // "abc123_name"
        $stem     = "temp_{$document->id}_{$fileStem}";

        return "storage/pages/{$stem}/page_1.png";
    }
}
