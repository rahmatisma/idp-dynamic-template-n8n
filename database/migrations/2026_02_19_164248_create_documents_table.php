<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            
            // --- IDENTITAS DOKUMEN ---
            // Relasi ke tabel users: Mencatat Engineer/NMS yang upload
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            
            // Relasi ke tabel document_templates: Template apa yang dipakai (opsional jika AI menebak sendiri)
            $table->foreignId('template_id')->nullable()->constrained('document_templates')->onDelete('set null');
            
            $table->string('original_name'); // Laporan_PM_Router.pdf
            $table->string('file_path');     // Lokasi PDF di server
            
            // --- ALUR KERJA (WORKFLOW) ---
            // Menggunakan tipe string agar aman di SQLite. 
            // Isinya: 'queued', 'processing', 'need_validation', 'completed', 'failed', 'rejected'
            $table->string('status')->default('queued'); 
            
            // Waktu untuk mengukur efisiensi orkestrasi n8n
            $table->timestamp('processing_started_at')->nullable();
            $table->timestamp('processing_ended_at')->nullable();

            // --- HASIL EKSTRAKSI (AI) ---
            // Hasil AI berupa JSON (teks & lokasi gambar crop dokumentasi)
            $table->json('extracted_data')->nullable(); 
            $table->decimal('confidence_score', 5, 2)->nullable(); // Ambang batas keyakinan OCR
            
            // --- VALIDASI (HUMAN-IN-THE-LOOP) ---
            // Relasi ke users: Mencatat siapa yang klik "Simpan Validasi"
            $table->foreignId('validated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->string('rejection_reason')->nullable(); // Alasan jika dokumen ditolak/buram

            // --- EVALUASI BAB 4 (PENGUJIAN AKURASI) ---
            $table->json('ground_truth')->nullable(); // Kunci jawaban ketikan manual
            $table->decimal('cer_score', 5, 2)->nullable(); // Persentase Character Error Rate
            
            // Metrik Confusion Matrix untuk deteksi koordinat
            $table->integer('tp_count')->default(0); // True Positive
            $table->integer('fp_count')->default(0); // False Positive
            $table->integer('fn_count')->default(0); // False Negative

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};