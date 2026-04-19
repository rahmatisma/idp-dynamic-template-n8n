<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'user_id',
        'auditable_id',
        'auditable_type',
        'event',
        'old_values',
        'new_values',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    /**
     * Get the owning auditable model.
     */
    public function auditable()
    {
        return $this->morphTo();
    }

    /**
     * Get the user who performed the action.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
