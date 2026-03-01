import { useState, useRef, useCallback } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// ── Icons ──────────────────────────────────────────────────────
const BackIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
);
const UploadIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);
const PlusIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);
const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const SaveIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
);

// ── Mode gambar ────────────────────────────────────────────────
const MODE = { NONE: "none", ANCHOR: "anchor", VALUE: "value" };

// ── Canvas Editor Component ────────────────────────────────────
function CanvasEditor({ imageUrl, fields, activeIdx, onBoxDrawn, drawMode }) {
    const containerRef = useRef(null);
    const imgRef       = useRef(null);
    const [scale, setScale]       = useState(1);
    const [drawing, setDrawing]   = useState(false);
    const [startPt, setStartPt]   = useState(null);
    const [curPt, setCurPt]       = useState(null);

    const onImageLoad = useCallback(() => {
        if (!containerRef.current || !imgRef.current) return;
        setScale(containerRef.current.clientWidth / imgRef.current.naturalWidth);
    }, []);

    const getPos = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    const onMouseDown = (e) => {
        if (drawMode === MODE.NONE || activeIdx === null) return;
        e.preventDefault();
        const pos = getPos(e);
        setDrawing(true);
        setStartPt(pos);
        setCurPt(pos);
    };

    const onMouseMove = (e) => {
        if (!drawing) return;
        setCurPt(getPos(e));
    };

    const onMouseUp = (e) => {
        if (!drawing || !startPt) return;
        const end = getPos(e);
        const box = {
            x:      Math.round(Math.min(startPt.x, end.x)),
            y:      Math.round(Math.min(startPt.y, end.y)),
            width:  Math.round(Math.abs(end.x - startPt.x)),
            height: Math.round(Math.abs(end.y - startPt.y)),
        };
        if (box.width > 5 && box.height > 5) onBoxDrawn(box, drawMode);
        setDrawing(false);
        setStartPt(null);
        setCurPt(null);
    };

    // Kotak sementara saat drag
    const tempBox = drawing && startPt && curPt ? {
        left:   Math.min(startPt.x, curPt.x) * scale,
        top:    Math.min(startPt.y, curPt.y) * scale,
        width:  Math.abs(curPt.x - startPt.x) * scale,
        height: Math.abs(curPt.y - startPt.y) * scale,
    } : null;

    return (
        <div
            ref={containerRef}
            className="relative w-full rounded-xl border border-slate-200 bg-slate-100 overflow-hidden select-none"
            style={{ cursor: drawMode !== MODE.NONE && activeIdx !== null ? "crosshair" : "default" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { setDrawing(false); setStartPt(null); setCurPt(null); }}
        >
            {imageUrl ? (
                <>
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        alt="Dokumen"
                        className="w-full h-auto block"
                        onLoad={onImageLoad}
                        draggable={false}
                    />

                    {/* Render semua box yang sudah ada */}
                    {fields.map((field, fi) => (
                        <div key={fi}>
                            {field.anchor_box && (
                                <div
                                    className={`absolute border-2 pointer-events-none ${fi === activeIdx ? "border-amber-500 bg-amber-400/15" : "border-amber-400/60 bg-amber-400/5"}`}
                                    style={{
                                        left:   field.anchor_box.x * scale,
                                        top:    field.anchor_box.y * scale,
                                        width:  field.anchor_box.width * scale,
                                        height: field.anchor_box.height * scale,
                                    }}
                                >
                                    <span className="absolute -top-5 left-0 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
                                        A · {field.field_name || `field_${fi + 1}`}
                                    </span>
                                </div>
                            )}
                            {field.value_box && (
                                <div
                                    className={`absolute border-2 pointer-events-none ${fi === activeIdx ? "border-emerald-500 bg-emerald-400/15" : "border-emerald-400/60 bg-emerald-400/5"}`}
                                    style={{
                                        left:   field.value_box.x * scale,
                                        top:    field.value_box.y * scale,
                                        width:  field.value_box.width * scale,
                                        height: field.value_box.height * scale,
                                    }}
                                >
                                    <span className="absolute -top-5 left-0 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
                                        V · {field.field_name || `field_${fi + 1}`}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Kotak sementara saat drag */}
                    {tempBox && (
                        <div
                            className={`absolute border-2 pointer-events-none ${drawMode === MODE.ANCHOR ? "border-amber-500 bg-amber-400/15" : "border-emerald-500 bg-emerald-400/15"}`}
                            style={{ left: tempBox.left, top: tempBox.top, width: tempBox.width, height: tempBox.height }}
                        />
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-72 gap-3 text-slate-400">
                    <UploadIcon />
                    <p className="text-sm">Upload PDF master untuk memulai</p>
                </div>
            )}
        </div>
    );
}

// ── Halaman Create/Edit ────────────────────────────────────────
export default function MasterTemplateEditor({ editingTemplate = null }) {
    const isEdit = !!editingTemplate;

    const [imageUrl, setImageUrl]   = useState(editingTemplate?.master_file_url ?? null);
    const [pdfPath, setPdfPath]     = useState(editingTemplate?.master_file_path ?? null);
    const [pdfFile, setPdfFile]     = useState(null);
    const [converting, setConverting] = useState(false);

    const [typeName, setTypeName]   = useState(editingTemplate?.type_name ?? "");
    const [drawMode, setDrawMode]   = useState(MODE.NONE);
    const [activeIdx, setActiveIdx] = useState(null);
    const [saving, setSaving]       = useState(false);
    const [saveMsg, setSaveMsg]     = useState(null);

    const [fields, setFields] = useState(
        editingTemplate?.mapping_config ?? [
            { field_name: "", anchor_keyword: "", anchor_box: null, value_box: null, field_type: "handwritten" }
        ]
    );

    const fileInputRef = useRef(null);

    // ── Upload & Convert PDF ───────────────────────────────────
    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== "application/pdf") return;
        setPdfFile(file);
        setConverting(true);

        const formData = new FormData();
        formData.append("pdf", file);

        try {
            const res = await fetch("/api/template/convert-pdf", {
                method: "POST",
                body: formData,
                headers: { "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.content },
            });
            const data = await res.json();
            if (data.image_url) {
                setImageUrl(data.image_url);
                setPdfPath(data.pdf_path);
            }
        } catch (err) {
            alert("Gagal memproses PDF. Pastikan Python Engine sudah berjalan.");
        } finally {
            setConverting(false);
        }
    };

    // ── Saat user selesai gambar kotak ─────────────────────────
    const handleBoxDrawn = (box, mode) => {
        if (activeIdx === null) return;
        setFields((prev) => {
            const updated = [...prev];
            if (mode === MODE.ANCHOR) {
                updated[activeIdx] = { ...updated[activeIdx], anchor_box: box };
                // Auto switch ke value mode setelah gambar anchor
                setDrawMode(MODE.VALUE);
            } else {
                updated[activeIdx] = { ...updated[activeIdx], value_box: box };
                setDrawMode(MODE.NONE);
            }
            return updated;
        });
    };

    // ── CRUD Fields ────────────────────────────────────────────
    const addField = () => {
        const newIdx = fields.length;
        setFields((prev) => [...prev, { field_name: "", anchor_keyword: "", anchor_box: null, value_box: null, field_type: "handwritten" }]);
        setActiveIdx(newIdx);
        setDrawMode(MODE.NONE);
    };

    const removeField = (idx) => {
        setFields((prev) => prev.filter((_, i) => i !== idx));
        setActiveIdx(null);
        setDrawMode(MODE.NONE);
    };

    const updateField = (idx, key, val) => {
        setFields((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [key]: val };
            return updated;
        });
    };

    // ── Hitung offset & Simpan ─────────────────────────────────
    const handleSave = async () => {
        if (!typeName.trim()) return alert("Nama template wajib diisi.");
        if (!pdfPath) return alert("Upload PDF master terlebih dahulu.");

        const computed = fields.map((f) => ({
            ...f,
            offset_x:     f.anchor_box && f.value_box ? f.value_box.x - f.anchor_box.x : 0,
            offset_y:     f.anchor_box && f.value_box ? f.value_box.y - f.anchor_box.y : 0,
            value_width:  f.value_box?.width  ?? 0,
            value_height: f.value_box?.height ?? 0,
        }));

        setSaving(true);
        setSaveMsg(null);

        try {
            const res = await fetch("/api/template/save", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.content,
                },
                body: JSON.stringify({
                    template_name: typeName.toLowerCase().replace(/\s+/g, "_"),
                    type_name:     typeName,
                    pdf_path:      pdfPath,
                    fields:        computed,
                    ...(isEdit && { template_id: editingTemplate.id }),
                }),
            });

            if (res.ok) {
                setSaveMsg("success");
                setTimeout(() => router.visit("/master-template"), 1200);
            } else {
                setSaveMsg("error");
            }
        } catch {
            setSaveMsg("error");
        } finally {
            setSaving(false);
        }
    };

    // ── Field yang sedang aktif ────────────────────────────────
    const activeField = activeIdx !== null ? fields[activeIdx] : null;

    return (
        <AuthenticatedLayout header={isEdit ? "Edit Template" : "Buat Template"}>
            <Head title={isEdit ? "Edit Template" : "Buat Template"} />

            <div className="flex flex-col gap-4 h-full">

                {/* Topbar */}
                <div className="flex items-center justify-between">
                    <Link href="/master-template" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition">
                        <BackIcon /> Kembali ke daftar
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving || !typeName.trim() || !pdfPath}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                            saveMsg === "success"
                                ? "bg-emerald-500 text-white"
                                : saving || !typeName.trim() || !pdfPath
                                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                    : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90 shadow-sm shadow-indigo-200"
                        }`}
                    >
                        <SaveIcon />
                        {saving ? "Menyimpan…" : saveMsg === "success" ? "✓ Tersimpan!" : "Simpan Template"}
                    </button>
                </div>

                {saveMsg === "error" && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                        Gagal menyimpan. Cek koneksi ke server.
                    </div>
                )}

                {/* Layout utama: Canvas kiri, Panel kanan */}
                <div className="flex gap-5 flex-1 min-h-0">

                    {/* ── Panel Kiri: Canvas ── */}
                    <div className="flex-1 min-w-0 flex flex-col gap-4">

                        {/* Upload PDF */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700">PDF Master</p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                    {pdfFile ? pdfFile.name : imageUrl ? "File sudah ada" : "Belum ada file dipilih"}
                                </p>
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={converting}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-60"
                            >
                                <UploadIcon />
                                {converting ? "Memproses…" : "Upload PDF"}
                            </button>
                            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                        </div>

                        {/* Toolbar mode gambar */}
                        {imageUrl && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex items-center gap-3 flex-wrap">
                                <p className="text-xs font-semibold text-slate-500">Mode Gambar:</p>

                                {[
                                    { mode: MODE.ANCHOR, label: "Anchor (Label)", color: "amber" },
                                    { mode: MODE.VALUE,  label: "Value (Isian)",  color: "emerald" },
                                ].map(({ mode, label, color }) => (
                                    <button
                                        key={mode}
                                        onClick={() => setDrawMode(drawMode === mode ? MODE.NONE : mode)}
                                        disabled={activeIdx === null}
                                        className={[
                                            "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                                            drawMode === mode
                                                ? color === "amber" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                                                : color === "amber" ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
                                            activeIdx === null ? "opacity-40 cursor-not-allowed" : "",
                                        ].join(" ")}
                                    >
                                        {label}
                                    </button>
                                ))}

                                {activeIdx === null && (
                                    <p className="text-xs text-slate-400">← Pilih field di panel kanan dulu</p>
                                )}
                                {activeIdx !== null && (
                                    <p className="text-xs text-slate-400">
                                        Field aktif: <strong className="text-slate-600">{fields[activeIdx]?.field_name || `field_${activeIdx + 1}`}</strong>
                                        {" · "}
                                        {drawMode === MODE.NONE ? "Pilih mode gambar" : drawMode === MODE.ANCHOR ? "Klik drag di atas LABEL" : "Klik drag di atas AREA ISIAN"}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Canvas */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-1 overflow-auto">
                            <CanvasEditor
                                imageUrl={imageUrl}
                                fields={fields}
                                activeIdx={activeIdx}
                                onBoxDrawn={handleBoxDrawn}
                                drawMode={drawMode}
                            />
                        </div>
                    </div>

                    {/* ── Panel Kanan: Properti ── */}
                    <div className="w-72 flex-shrink-0 flex flex-col gap-4">

                        {/* Nama Template */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Template</label>
                            <input
                                type="text"
                                value={typeName}
                                onChange={(e) => setTypeName(e.target.value)}
                                placeholder="contoh: Formulir PM Vendor A"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                            />
                        </div>

                        {/* Daftar Field */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Fields <span className="ml-1 text-indigo-600">{fields.length}</span>
                                </p>
                                <button onClick={addField} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition">
                                    <PlusIcon /> Tambah
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                                {fields.map((field, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => { setActiveIdx(idx); setDrawMode(MODE.NONE); }}
                                        className={`p-4 cursor-pointer transition ${
                                            activeIdx === idx
                                                ? "bg-indigo-50 border-l-2 border-l-indigo-500"
                                                : "hover:bg-slate-50"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-xs font-semibold text-slate-500">Field #{idx + 1}</p>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeField(idx); }}
                                                className="text-slate-300 hover:text-red-400 transition"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>

                                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={field.field_name}
                                                onChange={(e) => updateField(idx, "field_name", e.target.value)}
                                                placeholder="Nama field (location)"
                                                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                                            />
                                            <input
                                                type="text"
                                                value={field.anchor_keyword}
                                                onChange={(e) => updateField(idx, "anchor_keyword", e.target.value)}
                                                placeholder="Kata kunci anchor (Location)"
                                                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition placeholder-slate-300"
                                            />
                                            <select
                                                value={field.field_type}
                                                onChange={(e) => updateField(idx, "field_type", e.target.value)}
                                                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition text-slate-600"
                                            >
                                                <option value="handwritten">Tulisan Tangan (TrOCR)</option>
                                                <option value="printed">Teks Cetak (PaddleOCR)</option>
                                            </select>
                                        </div>

                                        {/* Koordinat */}
                                        {activeIdx === idx && (field.anchor_box || field.value_box) && (
                                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                                {field.anchor_box && (
                                                    <div>
                                                        <p className="text-[10px] font-semibold text-amber-600 mb-1">Anchor Box</p>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {["x", "y", "width", "height"].map((k) => (
                                                                <div key={k} className="bg-amber-50 rounded-lg px-2 py-1.5">
                                                                    <p className="text-[9px] text-amber-500 uppercase">{k}</p>
                                                                    <p className="text-xs font-semibold text-slate-700">{field.anchor_box[k]}px</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {field.value_box && (
                                                    <div>
                                                        <p className="text-[10px] font-semibold text-emerald-600 mb-1">Value Box</p>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {["x", "y", "width", "height"].map((k) => (
                                                                <div key={k} className="bg-emerald-50 rounded-lg px-2 py-1.5">
                                                                    <p className="text-[9px] text-emerald-500 uppercase">{k}</p>
                                                                    <p className="text-xs font-semibold text-slate-700">{field.value_box[k]}px</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {field.anchor_box && field.value_box && (
                                                    <div>
                                                        <p className="text-[10px] font-semibold text-indigo-600 mb-1">Offset (dihitung otomatis)</p>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            <div className="bg-indigo-50 rounded-lg px-2 py-1.5">
                                                                <p className="text-[9px] text-indigo-400 uppercase">offset x</p>
                                                                <p className="text-xs font-semibold text-slate-700">{field.value_box.x - field.anchor_box.x}px</p>
                                                            </div>
                                                            <div className="bg-indigo-50 rounded-lg px-2 py-1.5">
                                                                <p className="text-[9px] text-indigo-400 uppercase">offset y</p>
                                                                <p className="text-xs font-semibold text-slate-700">{field.value_box.y - field.anchor_box.y}px</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Status badge */}
                                        <div className="flex gap-1.5 mt-3">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${field.anchor_box ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"}`}>
                                                {field.anchor_box ? "✓ Anchor" : "○ Anchor"}
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${field.value_box ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                                                {field.value_box ? "✓ Value" : "○ Value"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}