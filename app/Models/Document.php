<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Document extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'template_id',
        'original_name',
        'file_path',
        'status',
        'processing_started_at',
        'processing_ended_at',
        'extracted_data',
        'confidence_score',
        'validated_by',
        'rejection_reason',
        'ground_truth',
        'cer_score',
        'tp_count',
        'fp_count',
        'fn_count',
    ];

    protected function casts(): array
    {
        return [
            // Casting JSON ke Array
            'extracted_data' => 'array',
            'ground_truth' => 'array',
            
            // Casting waktu dan angka desimal
            'processing_started_at' => 'datetime',
            'processing_ended_at' => 'datetime',
            'confidence_score' => 'decimal:2',
            'cer_score' => 'decimal:2',
        ];
    }

    // --- RELASI ANTAR TABEL ---

    // 1. Dokumen ini di-upload oleh siapa?
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    // 2. Dokumen ini divalidasi oleh siapa?
    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    // 3. Dokumen ini menggunakan format template mana?
    public function template(): BelongsTo
    {
        return $this->belongsTo(DocumentTemplate::class, 'template_id');
    }
}