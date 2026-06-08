<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\TemplateController;
use App\Http\Controllers\ValidationController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\DebugOCRController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ── Public ─────────────────────────────────────────────────────
Route::get('/', function () {
    return redirect()->route('login');
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
    Route::delete('/dokumen/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');
    Route::get('/dokumen/{document}/detail', [DocumentController::class, 'detail'])->name('documents.detail');

    // ── Validasi Dokumen ──────────────────────────────────────
    Route::get('/validasi-dokumen',                      [ValidationController::class, 'index'])->name('validasi-dokumen');
    Route::get('/validasi-dokumen/{document}',           [ValidationController::class, 'show'])->name('validasi-dokumen.show');
    Route::patch('/validasi-dokumen/{document}/approve', [ValidationController::class, 'approve'])->name('validasi-dokumen.approve');
    Route::patch('/validasi-dokumen/{document}/reject',  [ValidationController::class, 'reject'])->name('validasi-dokumen.reject');
    Route::patch('/validasi-dokumen/{document}/update',  [ValidationController::class, 'update'])->name('validasi-dokumen.update');

    // ── Master Template ───────────────────────────────────────
    Route::get('/master-template',                       [TemplateController::class, 'index'])->name('master-template');
    Route::get('/master-template/create',                [TemplateController::class, 'create'])->name('master-template.create');
    Route::get('/master-template/{template}/edit',       [TemplateController::class, 'edit'])->name('master-template.edit');
    Route::patch('/master-template/{template}',          [TemplateController::class, 'update'])->name('master-template.update');
    Route::delete('/master-template/{template}',         [TemplateController::class, 'destroy'])->name('master-template.destroy');

    // ── User Management (Admin only) ───────────────────────────
    Route::middleware('admin')->group(function () {
        Route::get('/user-management',                       [UserManagementController::class, 'index'])->name('user-management');
        Route::patch('/user-management/{user}/approve',      [UserManagementController::class, 'approve'])->name('user-management.approve');
        Route::patch('/user-management/{user}/reject',       [UserManagementController::class, 'reject'])->name('user-management.reject');
        Route::patch('/user-management/{user}/role',         [UserManagementController::class, 'updateRole'])->name('user-management.role');
        Route::delete('/user-management/{user}',             [UserManagementController::class, 'destroy'])->name('user-management.destroy');
    });

    // ── Debug OCR (Admin only) ─────────────────────────────────
    Route::middleware('admin')->group(function () {
        Route::get('/debug-ocr', [DebugOCRController::class, 'index'])->name('debug.ocr');
    });

    // ── Internal API (dipanggil fetch() dari React) ───────────
    Route::prefix('internal-api')->name('api.')->group(function () {

        // Convert PDF → PNG untuk Canvas Editor template
        Route::post('/template/convert-pdf', [TemplateController::class, 'convertPdf'])->name('template.convert-pdf');
        
        // OCR cepat untuk crop area di editor
        Route::post('/template/ocr-predict', [TemplateController::class, 'ocrPredict'])->name('template.ocr-predict');

        // Deteksi Header otomatis untuk Identifier
        Route::post('/template/detect-header', [TemplateController::class, 'detectHeader'])->name('template.detect-header');

        // Simpan konfigurasi template (JSON mapping_config) ke database
        Route::post('/template/save',        [TemplateController::class, 'save'])->name('template.save');

        // Clone (Duplikasi) template yang sudah ada
        Route::post('/template/{template}/clone', [TemplateController::class, 'clone'])->name('template.clone');

        // Ambil daftar template aktif (untuk dropdown Upload Dokumen)
        Route::get('/templates',             [TemplateController::class, 'list'])->name('templates.list');

        // Polling status dokumen dari React (setiap 5 detik)
        Route::get('/documents/{document}/status', [DocumentController::class, 'getStatus'])->name('documents.status');

        // Debug OCR — proxy ke Python engine /debug-ocr (Paddle global scan)
        Route::post('/debug-ocr', [DebugOCRController::class, 'proxy'])->name('debug-ocr.proxy');

        // Debug Template — proxy ke Python engine /debug-template (template mapping)
        Route::post('/debug-template', [DebugOCRController::class, 'debugTemplate'])->name('debug-template.proxy');
    });
});

require __DIR__ . '/auth.php';