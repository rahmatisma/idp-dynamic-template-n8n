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

        $query = Document::with(['uploader', 'template']);

        if ($status === 'completed') {
            $query->where('status', 'completed');
        } elseif ($status === 'all') {
            $query->whereIn('status', ['need_validation', 'completed']);
        } else {
            $status = 'need_validation';
            $query->where('status', 'need_validation');
        }

        $documents = $query->orderByDesc('processing_ended_at')
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
            'documents'     => $documents,
            'currentStatus' => $status,
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

        // Gunakan revised_data jika ada, fallback ke extracted_data yang tersimpan
        $dataToSave = ($request->has('revised_data') && $request->revised_data !== null)
            ? $request->revised_data
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
            ? $request->revised_data
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
}