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
        'master_file_path',
        'master_image_path',
        'mapping_config',
        'is_active',
        'version',
        'parent_id',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'mapping_config' => 'array',
            'is_active' => 'boolean',
            'version' => 'integer',
        ];
    }

    /**
     * Relasi ke tabel User: Template ini dibuat oleh 1 Admin
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the parent version of this template.
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(DocumentTemplate::class, 'parent_id');
    }

    /**
     * Get the child versions of this template.
     */
    public function versions()
    {
        return $this->hasMany(DocumentTemplate::class, 'parent_id');
    }
}