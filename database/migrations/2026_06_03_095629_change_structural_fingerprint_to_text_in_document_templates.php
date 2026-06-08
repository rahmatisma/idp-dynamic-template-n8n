<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            // PostgreSQL (Supabase): USING untuk cast eksplisit dari tipe lama ke text
            DB::statement('ALTER TABLE document_templates ALTER COLUMN structural_fingerprint TYPE TEXT USING structural_fingerprint::text');
        } else {
            // SQLite / MySQL
            \Illuminate\Support\Facades\Schema::table('document_templates', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->text('structural_fingerprint')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE document_templates ALTER COLUMN structural_fingerprint TYPE VARCHAR(255)');
        } else {
            \Illuminate\Support\Facades\Schema::table('document_templates', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->string('structural_fingerprint')->nullable()->change();
            });
        }
    }
};
