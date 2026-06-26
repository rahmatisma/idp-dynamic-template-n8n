<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * Cast boolean yang aman untuk PostgreSQL via Supabase pooler (emulated prepares).
 *
 * Masalah: Laravel (Connection::prepareBindings) selalu mengubah boolean PHP
 * menjadi integer (false→0, true→1) sebelum binding. Dengan emulated prepares
 * (wajib untuk transaction pooler Supabase, port 6543), integer itu disisipkan
 * sebagai literal telanjang (mis. `... 0 ...`) ke dalam SQL, dan PostgreSQL yang
 * strict menolaknya untuk kolom bertipe boolean:
 *   SQLSTATE[42804]: column "is_approved" is of type boolean but expression is of type integer
 *
 * Solusi: saat MENULIS, kembalikan STRING 'true'/'false' (bukan boolean PHP) agar
 * tidak terkena konversi bool→int dan dikirim sebagai string yang langsung
 * dipahami PostgreSQL ('true'/'false'::boolean). Saat MEMBACA, kembalikan boolean
 * PHP yang benar dari berbagai representasi yang mungkin (true/1/'1'/'t'/'true').
 *
 * Call site tetap menulis boolean PHP biasa: ['is_approved' => false].
 */
class AsPgBoolean implements CastsAttributes
{
    /**
     * Baca dari database → boolean PHP.
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?bool
    {
        if ($value === null) {
            return null;
        }

        return in_array($value, [true, 1, '1', 't', 'true'], true);
    }

    /**
     * Tulis ke database → string 'true'/'false' (atau null) agar tidak
     * dikonversi menjadi integer oleh Laravel.
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        if ($value === null) {
            return [$key => null];
        }

        return [$key => filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false'];
    }
}
