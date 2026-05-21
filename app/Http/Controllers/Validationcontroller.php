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
     * Daftar dokumen yang menunggu validasi (status: need_validation).
     */
    public function index()
    {
        $documents = Document::with(['uploader', 'template'])
            ->where('status', 'need_validation')
            ->orderByDesc('processing_ended_at')
            ->paginate(15)
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
            'documents' => $documents,
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
     */
    public function approve(Request $request, Document $document)
    {
        $request->validate([
            'extracted_data' => 'required|array',
        ]);

        $document->update([
            'status'         => 'completed',
            'extracted_data' => $request->extracted_data,
            'validated_by'   => Auth::id(),
        ]);

        return back()->with('success', 'Dokumen berhasil divalidasi.');
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
}