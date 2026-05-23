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
            if (!Schema::hasColumn('document_templates', 'master_image_path')) {
                $table->string('master_image_path')->nullable()->after('master_file_path');
            }
            if (!Schema::hasColumn('document_templates', 'template_version')) {
                $table->string('template_version')->nullable()->after('ui_metadata');
            }
            if (!Schema::hasColumn('document_templates', 'doc_version')) {
                $table->string('doc_version')->nullable()->after('template_version');
            }
            if (!Schema::hasColumn('document_templates', 'structural_fingerprint')) {
                $table->text('structural_fingerprint')->nullable()->after('doc_version');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('document_templates', function (Blueprint $table) {
            $table->dropColumn([
                'master_image_path',
                'template_version',
                'doc_version',
                'structural_fingerprint',
            ]);
        });
    }
};
