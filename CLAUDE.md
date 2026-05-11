# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**IDP Lintasarta** (Intelligent Document Processing) is a full-stack system that automatically extracts structured data from scanned PDF forms (Preventive Maintenance reports) using hybrid OCR. It consists of:

1. **Laravel 12 backend** — web UI, file storage, user auth, database, n8n webhook integration
2. **Python Flask engine** (`python-engine/`) — AI/OCR pipeline using PaddleOCR + TrOCR
3. **n8n** (external workflow automation tool) — orchestrates the async pipeline between Laravel and the Python engine

## Development Commands

### Laravel (run from project root)

```bash
# Start all services in parallel (Laravel server + queue + logs + Vite dev)
composer run dev

# Or manually:
php artisan serve         # Laravel at http://localhost:8000
npm run dev               # Vite HMR
php artisan queue:listen --tries=1 --timeout=0
```

```bash
# Build frontend for production
npm run build

# Run tests
composer run test         # = php artisan config:clear && php artisan test
php artisan test --filter=TestName   # single test

# Code formatting
./vendor/bin/pint         # Laravel Pint (PSR-12)

# Database
php artisan migrate
php artisan migrate:fresh --seed
```

### Python Engine (run from `python-engine/`)

```bash
cd python-engine
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Start Flask server (port 5000)
python main.py

# Install dependencies
pip install -r requirements
```

**Note:** First startup takes 5-7 minutes — TrOCR model (~1GB) loads in background. The server is responsive during this time but handwriting OCR falls back to PaddleOCR until ready.

## Architecture

### End-to-End Document Flow

```
User uploads PDF (Laravel)
  → trigger sent to n8n webhook
    → n8n: create DB record, mark "processing"
    → n8n: POST /convert-pdf  (Python Engine: PDF → PNG per page)
    → n8n: POST /process      (Python Engine: full OCR pipeline)
    → n8n: IF confidence > 80 → "completed" ELSE "need_validation"
    → n8n: PATCH /api/documents/{id} (back to Laravel)
Laravel stores result in DB (Supabase PostgreSQL)
```

**Critical:** Laravel does NOT insert documents into the database on upload — n8n does it via webhook. Laravel only saves the file and fires the trigger.

### Laravel Structure

- **Controllers** (`app/Http/Controllers/`):
  - `DocumentController` — upload, status polling, detail view, n8n webhook receivers
  - `TemplateController` — CRUD for document templates, canvas editor API, n8n template sync
  - `ValidationController` — human review/approval of low-confidence extractions
  - `UserManagementController` — admin user approval/role management

- **Models**:
  - `Document` — stores extracted JSON, confidence scores, TP/FP/FN counts, status
  - `DocumentTemplate` — stores `mapping_config` (JSON "brain" for OCR extraction) and `ui_metadata` (canvas editor state)
  - `User` — has `role` (admin/user) and `is_approved` fields

- **Routes** (`routes/web.php`):
  - Standard auth-protected web routes using Inertia
  - `/internal-api/*` — called by React via `fetch()` for canvas editor operations
  - `/api/webhook/*` and `/api/documents/*` — public routes for n8n (no CSRF, no auth)

- **Frontend** (`resources/js/`): React + Inertia.js + Tailwind CSS
  - `MasterTemplateEditor.jsx` — large canvas-based template editor (78KB, most complex component)
  - `UploadDokumen.jsx` — upload form with polling for processing status
  - `DocumentDetail.jsx` — displays extracted data
  - Uses Supabase JS client for direct frontend queries

### Python Engine Structure (`python-engine/app/services/`)

| File | Role |
|---|---|
| `ocr_engine.py` | Orchestrator — calls all services per page |
| `processor.py` | `HybridProcessor` — wraps extraction + TP/FP/FN evaluation |
| `table_extractor.py` | Dynamic table row/column extraction (largest file, most complex) |
| `field_extractor.py` | Header field extraction using anchor-based positioning |
| `ocr_service.py` | PaddleOCR singleton wrapper |
| `trocr_service.py` | TrOCR Microsoft model wrapper (handwritten text) |
| `template_mapper.py` | Fuzzy anchor search + coordinate calculation |
| `preprocessor.py` | CLAHE contrast + denoise before OCR |
| `pdf_converter.py` | PDF → PNG via pdf2image (Poppler) |
| `json_builder.py` | Assembles hierarchical output JSON |

**Key optimization:** PaddleOCR runs **once per page** and its results (`ocr_results`) are reused by both field and table extractors. TrOCR is only called for cells/fields with `type: "handwritten"` and skipped if PaddleOCR detects no content there.

### Template `mapping_config` Schema

Templates drive all extraction. The `mapping_config` JSON stored in `document_templates` tells the Python engine how to parse each document type:

```json
{
  "identifier_text": "PREVENTIVE MAINTENANCE FM-LAP",  // fuzzy matched against doc header
  "fields": [
    {
      "field_name": "location",
      "field_type": "printed|handwriting",
      "anchor_keyword": "Location",   // text to find on page
      "offset_x": 120,               // pixels right of anchor
      "offset_y": -5,                // pixels above/below anchor
      "width": 200,
      "height": 25
    }
  ],
  "tables": [
    {
      "table_name": "checklist",
      "anchor": { "texts": ["No", "Descriptions"] },
      "row_detection": { "method": "gap_based|anchor_based" },
      "columns": [
        { "key": "descriptions", "type": "printed", "offset_x_start": 50, "offset_x_end": 350, "is_row_anchor": true, "multi_line": true },
        { "key": "result", "type": "handwritten", "offset_x_start": 350, "offset_x_end": 500 }
      ]
    }
  ]
}
```

### Database (Supabase PostgreSQL)

Key tables: `users`, `document_templates`, `documents`, `audit_logs`

The `documents` table tracks the full OCR lifecycle via `status`:
`queued` → `processing` → `completed` | `need_validation` | `failed`

## Environment Configuration

### Laravel (`.env`)
- `PYTHON_ENGINE_URL` — Flask server URL (default: `http://localhost:5000`)
- `N8N_WEBHOOK_URL` — n8n trigger webhook
- `DB_*` — Supabase PostgreSQL connection (uses port 6543 pooler)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — for frontend Supabase client

### Python Engine (`python-engine/.env`)
- `APP_PORT` — Flask port (default: 5000)
- `TROCR_ENABLED` — Set `false` if RAM < 4GB (TrOCR needs ~4GB)
- `LARAVEL_API_URL` — Used to fetch active templates if n8n doesn't send them
- `STORAGE_INPUT/PAGES/CROPS` — relative paths under `python-engine/`

## User Roles & Auth

- Built with **Laravel Breeze** (session-based auth)
- New users require admin approval (`is_approved = true`) before login
- Roles: `admin` (full access) and `user` (upload + view own docs)
- `admin` middleware guards `/user-management` routes

## Dataset Split

Data TrOCR dibagi menjadi training set dan test set. **Jangan pernah mencampurkan keduanya.**

### Test Set (5 dokumen — `python-engine/Dataset/test_set/`)

| Dokumen | Keterangan |
|---|---|
| POP-CILEUNYI | 441 crop |
| POP-WISMA-BUMI-PUTERA | 211 crop |
| POP-BBU_WISMA_BUMI_PUTERA | 182 crop |
| FORM_PM_POP_GRAND_MALL_BEKASI | 224 crop |
| POP-PADALARANG | 170 crop |

Label test set disimpan di `Dataset/labels_test.csv` (646 crop berlabel, 582 belum dilabel).

### Training Set (43 dokumen — `python-engine/Dataset/raw_crops/`)

Semua dokumen selain 5 di atas. Label disimpan di `Dataset/labels.csv` (3.964 crop, semua sudah dilabel per 2025-05-10).

### Aturan Penting

> **JANGAN PERNAH** gunakan 5 dokumen test set (POP-CILEUNYI, POP-WISMA-BUMI-PUTERA, POP-BBU_WISMA_BUMI_PUTERA, FORM_PM_POP_GRAND_MALL_BEKASI, POP-PADALARANG) untuk training atau fine-tuning model TrOCR. Dokumen-dokumen ini hanya boleh digunakan untuk evaluasi akhir.

ini adalah Tugas Akhir di Politeknik Negeri Lhokseumawe, kontribusi utama penelitian adalah arsitektur Dynamic Template Mapping bukan fine-tuning OCR, dan selalu jawab dalam Bahasa Indonesia