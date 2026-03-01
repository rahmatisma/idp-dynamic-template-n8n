<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\User;

class DocumentTemplate extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'type_name',
        'template_code',
        'created_by',
        'master_file_path', // Sudah ditambahkan agar tidak error saat Admin upload file master
        'mapping_config',   // JSON konfigurasi koordinat dan offset
        'is_active',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            // Laravel akan otomatis mengubah string JSON di database 
            // menjadi bentuk Array yang mudah dibaca oleh React / n8n
            'mapping_config' => 'array', 
            'is_active' => 'boolean',
        ];
    }

    /**
     * Relasi ke tabel User: Template ini dibuat oleh 1 Admin
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}