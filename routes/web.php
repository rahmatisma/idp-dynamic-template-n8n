<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\TemplateController;
use App\Http\Controllers\ValidationController;
use App\Http\Controllers\UserManagementController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ── Public ─────────────────────────────────────────────────────
Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin'       => Route::has('login'),
        'canRegister'    => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion'     => PHP_VERSION,
    ]);
});

// ── Authenticated ───────────────────────────────────────────────
Route::middleware(['auth', 'verified'])->group(function () {

    // Dashboard
    Route::get('/dashboard', function () {
        return Inertia::render('Dashboard');
    })->name('dashboard');

    // Profile (bawaan Breeze)
    Route::get('/profile',    [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile',  [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    // ── Upload Dokumen ────────────────────────────────────────
    Route::get('/upload-dokumen',  [DocumentController::class, 'create'])->name('upload-dokumen');
    Route::post('/upload-dokumen', [DocumentController::class, 'store'])->name('upload-dokumen.store');

    // ── Validasi Dokumen ──────────────────────────────────────
    Route::get('/validasi-dokumen',                      [ValidationController::class, 'index'])->name('validasi-dokumen');
    Route::get('/validasi-dokumen/{document}',           [ValidationController::class, 'show'])->name('validasi-dokumen.show');
    Route::patch('/validasi-dokumen/{document}/approve', [ValidationController::class, 'approve'])->name('validasi-dokumen.approve');
    Route::patch('/validasi-dokumen/{document}/reject',  [ValidationController::class, 'reject'])->name('validasi-dokumen.reject');

    // ── Master Template ───────────────────────────────────────
    Route::get('/master-template',                       [TemplateController::class, 'index'])->name('master-template');
    Route::get('/master-template/create',                [TemplateController::class, 'create'])->name('master-template.create');
    Route::get('/master-template/{template}/edit',       [TemplateController::class, 'edit'])->name('master-template.edit');
    Route::patch('/master-template/{template}',          [TemplateController::class, 'update'])->name('master-template.update');
    Route::delete('/master-template/{template}',         [TemplateController::class, 'destroy'])->name('master-template.destroy');

    // ── User Management ───────────────────────────────────────
    Route::get('/user-management',                       [UserManagementController::class, 'index'])->name('user-management');
    Route::patch('/user-management/{user}/approve',      [UserManagementController::class, 'approve'])->name('user-management.approve');
    Route::patch('/user-management/{user}/reject',       [UserManagementController::class, 'reject'])->name('user-management.reject');
    Route::delete('/user-management/{user}',             [UserManagementController::class, 'destroy'])->name('user-management.destroy');

    // ── Internal API (dipanggil fetch() dari React) ───────────
    Route::prefix('internal-api')->name('api.')->group(function () {

        // Convert PDF → PNG untuk Canvas Editor template
        Route::post('/template/convert-pdf', [TemplateController::class, 'convertPdf'])->name('template.convert-pdf');

        // Simpan konfigurasi template (JSON mapping_config) ke database
        Route::post('/template/save',        [TemplateController::class, 'save'])->name('template.save');

        // Ambil daftar template aktif (untuk dropdown Upload Dokumen)
        Route::get('/templates',             [TemplateController::class, 'list'])->name('templates.list');

        // Polling status dokumen dari React (setiap 5 detik)
        Route::get('/documents/{document}/status', [DocumentController::class, 'getStatus'])->name('documents.status');
    });
});

// ── Webhook dari n8n (PUBLIC — tidak butuh login, tidak butuh CSRF) ──────────
//
// Semua route di bawah ini dipanggil oleh n8n, bukan oleh browser user.
// Oleh karena itu tidak perlu auth middleware dan CSRF token.

Route::withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class])
    ->group(function () {

        // n8n Node 2 — INSERT dokumen baru ke database
        // Dipanggil setelah n8n menerima trigger dari Laravel
        Route::post('/api/webhook/create-document', [DocumentController::class, 'createFromN8n'])
            ->name('webhook.create-document');

        // n8n Node 3 & Node 6 — UPDATE status + hasil OCR
        // Node 3: status = "processing"
        // Node 6: status = "need_validation" + extracted_data + confidence_score
        Route::patch('/api/webhook/ocr-result', [DocumentController::class, 'receiveOcrResult'])
            ->name('webhook.ocr-result');
    });

require __DIR__ . '/auth.php';