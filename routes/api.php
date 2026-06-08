<?php

use App\Http\Controllers\DocumentController;
use App\Http\Controllers\TemplateController;
use Illuminate\Support\Facades\Route;

// ── Webhook dari n8n (PUBLIC — tidak butuh login, tidak butuh session) ──────
//
// Semua route di sini dipanggil oleh n8n, bukan browser user.
// Middleware grup 'api' bersifat stateless: tidak ada session, cookie, atau CSRF.
// Path otomatis mendapat prefix /api dari withRouting(api:) di bootstrap/app.php.

// n8n Node 2 — INSERT dokumen baru ke database
Route::post('/webhook/create-document', [DocumentController::class, 'createFromN8n'])
    ->name('webhook.create-document');

// n8n Node 3 & Node 6 — UPDATE status + hasil OCR
Route::patch('/webhook/ocr-result', [DocumentController::class, 'receiveOcrResult'])
    ->name('webhook.ocr-result');

// Alias sesuai node Step 4 & 5
Route::patch('/documents/{document}', [DocumentController::class, 'receiveOcrResult'])
    ->name('webhook.ocr-result-alias');

Route::post('/documents', [DocumentController::class, 'createFromN8n'])
    ->name('webhook.create-document-alias');

// n8n Template Workflow — INSERT/UPDATE template ke database
Route::post('/webhook/create-template', [TemplateController::class, 'createFromN8n'])
    ->name('webhook.create-template');

// External API for n8n/Other systems
Route::get('/templates', [TemplateController::class, 'listApi'])
    ->name('api.templates.list_external');

Route::get('/templates/{template}', [TemplateController::class, 'showApi'])
    ->name('api.templates.show_external');
