<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('document_templates', function (Blueprint $table) {
            $table->integer('version')->default(1)->after('mapping_config');
            $table->foreignId('parent_id')->nullable()->after('version')->constrained('document_templates')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('document_templates', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn(['version', 'parent_id']);
        });
    }
};
