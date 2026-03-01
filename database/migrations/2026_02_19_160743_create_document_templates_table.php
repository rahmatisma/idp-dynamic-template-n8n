<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_templates', function (Blueprint $table) {
            $table->id();
            
            // Nama jenis dokumen (Misal: "Formulir PM", "Berita Acara", "SPK") [cite: 373, 376]
            $table->string('type_name');
            
            // Kode unik untuk mempermudah routing / trigger di n8n
            $table->string('template_code')->unique();
            
            // Relasi ke tabel users: Mencatat Admin yang membuat konfigurasi ini
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            
            // WAJIB ADA: Lokasi file master PDF kosong/terisi yang diunggah Admin 
            // untuk ditampilkan (dirender) sebagai background di Canvas Editor 
            $table->string('master_file_path'); 
            
            // INTI SKRIPSI: Menyimpan Array JSON berisi nama field, anchor text, 
            // jarak offset X & Y, dimensi kotak (Width/Height), dan tipe (Teks/Gambar) [cite: 511-512, 556-558]
            $table->json('mapping_config'); 
            
            // Penanda apakah template ini masih digunakan di perusahaan atau tidak
            $table->boolean('is_active')->default(true);
            
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_templates');
    }
};