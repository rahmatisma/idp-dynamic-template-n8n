import axios from "axios";
import { useState, useRef, useCallback, useEffect } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router } from "@inertiajs/react";

// ══════════════════════════════════════════════════════════════
// ICONS
// ══════════════════════════════════════════════════════════════
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
const BoxIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
);
const TableIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
    </svg>
);
const FieldIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8" />
    </svg>
);
const RepeatIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const DRAW = {
    NONE: "none",
    ANCHOR: "anchor",
    TARGET: "target",
    TABLE_ANCHOR: "table_anchor",
    TABLE_AREA: "table_area",
    COLUMN: "column",
    SECTION_ANCHOR: "section_anchor",   // anchor/hint box untuk repeating section
};

const JSON_SECTIONS = [
    { value: "document", label: "document — Info Dokumen" },
    { value: "header", label: "header — Header Form" },
    { value: "notes", label: "notes — Catatan / Footer" },
    { value: "mengetahui", label: "mengetahui — Pengesah" },
];

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// ══════════════════════════════════════════════════════════════
// CANVAS EDITOR
// ══════════════════════════════════════════════════════════════
function CanvasEditor({ imageUrl, items, activeIdx, drawMode, zoom = 1, onBoxDrawn, onImageLoad: onImageLoadProp, currentPage = 1 }) {
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const [naturalSize, setNaturalSize] = useState(null);
    const [drawing, setDrawing] = useState(false);
    const [startPt, setStartPt] = useState(null); // {x, y} as ratios 0-1
    const [curPt, setCurPt] = useState(null);   // {x, y} as ratios 0-1

    const onImageLoad = (e) => {
        const size = {
            width: e.target.naturalWidth,
            height: e.target.naturalHeight
        };
        setNaturalSize(size);
        if (onImageLoadProp) onImageLoadProp(size);
    };

    const getPos = (e) => {
        if (!imgRef.current) return { x: 0, y: 0 };
        const rect = imgRef.current.getBoundingClientRect();
        // Return ratios 0-1
        return { 
            x: (e.clientX - rect.left) / rect.width, 
            y: (e.clientY - rect.top) / rect.height 
        };
    };

    const canDraw = drawMode !== DRAW.NONE;

    const onMouseDown = (e) => {
        if (!canDraw || !naturalSize) return;
        e.preventDefault();
        const pos = getPos(e);
        setDrawing(true); setStartPt(pos); setCurPt(pos);
    };
    const onMouseMove = (e) => { if (drawing) setCurPt(getPos(e)); };
    const onMouseUp = (e) => {
        if (!drawing || !startPt || !naturalSize) return;
        const end = getPos(e);
        
        // Simpan dalam rasio 0-1
        const box = {
            x: Math.min(startPt.x, end.x),
            y: Math.min(startPt.y, end.y),
            w: Math.abs(end.x - startPt.x),
            h: Math.abs(end.y - startPt.y),
        };

        if (box.w > 0.005 && box.h > 0.005) {
            onBoxDrawn(box, drawMode);
        }
        setDrawing(false); setStartPt(null); setCurPt(null);
    };

    const tempColor = {
        [DRAW.ANCHOR]: "border-amber-500 bg-amber-400/15",
        [DRAW.TARGET]: "border-indigo-500 bg-indigo-400/15",
        [DRAW.TABLE_ANCHOR]: "border-rose-500 bg-rose-400/15",
        [DRAW.TABLE_AREA]: "border-orange-500 bg-orange-400/10",
        [DRAW.COLUMN]: "border-green-500 bg-green-400/10",
        [DRAW.SECTION_ANCHOR]: "border-violet-500 bg-violet-400/15",
    }[drawMode] || "border-slate-400 bg-slate-400/10";

    const tempBox = drawing && startPt && curPt ? {
        left: Math.min(startPt.x, curPt.x) * 100,
        top: Math.min(startPt.y, curPt.y) * 100,
        width: Math.abs(curPt.x - startPt.x) * 100,
        height: Math.abs(curPt.y - startPt.y) * 100,
    } : null;

    // showLabel default = isActive: label hanya tampil saat item aktif, box tetap terlihat saat tidak aktif
    const renderBox = (box, color, label, isActive, keyPrefix, labelPos = 'top', showLabel = isActive) => {
        if (!box) return null;
        const x = box.x;
        const y = box.y;
        const w = box.w ?? (naturalSize ? box.width / naturalSize.width : 0);
        const h = box.h ?? (naturalSize ? box.height / naturalSize.height : 0);
        const finalX = box.w === undefined && naturalSize ? box.x / naturalSize.width : x;
        const finalY = box.h === undefined && naturalSize ? box.y / naturalSize.height : y;

        return (
            <div key={keyPrefix} className={`absolute transition-all ${canDraw ? 'pointer-events-none' : 'pointer-events-auto'}`}
                style={{
                    left:       `${finalX * 100}%`,
                    top:        `${finalY * 100}%`,
                    width:      `${w * 100}%`,
                    height:     `${h * 100}%`,
                    border:     `2px solid ${isActive ? color : color + '99'}`,
                    background: isActive ? color + '33' : color + '26',
                    zIndex:     isActive ? 10 : 1,
                }}>
                {showLabel && (
                    <span className={`absolute ${labelPos === 'top' ? '-top-5' : '-bottom-5'} left-0 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm pointer-events-none`}
                        style={{ backgroundColor: color }}>
                        {label}
                    </span>
                )}
            </div>
        );
    };

    // Palet warna per tipe box — section sub-items pakai warna sama dengan non-section counterpart-nya
    // Field anchor:          amber   (#f59e0b)
    // Field value:           biru    (#3b82f6)
    // Table anchor:          merah   (#e11d48)
    // Table area:            oranye  (#ea580c)
    // Table column:          hijau   (#16a34a)
    // Section anchor:        violet  (#8b5cf6)
    // Section field anchor:  indigo  (#6366f1)
    // Section field value:   biru tua(#1d4ed8)
    // Section table anchor:  merah   (#e11d48) — sama dengan table anchor
    // Section table area:    oranye  (#ea580c) — sama dengan table area
    // Section column:        hijau   (#16a34a) — sama dengan table column
    const boxes = [];
    (items || []).forEach((item, ii) => {
        const isActive = ii === activeIdx;
        // Tampilkan hanya box untuk halaman aktif. Item tanpa attr page (template lama) selalu ditampilkan.
        if (item.page && item.page !== currentPage) return;
        if (item.item_type === "field") {
            if (item.anchor_box) {
                boxes.push(renderBox(item.anchor_box, "#f59e0b", `A · ${item.field_name}`, isActive, `fa-${ii}`));
            }
            (item.targets || []).forEach((t, ti) => {
                if (t.box) {
                    boxes.push(renderBox(t.box, "#3b82f6", t.label, isActive, `ft-${ii}-${ti}`, 'bottom'));
                }
            });
        }
        if (item.item_type === "table") {
            if (item.anchor_box) {
                boxes.push(renderBox(item.anchor_box, "#e11d48", `ANC · ${item.table_name}`, isActive, `tab-a-${ii}`));
            }
            if (item.table_area) {
                boxes.push(renderBox(item.table_area, "#ea580c", `TABEL · ${item.table_name}`, isActive, `ta-${ii}`));
            }
            (item.columns || []).forEach((col, ci) => {
                if (col.box) {
                    boxes.push(renderBox(col.box, "#16a34a", col.label || col.key, isActive, `tc-${ii}-${ci}`));
                }
            });
        }
        if (item.item_type === "section") {
            if (item.anchor_box) {
                boxes.push(renderBox(item.anchor_box, "#8b5cf6", `SECTION · ${item.section_name || "Section"}`, isActive, `sec-a-${ii}`));
            }
            (item.fields || []).forEach((f, fi) => {
                if (f.anchor_box) boxes.push(renderBox(f.anchor_box, "#6366f1", `Anchor · ${f.field_name || `field_${fi + 1}`}`, isActive, `sf-a-${ii}-${fi}`));
                (f.targets || []).forEach((t, ti) => {
                    if (t.box) boxes.push(renderBox(t.box, "#1d4ed8", `${t.label || `val_${ti + 1}`} · ${f.field_name || `field_${fi + 1}`}`, isActive, `sf-t-${ii}-${fi}-${ti}`, 'bottom'));
                });
            });
            (item.tables || []).forEach((t, ti) => {
                if (t.anchor_box) boxes.push(renderBox(t.anchor_box, "#e11d48", `Anchor · ${t.table_name || `table_${ti + 1}`}`, isActive, `st-a-${ii}-${ti}`));
                if (t.table_area)  boxes.push(renderBox(t.table_area,  "#ea580c", `Area · ${t.table_name || `table_${ti + 1}`}`, isActive, `st-r-${ii}-${ti}`));
                (t.columns || []).forEach((col, ci) => {
                    if (col.box) boxes.push(renderBox(col.box, "#16a34a", col.label || col.key, isActive, `st-c-${ii}-${ti}-${ci}`));
                });
            });
        }
    });

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-auto min-h-[600px]">
            <div ref={containerRef} className="relative select-none mx-auto"
                style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, cursor: canDraw ? "crosshair" : "default" }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
                onMouseLeave={() => { setDrawing(false); setStartPt(null); setCurPt(null); }}>
                {imageUrl ? (
                    <>
                        <img ref={imgRef} src={imageUrl} alt="Dokumen" className="w-full h-auto block" onLoad={onImageLoad} draggable={false} />
                        {naturalSize && boxes}
                        {tempBox && (
                            <div className={`absolute border-2 pointer-events-none ${tempColor}`} 
                                 style={{ left: `${tempBox.left}%`, top: `${tempBox.top}%`, width: `${tempBox.width}%`, height: `${tempBox.height}%` }} />
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[500px] gap-3 text-slate-400 bg-white">
                        <UploadIcon />
                        <p className="text-sm">Upload PDF master untuk memulai</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR PANELS
// ══════════════════════════════════════════════════════════════
function FieldPanel({ item, idx, isActive, drawMode, activeTargetIdx, setActiveIdx, setDrawMode, setActiveTargetIdx, updateItem, removeItem, addTarget, removeTarget, updateTarget, ocrPredicting, targetPreview }) {
    const [editKeys, setEditKeys] = useState({});
    const toggleKeyEdit = (id) => {
        if (!editKeys[id] && !confirm("Warning: Mengubah Key teknis akan merusak integrasi database/n8n. Lanjutkan?")) return;
        setEditKeys(p => ({ ...p, [id]: !p[id] }));
    };

    return (
        <div className={`rounded-xl border transition cursor-pointer ${isActive ? "border-indigo-300 bg-white shadow-sm ring-1 ring-indigo-400/20" : "border-slate-100 hover:border-slate-200 bg-slate-50/50"}`}
            onClick={() => { setActiveIdx(idx); setDrawMode(DRAW.NONE); }}>
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><FieldIcon />FIELD</span>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">{item.field_name || "Field Baru"}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} className="text-slate-300 hover:text-red-500 p-1 rounded"><TrashIcon /></button>
            </div>
            {isActive && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Nama Field</label>
                            <input type="text" value={item.field_name} onChange={e => updateItem(idx, "field_name", e.target.value)} className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">JSON Key {editKeys[item.id] ? "🔓" : "🔒"}</label>
                                <button onClick={() => toggleKeyEdit(item.id)} className="text-[9px] text-indigo-500 underline">Edit</button>
                            </div>
                            <input type="text" value={item.field_key} readOnly={!editKeys[item.id]} onChange={e => updateItem(idx, "field_key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className={`w-full text-xs rounded-lg p-1.5 border ${editKeys[item.id] ? "border-indigo-300 ring-2 ring-indigo-50" : "border-slate-200 bg-slate-50 text-slate-400"}`} />
                        </div>
                    </div>

                    {/* Jenis Tulisan (Level Field) */}
                    <div className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/60">
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Jenis Tulisan</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">Pilih metode OCR untuk field ini</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => updateItem(idx, "text_type", "printed")}
                                className={`text-[9px] px-2.5 py-1 rounded-lg font-bold border transition ${
                                    (item.text_type || "printed") === "printed"
                                        ? "bg-indigo-600 text-white border-indigo-700 shadow-sm"
                                        : "bg-white text-slate-400 border-slate-200 hover:border-indigo-200"
                                }`}
                            >
                                🖨️ Cetak
                            </button>
                            <button
                                onClick={() => updateItem(idx, "text_type", "handwritten")}
                                className={`text-[9px] px-2.5 py-1 rounded-lg font-bold border transition ${
                                    item.text_type === "handwritten"
                                        ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                                        : "bg-white text-slate-400 border-slate-200 hover:border-amber-200"
                                }`}
                            >
                                ✍️ Tulis Tangan
                            </button>
                            <button
                                onClick={() => updateItem(idx, "text_type", "checkbox")}
                                className={`text-[9px] px-2.5 py-1 rounded-lg font-bold border transition ${
                                    item.text_type === "checkbox"
                                        ? "bg-green-600 text-white border-green-700 shadow-sm"
                                        : "bg-white text-slate-400 border-slate-200 hover:border-green-200"
                                }`}
                            >
                                ☑ Centang
                            </button>
                        </div>
                    </div>
                    {item.text_type === "handwritten" && (
                        <p className="text-[9px] text-amber-600 font-medium bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 flex items-center gap-1">
                            ⚠️ Field ini akan diproses menggunakan TrOCR (model tulisan tangan)
                        </p>
                    )}
                    {item.text_type === "checkbox" && (
                        <p className="text-[9px] text-green-700 font-medium bg-green-50 border border-green-100 rounded-lg px-2 py-1.5 flex items-center gap-1">
                            ☑ Field ini akan dideteksi sebagai centang (pixel-based, tanpa OCR)
                        </p>
                    )}

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                Anchor Text {isActive && ocrPredicting && <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>}
                            </label>
                            <button onClick={() => setDrawMode(drawMode === DRAW.ANCHOR ? DRAW.NONE : DRAW.ANCHOR)} className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.ANCHOR ? "bg-amber-500 text-white border-amber-600" : item.anchor_box ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                                {item.anchor_box ? "✓ Drawn" : "📍 Draw"}
                            </button>
                        </div>
                        <input type="text" value={item.field_anchor} onChange={e => updateItem(idx, "field_anchor", e.target.value)} placeholder="ex: Location" className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Target Boxes</span>
                            <button onClick={() => addTarget(idx)} className="bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded hover:bg-indigo-700">+ Add</button>
                        </div>
                        {(item.targets || []).map((t, ti) => (
                            <div key={ti} className="flex flex-col gap-1 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-1">
                                    <input type="text" value={t.label} onChange={e => updateTarget(idx, ti, "label", e.target.value)} className="flex-1 text-[10px] p-0 border-none bg-transparent focus:ring-0 font-medium" />
                                    <button onClick={() => toggleKeyEdit(t.id)} className="text-[9px] text-slate-400">{editKeys[t.id] ? "🔓" : "🔒"}</button>
                                    <button onClick={() => { setActiveTargetIdx(ti); setDrawMode(drawMode === DRAW.TARGET && activeTargetIdx === ti ? DRAW.NONE : DRAW.TARGET); }} className={`p-1 rounded transition ${drawMode === DRAW.TARGET && activeTargetIdx === ti ? "bg-indigo-600 text-white" : t.box ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-300 border"}`}><BoxIcon /></button>
                                    <button onClick={() => removeTarget(idx, ti)} className="text-slate-200 hover:text-red-400"><TrashIcon /></button>
                                </div>
                                {editKeys[t.id] && (
                                    <input type="text" value={t.key} onChange={e => updateTarget(idx, ti, "key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className="text-[9px] p-1 border-indigo-200 rounded bg-white text-indigo-600" placeholder="Technical Key" />
                                )}
                                {/* Jenis tulisan per-target */}
                                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                                    <span className="text-[9px] text-slate-400 font-medium">OCR:</span>
                                    <button
                                        onClick={() => updateTarget(idx, ti, "text_type", "printed")}
                                        className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${
                                            (t.text_type || item.text_type || "printed") === "printed"
                                                ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                                : "bg-white text-slate-300 border-slate-100"
                                        }`}
                                    >🖨️ Cetak</button>
                                    <button
                                        onClick={() => updateTarget(idx, ti, "text_type", "handwritten")}
                                        className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${
                                            (t.text_type || item.text_type) === "handwritten"
                                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                                : "bg-white text-slate-300 border-slate-100"
                                        }`}
                                    >✍️ Tulis</button>
                                    <button
                                        onClick={() => updateTarget(idx, ti, "text_type", "checkbox")}
                                        className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${
                                            (t.text_type || item.text_type) === "checkbox"
                                                ? "bg-green-100 text-green-700 border-green-200"
                                                : "bg-white text-slate-300 border-slate-100"
                                        }`}
                                    >☑ Centang</button>
                                    {(t.text_type || item.text_type) === "handwritten" && (
                                        <span className="text-[9px] text-amber-500 font-bold ml-auto">→ TrOCR</span>
                                    )}
                                    {(t.text_type || item.text_type) === "checkbox" && (
                                        <span className="text-[9px] text-green-600 font-bold ml-auto">→ Pixel</span>
                                    )}
                                </div>
                                {/* ── Preview OCR Target ── */}
                                {targetPreview &&
                                 targetPreview.itemIdx === idx &&
                                 targetPreview.targetIdx === ti && (
                                    <div className={`mt-1 text-[10px] px-2 py-1.5 rounded-lg border flex items-start gap-1.5 ${
                                        targetPreview.status === "loading"       ? "bg-slate-50 border-slate-200 text-slate-400"
                                        : targetPreview.status === "ok"          ? "bg-green-50 border-green-200 text-green-700"
                                        : targetPreview.status === "trocr_loading" ? "bg-blue-50 border-blue-200 text-blue-700"
                                        : targetPreview.status === "trocr_error"   ? "bg-red-50 border-red-200 text-red-700"
                                        : "bg-amber-50 border-amber-200 text-amber-700"
                                    }`}>
                                        <span className="mt-0.5 flex-shrink-0">
                                            {targetPreview.status === "loading"        && <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-ping" />}
                                            {targetPreview.status === "trocr_loading"  && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
                                            {targetPreview.status === "ok"             && "✅"}
                                            {targetPreview.status === "empty"          && "⚠️"}
                                            {targetPreview.status === "trocr_error"    && "❌"}
                                        </span>
                                        <span className="leading-tight">
                                            {targetPreview.status === "loading" && "Membaca area dengan TrOCR..."}
                                            {targetPreview.status === "trocr_loading" && (
                                                <>{targetPreview.message || "Model TrOCR sedang dimuat, harap tunggu lalu coba lagi."}</>
                                            )}
                                            {targetPreview.status === "trocr_error" && (
                                                <>{targetPreview.message || "TrOCR tidak dapat membaca area ini."}</>
                                            )}
                                            {targetPreview.status === "ok" && (
                                                <>
                                                    <span className="font-medium">Preview: </span>
                                                    <span className="font-mono">"{targetPreview.text}"</span>
                                                    {targetPreview.engine && (
                                                        <span className="text-[8px] text-slate-400 ml-1 font-normal">via {targetPreview.engine}</span>
                                                    )}
                                                </>
                                            )}
                                            {targetPreview.status === "empty" && "TrOCR tidak mendeteksi teks di area ini — coba geser atau perbesar kotak"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function TablePanel({ item, idx, isActive, drawMode, activeColumnIdx, setActiveIdx, setDrawMode, setActiveColumnIdx, updateItem, removeItem, addColumn, removeColumn, updateColumn, ocrPredicting, targetPreview }) {
    const hasArea = !!item.table_area;
    const [editKeys, setEditKeys] = useState({});
    const toggleKeyEdit = (id) => {
        if (!editKeys[id] && !confirm("Warning: Mengubah Key teknis akan merusak integrasi database/n8n. Lanjutkan?")) return;
        setEditKeys(p => ({ ...p, [id]: !p[id] }));
    };

    return (
        <div className={`rounded-xl border transition cursor-pointer ${isActive ? "border-rose-300 bg-white shadow-sm ring-1 ring-rose-400/20" : "border-slate-100 hover:border-rose-200 bg-rose-50/20"}`}
            onClick={() => { setActiveIdx(idx); setDrawMode(DRAW.NONE); }}>
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><TableIcon />TABEL</span>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">{item.table_name || "Tabel Baru"}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} className="text-slate-300 hover:text-red-500 p-1 rounded"><TrashIcon /></button>
            </div>
            {isActive && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Nama Tabel</label>
                            <input type="text" value={item.table_name} onChange={e => updateItem(idx, "table_name", e.target.value)} className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">JSON Key {editKeys[item.id] ? "🔓" : "🔒"}</label>
                                <button onClick={() => toggleKeyEdit(item.id)} className="text-[9px] text-indigo-500 underline">Edit</button>
                            </div>
                            <input type="text" value={item.json_key} readOnly={!editKeys[item.id]} onChange={e => updateItem(idx, "json_key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className={`w-full text-xs rounded-lg p-1.5 border font-mono ${editKeys[item.id] ? "border-indigo-300 ring-2 ring-indigo-50" : "border-slate-200 bg-slate-50 text-slate-400"}`} />
                        </div>
                    </div>

                    {/* Stage 0: Anchor */}
                    <div className="p-2 bg-rose-50/50 rounded-lg border border-rose-100">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-rose-700 font-bold tracking-tight flex items-center gap-1">
                                1. ANCHOR POIN (0,0) {isActive && ocrPredicting && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>}
                            </label>
                            <button onClick={() => setDrawMode(drawMode === DRAW.TABLE_ANCHOR ? DRAW.NONE : DRAW.TABLE_ANCHOR)} className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_ANCHOR ? "bg-rose-500 text-white border-rose-600 shadow-sm" : item.anchor_box ? "bg-white border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                {item.anchor_box ? "✓ Re-Draw" : "📍 Draw Box"}
                            </button>
                        </div>
                        <input type="text" value={item.table_anchor} onChange={e => updateItem(idx, "table_anchor", e.target.value)} placeholder="ex: Descriptions, No." className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        <div className="mt-1 flex gap-2">
                            <select value={item.table_anchor_match_type || "contains"} onChange={e => updateItem(idx, "table_anchor_match_type", e.target.value)} className="text-[9px] border-none bg-slate-100 rounded px-1 py-0.5">
                                <option value="contains">Contains</option>
                                <option value="exact">Exact</option>
                            </select>
                            <span className="text-[9px] text-slate-400 italic">Rule finding.</span>
                        </div>
                    </div>

                    {/* Stage 1: Area */}
                    <div className="p-2 bg-orange-50/50 rounded-lg border border-orange-100">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-orange-700 font-bold tracking-tight">2. JANGKAUAN ISI TABEL</label>
                            <button onClick={() => setDrawMode(drawMode === DRAW.TABLE_AREA ? DRAW.NONE : DRAW.TABLE_AREA)} className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_AREA ? "bg-orange-500 text-white border-orange-600 shadow-sm" : item.table_area ? "bg-white border-orange-200 text-orange-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                {item.table_area ? "✓ Re-Draw" : "🔲 Draw Area"}
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-400">Gambar area vertikal seluruh baris.</p>
                        {item.table_area && item.anchor_box && (
                            <p className="text-[9px] text-emerald-600 font-mono mt-0.5 px-1 bg-emerald-50 rounded inline-block">offset_y: {Math.round(item.table_area.y - item.anchor_box.y)}px</p>
                        )}
                    </div>

                    {/* Stage 2: Columns */}
                    {hasArea && (
                        <div className="p-2 bg-green-50/30 rounded-lg border border-green-100">
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[10px] text-green-700 font-bold tracking-tight">3. STRUKTUR KOLOM (X)</label>
                                <button onClick={() => addColumn(idx)} className="bg-green-600 text-white text-[9px] px-2 py-0.5 rounded shadow-sm">+ Kolom</button>
                            </div>
                            <div className="space-y-1.5">
                                {(item.columns || []).map((col, ci) => (
                                    <div key={ci} className={`p-2 rounded border transition ${activeColumnIdx === ci && isActive ? "bg-white border-green-400 shadow-sm" : "bg-white/60 border-slate-100"}`} onClick={(e) => { e.stopPropagation(); setActiveColumnIdx(ci); }}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${col.box ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"}`}>{ci+1}</span>
                                            <input type="text" value={col.label} onChange={e => updateColumn(idx, ci, "label", e.target.value)} className="flex-1 text-[10px] font-bold p-0 border-none bg-transparent focus:ring-0" />
                                            <button onClick={() => toggleKeyEdit(col.id)} className="text-[9px] text-slate-400">{editKeys[col.id] ? "🔓" : "🔒"}</button>
                                            <button onClick={(e) => { e.stopPropagation(); setActiveColumnIdx(ci); setDrawMode(DRAW.COLUMN); }} className={`p-1 rounded ${drawMode === DRAW.COLUMN && activeColumnIdx === ci ? "bg-green-600 text-white" : col.box ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}><BoxIcon /></button>
                                            <button onClick={(e) => { e.stopPropagation(); removeColumn(idx, ci); }} className="text-slate-200 hover:text-red-400"><TrashIcon /></button>
                                        </div>
                                        {editKeys[col.id] && (
                                            <input type="text" value={col.key} onChange={e => updateColumn(idx, ci, "key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className="text-[9px] w-full p-1 border-indigo-200 rounded bg-indigo-50/30 text-indigo-700 mb-1.5" placeholder="Technical Key" />
                                        )}
                                        <div className="flex gap-3 px-1 border-t border-slate-50 pt-1.5">
                                            <label className="flex items-center gap-1 text-[9px] text-slate-600 cursor-pointer">
                                                <input type="checkbox" checked={!!col.is_row_anchor} onChange={e => updateColumn(idx, ci, "is_row_anchor", e.target.checked)} className="w-3 h-3 rounded text-indigo-600" /> Anchor
                                            </label>
                                            <label className="flex items-center gap-1 text-[9px] text-slate-600 cursor-pointer">
                                                <input type="checkbox" checked={!!col.is_multi_line} onChange={e => updateColumn(idx, ci, "is_multi_line", e.target.checked)} className="w-3 h-3 rounded text-indigo-600" /> Multi
                                            </label>
                                            <select value={col.text_type || "printed"} onChange={e => updateColumn(idx, ci, "text_type", e.target.value)} className="text-[9px] border-none bg-slate-50 rounded ml-auto p-0">
                                                <option value="printed">Teks</option>
                                                <option value="handwritten">Tulis</option>
                                                <option value="checkbox">Centang</option>
                                            </select>
                                        </div>
                                        {col.text_type === "checkbox" && (
                                            <div className="flex items-center gap-2 mt-1.5 px-1">
                                                <span className="text-[9px] text-green-600 font-medium">Nilai jika tercentang:</span>
                                                <input
                                                    type="text"
                                                    value={col.checkbox_checked_value || "OK"}
                                                    onChange={e => updateColumn(idx, ci, "checkbox_checked_value", e.target.value)}
                                                    className="text-[9px] w-14 px-1.5 py-0.5 border border-green-200 rounded bg-green-50 text-green-700 font-bold"
                                                    placeholder="OK"
                                                />
                                            </div>
                                        )}
                                        {/* ── Preview OCR Kolom ── */}
                                        {targetPreview &&
                                         targetPreview.itemIdx === idx &&
                                         targetPreview.targetIdx === ci && (
                                            <div className={`mt-1.5 text-[10px] px-2 py-1.5 rounded-lg border flex items-start gap-1.5 ${
                                                targetPreview.status === "loading"      ? "bg-slate-50 border-slate-200 text-slate-400"
                                                : targetPreview.status === "ok"         ? "bg-green-50 border-green-200 text-green-700"
                                                : targetPreview.status === "trocr_loading" ? "bg-blue-50 border-blue-200 text-blue-700"
                                                : targetPreview.status === "trocr_error"   ? "bg-red-50 border-red-200 text-red-700"
                                                : "bg-amber-50 border-amber-200 text-amber-700"
                                            }`}>
                                                <span className="mt-0.5 flex-shrink-0">
                                                    {targetPreview.status === "loading"       && <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-ping" />}
                                                    {targetPreview.status === "trocr_loading" && <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                                                    {targetPreview.status === "trocr_error"   && "❌"}
                                                    {targetPreview.status === "ok"            && "✅"}
                                                    {targetPreview.status === "empty"         && "⚠️"}
                                                </span>
                                                <span className="leading-tight">
                                                    {targetPreview.status === "loading" && "Membaca area..."}
                                                    {targetPreview.status === "ok" && (
                                                        <>
                                                            <span className="font-medium">Preview: </span>
                                                            <span className="font-mono">"{targetPreview.text}"</span>
                                                            {targetPreview.engine && (
                                                                <span className="text-[8px] text-slate-400 ml-1 font-normal">via {targetPreview.engine}</span>
                                                            )}
                                                        </>
                                                    )}
                                                    {targetPreview.status === "trocr_loading" && (targetPreview.message || "Model TrOCR sedang dimuat, harap tunggu...")}
                                                    {targetPreview.status === "trocr_error"   && (targetPreview.message || "TrOCR gagal — periksa log Python Engine.")}
                                                    {targetPreview.status === "empty"         && "TrOCR tidak mendeteksi teks di area ini — coba geser atau perbesar kotak"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stage 3: Fallback Policy */}
                    {item.columns && item.columns.length > 0 && (
                        <div className="p-2 bg-indigo-50/30 rounded-lg border border-indigo-100">
                            <label className="text-[10px] text-indigo-700 font-bold tracking-tight mb-1 block">4. FALLBACK ROW ANCHOR</label>
                            <select value={item.fallback_row_anchor_id || ""} onChange={e => updateItem(idx, "fallback_row_anchor_id", e.target.value)} className="w-full text-[10px] border-slate-200 rounded-lg p-1">
                                <option value="">No Fallback (Risky)</option>
                                {item.columns.map((c, ci) => (
                                    <option key={ci} value={c.id}>{c.label} ({c.key})</option>
                                ))}
                            </select>
                            {(() => {
                                const selected = item.columns.find(c => c.id === item.fallback_row_anchor_id);
                                if (selected?.text_type === "handwritten") {
                                    return <p className="text-[9px] text-amber-600 font-bold mt-1 animate-pulse">⚠️ Peringatan: Kolom tulis tangan berisiko tinggi noise.</p>;
                                }
                                return null;
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SECTION PANEL — repeating section (Battery Bank, dll)
// ══════════════════════════════════════════════════════════════
function SectionPanel({
    item, idx, isActive,
    drawMode, setDrawMode, setActiveIdx,
    updateItem, removeItem,
    addFieldToSection, addTableToSection,
    activeSectionFieldIdx, setActiveSectionFieldIdx,
    activeSectionFieldTargetIdx, setActiveSectionFieldTargetIdx,
    activeSectionTableIdx, setActiveSectionTableIdx,
    activeSectionColumnIdx, setActiveSectionColumnIdx,
    ocrPredicting,
}) {
    const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

    const updateField = (fi, k, v) => {
        const fields = [...(item.fields || [])];
        fields[fi] = { ...fields[fi], [k]: v };
        if (k === "field_name" && !fields[fi].manual_key) fields[fi].field_key = slugify(v);
        if (k === "field_key") fields[fi].manual_key = true;
        updateItem(idx, "fields", fields);
    };
    const removeField = (fi) => {
        const fields = (item.fields || []).filter((_, i) => i !== fi);
        updateItem(idx, "fields", fields);
        if (activeSectionFieldIdx === fi) setActiveSectionFieldIdx(null);
    };
    const addFieldTarget = (fi) => {
        const fields = [...(item.fields || [])];
        const t = [...(fields[fi].targets || [])];
        const kn = `val_${t.length + 1}`;
        t.push({ id: `sv-${Date.now()}`, label: kn, key: kn, text_type: "printed", box: null, manual_key: false });
        fields[fi] = { ...fields[fi], targets: t };
        updateItem(idx, "fields", fields);
    };
    const removeFieldTarget = (fi, ti) => {
        const fields = [...(item.fields || [])];
        const t = (fields[fi].targets || []).filter((_, i) => i !== ti);
        fields[fi] = { ...fields[fi], targets: t };
        updateItem(idx, "fields", fields);
    };
    const updateFieldTarget = (fi, ti, k, v) => {
        const fields = [...(item.fields || [])];
        const t = [...(fields[fi].targets || [])];
        t[ti] = { ...t[ti], [k]: v };
        if (k === "label" && !t[ti].manual_key) t[ti].key = slugify(v);
        if (k === "key") t[ti].manual_key = true;
        fields[fi] = { ...fields[fi], targets: t };
        updateItem(idx, "fields", fields);
    };

    const updateTable = (ti, k, v) => {
        const tables = [...(item.tables || [])];
        tables[ti] = { ...tables[ti], [k]: v };
        updateItem(idx, "tables", tables);
    };
    const removeTable = (ti) => {
        const tables = (item.tables || []).filter((_, i) => i !== ti);
        updateItem(idx, "tables", tables);
        if (activeSectionTableIdx === ti) setActiveSectionTableIdx(null);
    };
    const addTableColumn = (ti) => {
        const tables = [...(item.tables || [])];
        const cols = [...(tables[ti].columns || [])];
        const ln = `Kolom ${cols.length + 1}`;
        cols.push({ id: `sc-${Date.now()}`, label: ln, key: slugify(ln), text_type: "printed", box: null, manual_key: false });
        tables[ti] = { ...tables[ti], columns: cols };
        updateItem(idx, "tables", tables);
        setActiveSectionColumnIdx(cols.length - 1);
    };
    const removeTableColumn = (ti, ci) => {
        const tables = [...(item.tables || [])];
        const cols = (tables[ti].columns || []).filter((_, i) => i !== ci);
        tables[ti] = { ...tables[ti], columns: cols };
        updateItem(idx, "tables", tables);
    };
    const updateTableColumn = (ti, ci, k, v) => {
        const tables = [...(item.tables || [])];
        const cols = [...(tables[ti].columns || [])];
        cols[ci] = { ...cols[ci], [k]: v };
        if (k === "label" && !cols[ci].manual_key) cols[ci].key = slugify(v);
        if (k === "key") cols[ci].manual_key = true;
        tables[ti] = { ...tables[ti], columns: cols };
        updateItem(idx, "tables", tables);
    };

    return (
        <div className={`rounded-xl border transition cursor-pointer ${isActive ? "border-violet-300 bg-white shadow-sm ring-1 ring-violet-400/20" : "border-slate-100 hover:border-violet-200 bg-violet-50/20"}`}
            onClick={() => { setActiveIdx(idx); setDrawMode(DRAW.NONE); }}>

            {/* ── Header — identik dengan TablePanel ── */}
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><RepeatIcon />SECTION</span>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">{item.section_name || "Section Baru"}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} className="text-slate-300 hover:text-red-500 p-1 rounded"><TrashIcon /></button>
            </div>

            {isActive && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>

                    {/* ── Nama Section + JSON Key — identik dengan TablePanel ── */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Nama Section</label>
                            <input type="text" value={item.section_name || ""} onChange={e => {
                                updateItem(idx, "section_name", e.target.value);
                                if (!item.manual_key) updateItem(idx, "json_key", slugify(e.target.value));
                            }} className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">JSON Key</label>
                            </div>
                            <input type="text" value={item.json_key || ""} onChange={e => {
                                updateItem(idx, "json_key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                                updateItem(idx, "manual_key", true);
                            }} className="w-full text-xs rounded-lg p-1.5 border border-slate-200 font-mono text-slate-400 bg-slate-50" />
                        </div>
                    </div>

                    {/* ── Stage 1: Hint Anchor — style identik dengan "1. ANCHOR POIN" TablePanel ── */}
                    <div className="p-2 bg-violet-50/50 rounded-lg border border-violet-100">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-violet-700 font-bold tracking-tight flex items-center gap-1">
                                1. HINT ANCHOR {isActive && ocrPredicting && <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-ping"></span>}
                            </label>
                            <button onClick={() => setDrawMode(drawMode === DRAW.SECTION_ANCHOR ? DRAW.NONE : DRAW.SECTION_ANCHOR)}
                                className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.SECTION_ANCHOR ? "bg-violet-500 text-white border-violet-600 shadow-sm" : item.anchor_box ? "bg-white border-violet-200 text-violet-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                {item.anchor_box ? "✓ Re-Draw" : "📍 Draw Box"}
                            </button>
                        </div>
                        <input type="text" value={item.anchor_text || ""} onChange={e => updateItem(idx, "anchor_text", e.target.value)} placeholder="ex: Bank" className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        <p className="text-[9px] text-slate-400 mt-0.5">Gambar kotak di sekitar kata anchor section.</p>
                        <div className="mt-1 flex items-center gap-3">
                            {item.hint_position && (
                                <span className="text-[9px] text-violet-600 font-mono bg-violet-50 px-1.5 py-0.5 rounded">
                                    hint: ({(item.hint_position.x * 100).toFixed(1)}%, {(item.hint_position.y * 100).toFixed(1)}%)
                                </span>
                            )}
                            <span className="text-[9px] text-slate-400 italic flex items-center gap-1">
                                tol:
                                <input type="number" step="0.01" min="0.05" max="0.5"
                                    value={item.hint_tolerance ?? 0.15}
                                    onChange={e => updateItem(idx, "hint_tolerance", parseFloat(e.target.value) || 0.15)}
                                    className="w-14 text-[9px] border border-slate-200 rounded px-1 py-0.5 font-mono bg-white" />
                            </span>
                        </div>
                    </div>

                    {/* ── Stage 2: Fields — style identik dengan "3. STRUKTUR KOLOM" TablePanel, warna indigo ── */}
                    <div className="p-2 bg-indigo-50/30 rounded-lg border border-indigo-100">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-indigo-700 font-bold tracking-tight">2. FIELDS</label>
                            <button onClick={() => addFieldToSection(idx)} className="bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded shadow-sm">+ Field</button>
                        </div>
                        <p className="text-[9px] text-slate-400 mb-1.5">Field-field yang ada di dalam section ini.</p>
                        <div className="space-y-1.5">
                            {(item.fields || []).map((f, fi) => (
                                <div key={fi}
                                    className={`p-2 rounded border transition ${activeSectionFieldIdx === fi && isActive ? "bg-white border-indigo-400 shadow-sm" : "bg-white/60 border-slate-100"}`}
                                    onClick={e => { e.stopPropagation(); setActiveSectionFieldIdx(fi); setActiveSectionTableIdx(null); }}>
                                    {/* Baris utama — identik dengan baris kolom TablePanel */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${f.anchor_box ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-500"}`}>{fi + 1}</span>
                                        <input type="text" value={f.field_name || ""} onChange={e => updateField(fi, "field_name", e.target.value)} className="flex-1 text-[10px] font-bold p-0 border-none bg-transparent focus:ring-0" placeholder="nama field" />
                                        {/* Draw Anchor — style identik TablePanel "📍 Draw Box" */}
                                        <button onClick={e => { e.stopPropagation(); setActiveSectionFieldIdx(fi); setActiveSectionTableIdx(null); setDrawMode(drawMode === DRAW.ANCHOR && activeSectionFieldIdx === fi ? DRAW.NONE : DRAW.ANCHOR); }}
                                            className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.ANCHOR && activeSectionFieldIdx === fi ? "bg-amber-500 text-white border-amber-600 shadow-sm" : f.anchor_box ? "bg-white border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                            {f.anchor_box ? "✓ Re-Draw" : "📍 Draw"}
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); removeField(fi); }} className="text-slate-200 hover:text-red-400 flex-shrink-0"><TrashIcon /></button>
                                    </div>
                                    {/* Expanded detail — identik dengan baris bawah kolom TablePanel */}
                                    {activeSectionFieldIdx === fi && (
                                        <div className="border-t border-slate-50 pt-1.5 space-y-1.5" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[9px] text-slate-400 uppercase font-bold">Anchor Text</label>
                                                    <input type="text" value={f.field_anchor || ""} onChange={e => updateField(fi, "field_anchor", e.target.value)} placeholder="ex: Battery Type" className="w-full text-[10px] rounded p-1 border border-slate-200" />
                                                </div>
                                            </div>
                                            {/* Targets — compact list */}
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Target Boxes</span>
                                                    <button onClick={() => addFieldTarget(fi)} className="bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm">+</button>
                                                </div>
                                                {(f.targets || []).map((t, ti) => (
                                                    <div key={ti} className="flex items-center gap-1.5 mb-1 bg-white p-1.5 rounded border border-slate-100">
                                                        <span className={`w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center font-bold flex-shrink-0 ${t.box ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-500"}`}>{ti + 1}</span>
                                                        <input type="text" value={t.label} onChange={e => updateFieldTarget(fi, ti, "label", e.target.value)} className="flex-1 text-[10px] font-bold p-0 border-none bg-transparent focus:ring-0" />
                                                        <select value={t.text_type || "printed"} onChange={e => updateFieldTarget(fi, ti, "text_type", e.target.value)} className="text-[9px] border-none bg-slate-50 rounded p-0">
                                                            <option value="printed">Teks</option>
                                                            <option value="handwritten">Tulis</option>
                                                            <option value="checkbox">Centang</option>
                                                        </select>
                                                        <button onClick={() => { setActiveSectionFieldTargetIdx(ti); setDrawMode(drawMode === DRAW.TARGET && activeSectionFieldTargetIdx === ti && activeSectionFieldIdx === fi ? DRAW.NONE : DRAW.TARGET); }}
                                                            className={`p-1 rounded ${drawMode === DRAW.TARGET && activeSectionFieldTargetIdx === ti && activeSectionFieldIdx === fi ? "bg-indigo-600 text-white" : t.box ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-300 border border-slate-200"}`}><BoxIcon /></button>
                                                        <button onClick={() => removeFieldTarget(fi, ti)} className="text-slate-200 hover:text-red-400"><TrashIcon /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Stage 3: Tables dalam section ── */}
                    <div className="p-2 bg-rose-50/20 rounded-lg border border-rose-100">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-rose-700 font-bold tracking-tight">3. TABLES</label>
                            <button onClick={() => addTableToSection(idx)} className="bg-rose-600 text-white text-[9px] px-2 py-0.5 rounded shadow-sm">+ Table</button>
                        </div>
                        <p className="text-[9px] text-slate-400 mb-1.5">Tabel yang ada di dalam section ini.</p>
                        <div className="space-y-1.5">
                            {(item.tables || []).map((t, ti) => (
                                <div key={ti}
                                    className={`p-2 rounded border transition ${activeSectionTableIdx === ti && isActive ? "bg-white border-rose-400 shadow-sm" : "bg-white/60 border-slate-100"}`}
                                    onClick={e => { e.stopPropagation(); setActiveSectionTableIdx(ti); setActiveSectionFieldIdx(null); }}>
                                    {/* Baris utama — identik TablePanel */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${t.anchor_box ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-500"}`}>{ti + 1}</span>
                                        <input type="text" value={t.table_name || ""} onChange={e => updateTable(ti, "table_name", e.target.value)} className="flex-1 text-[10px] font-bold p-0 border-none bg-transparent focus:ring-0" placeholder="nama tabel" />
                                        {/* Draw Anchor */}
                                        <button onClick={e => { e.stopPropagation(); setActiveSectionTableIdx(ti); setActiveSectionFieldIdx(null); setDrawMode(drawMode === DRAW.TABLE_ANCHOR && activeSectionTableIdx === ti ? DRAW.NONE : DRAW.TABLE_ANCHOR); }}
                                            className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_ANCHOR && activeSectionTableIdx === ti ? "bg-rose-500 text-white border-rose-600 shadow-sm" : t.anchor_box ? "bg-white border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                            {t.anchor_box ? "✓ Re-Draw" : "📍 Draw Box"}
                                        </button>
                                        {/* Draw Area */}
                                        <button onClick={e => { e.stopPropagation(); setActiveSectionTableIdx(ti); setActiveSectionFieldIdx(null); setDrawMode(drawMode === DRAW.TABLE_AREA && activeSectionTableIdx === ti ? DRAW.NONE : DRAW.TABLE_AREA); }}
                                            className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_AREA && activeSectionTableIdx === ti ? "bg-orange-500 text-white border-orange-600 shadow-sm" : t.table_area ? "bg-white border-orange-200 text-orange-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                            {t.table_area ? "✓ Re-Draw" : "🔲 Draw Area"}
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); removeTable(ti); }} className="text-slate-200 hover:text-red-400 flex-shrink-0"><TrashIcon /></button>
                                    </div>
                                    {/* Expanded detail */}
                                    {activeSectionTableIdx === ti && (
                                        <div className="space-y-2 mt-1" onClick={e => e.stopPropagation()}>
                                            {/* Sub-stage: Anchor */}
                                            <div className="p-2 bg-rose-50/50 rounded-lg border border-rose-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] text-rose-700 font-bold tracking-tight">ANCHOR POIN (0,0)</label>
                                                    <button onClick={e => { e.stopPropagation(); setDrawMode(drawMode === DRAW.TABLE_ANCHOR && activeSectionTableIdx === ti ? DRAW.NONE : DRAW.TABLE_ANCHOR); }}
                                                        className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_ANCHOR && activeSectionTableIdx === ti ? "bg-rose-500 text-white border-rose-600 shadow-sm" : t.anchor_box ? "bg-white border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                                        {t.anchor_box ? "✓ Re-Draw" : "📍 Draw Box"}
                                                    </button>
                                                </div>
                                                <input type="text" value={t.table_anchor || ""} onChange={e => updateTable(ti, "table_anchor", e.target.value)} placeholder="ex: No" className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                                                <p className="text-[9px] text-slate-400 mt-0.5">Titik referensi (0,0) untuk kolom tabel.</p>
                                            </div>
                                            {/* Sub-stage: Area */}
                                            <div className="p-2 bg-orange-50/50 rounded-lg border border-orange-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] text-orange-700 font-bold tracking-tight">JANGKAUAN ISI TABEL</label>
                                                    <button onClick={e => { e.stopPropagation(); setDrawMode(drawMode === DRAW.TABLE_AREA && activeSectionTableIdx === ti ? DRAW.NONE : DRAW.TABLE_AREA); }}
                                                        className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_AREA && activeSectionTableIdx === ti ? "bg-orange-500 text-white border-orange-600 shadow-sm" : t.table_area ? "bg-white border-orange-200 text-orange-700" : "bg-white border-slate-200 text-slate-400"}`}>
                                                        {t.table_area ? "✓ Re-Draw" : "🔲 Draw Area"}
                                                    </button>
                                                </div>
                                                <p className="text-[9px] text-slate-400">Gambar area vertikal seluruh baris.</p>
                                                {t.table_area && t.anchor_box && (
                                                    <p className="text-[9px] text-emerald-600 font-mono mt-0.5 px-1 bg-emerald-50 rounded inline-block">offset_y: {Math.round((t.table_area.y - t.anchor_box.y) * 3508)}px</p>
                                                )}
                                            </div>
                                            {/* Columns — identik persis dengan TablePanel */}
                                            <div className="p-2 bg-green-50/30 rounded-lg border border-green-100">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[10px] text-green-700 font-bold tracking-tight uppercase">Struktur Kolom</span>
                                                    <button onClick={() => addTableColumn(ti)} className="bg-green-600 text-white text-[9px] px-2 py-0.5 rounded shadow-sm">+ Kolom</button>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {(t.columns || []).map((col, ci) => (
                                                        <div key={ci}
                                                            className={`p-2 rounded border transition ${activeSectionColumnIdx === ci && activeSectionTableIdx === ti ? "bg-white border-green-400 shadow-sm" : "bg-white/60 border-slate-100"}`}
                                                            onClick={e => { e.stopPropagation(); setActiveSectionColumnIdx(ci); }}>
                                                            {/* Baris 1: circle + label + BoxIcon + TrashIcon — identik TablePanel */}
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${col.box ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"}`}>{ci + 1}</span>
                                                                <input type="text" value={col.label} onChange={e => updateTableColumn(ti, ci, "label", e.target.value)} className="flex-1 text-[10px] font-bold p-0 border-none bg-transparent focus:ring-0" />
                                                                <button onClick={e => { e.stopPropagation(); setActiveSectionColumnIdx(ci); setDrawMode(drawMode === DRAW.COLUMN && activeSectionColumnIdx === ci && activeSectionTableIdx === ti ? DRAW.NONE : DRAW.COLUMN); }}
                                                                    className={`p-1 rounded ${drawMode === DRAW.COLUMN && activeSectionColumnIdx === ci && activeSectionTableIdx === ti ? "bg-green-600 text-white" : col.box ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}><BoxIcon /></button>
                                                                <button onClick={e => { e.stopPropagation(); removeTableColumn(ti, ci); }} className="text-slate-200 hover:text-red-400"><TrashIcon /></button>
                                                            </div>
                                                            {/* Baris 2: Anchor + Multi checkboxes + type select — identik TablePanel */}
                                                            <div className="flex gap-3 px-1 border-t border-slate-50 pt-1.5">
                                                                <label className="flex items-center gap-1 text-[9px] text-slate-600 cursor-pointer">
                                                                    <input type="checkbox" checked={!!col.is_row_anchor} onChange={e => updateTableColumn(ti, ci, "is_row_anchor", e.target.checked)} className="w-3 h-3 rounded text-indigo-600" /> Anchor
                                                                </label>
                                                                <label className="flex items-center gap-1 text-[9px] text-slate-600 cursor-pointer">
                                                                    <input type="checkbox" checked={!!col.is_multi_line} onChange={e => updateTableColumn(ti, ci, "is_multi_line", e.target.checked)} className="w-3 h-3 rounded text-indigo-600" /> Multi
                                                                </label>
                                                                <select value={col.text_type || "printed"} onChange={e => updateTableColumn(ti, ci, "text_type", e.target.value)} className="text-[9px] border-none bg-slate-50 rounded ml-auto p-0">
                                                                    <option value="printed">Teks</option>
                                                                    <option value="handwritten">Tulis</option>
                                                                    <option value="checkbox">Centang</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// UNSAVED CHANGES MODAL
// ══════════════════════════════════════════════════════════════
function UnsavedChangesModal({ onStay, onLeave }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
                <h2 className="text-base font-bold text-slate-800 mb-2">Belum Disimpan</h2>
                <p className="text-sm text-slate-500 mb-6">
                    Konfigurasi template belum disimpan. Yakin ingin keluar?
                </p>
                <div className="flex gap-3 justify-end">
                    <button onClick={onStay} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition">
                        Tetap di Halaman
                    </button>
                    <button onClick={onLeave} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition">
                        Keluar Tanpa Simpan
                    </button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN EDITOR
// ══════════════════════════════════════════════════════════════
export default function MasterTemplateEditor({ editingTemplate = null }) {
    const isEdit = !!editingTemplate;

    const [imageUrl, setImageUrl] = useState(
        editingTemplate?.page_images?.[0] || editingTemplate?.master_file_url || null
    );
    const [pdfPath, setPdfPath] = useState(editingTemplate?.master_file_path ?? null);
    const [imagePath, setImagePath] = useState(editingTemplate?.image_path ?? null);
    const [converting, setConverting] = useState(false);
    const [totalPages, setTotalPages] = useState(
        editingTemplate?.total_pages || editingTemplate?.mapping_config?.total_pages || 1
    );
    const [currentPage, setCurrentPage] = useState(1);
    const [pageImages, setPageImages] = useState(
        editingTemplate?.page_images || (editingTemplate?.master_file_url ? [editingTemplate.master_file_url] : [])
    );
    const [pagePythonPaths, setPagePythonPaths] = useState(
        editingTemplate?.python_image_paths || (editingTemplate?.python_image_path ? [editingTemplate.python_image_path] : [])
    );
    const [typeName, setTypeName] = useState(editingTemplate?.type_name ?? "");
    const [identifierText, setIdentifierText] = useState(editingTemplate?.identifier_text ?? "");
    const [docVersion, setDocVersion] = useState(editingTemplate?.doc_version ?? "");
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [naturalSize, setNaturalSize] = useState(null);
    const [pythonImagePath, setPythonImagePath] = useState(
        editingTemplate?.python_image_paths?.[0] || editingTemplate?.python_image_path || null
    );
    const [ocrPredicting, setOcrPredicting] = useState(false);
    const [detectingHeader, setDetectingHeader] = useState(false);
    // State untuk menyimpan hasil preview OCR target/kolom
    // Format: { itemIdx, targetIdx, text, status: "loading"|"ok"|"empty" }
    const [targetPreview, setTargetPreview] = useState(null);
    const [items, setItems] = useState(() => {
        if (editingTemplate?.ui_metadata && Array.isArray(editingTemplate.ui_metadata)) {
            // Lock all existing keys
            return deepClone(editingTemplate.ui_metadata).map(item => ({
                ...item,
                manual_key: true,
                targets: (item.targets || []).map(t => ({ ...t, manual_key: true })),
                columns: (item.columns || []).map(c => {
                const derived = (c.label ?? "").toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
                console.log(`[DEBUG] label="${c.label}" key="${c.key}" derived="${derived}" manual_key=${c.key !== derived}`);
                return { ...c, manual_key: c.key !== derived };
            })
            }));
        }
        return [];
    });
    const [drawMode, setDrawMode] = useState(DRAW.NONE);
    const [activeIdx, setActiveIdx] = useState(null);
    const [activeTargetIdx, setActiveTargetIdx] = useState(null);
    const [activeColumnIdx, setActiveColumnIdx] = useState(null);
    // State untuk tracking sub-item aktif di dalam section
    const [activeSectionFieldIdx, setActiveSectionFieldIdx] = useState(null);
    const [activeSectionFieldTargetIdx, setActiveSectionFieldTargetIdx] = useState(null);
    const [activeSectionTableIdx, setActiveSectionTableIdx] = useState(null);
    const [activeSectionColumnIdx, setActiveSectionColumnIdx] = useState(null);
    const fileInputRef = useRef(null);

    // ── Unsaved-changes tracking ──────────────────────────────────
    const [isDirty, setIsDirty] = useState(false);
    const _initialMount = useRef(true);
    const isDirtyRef = useRef(false);
    const allowNavRef = useRef(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [pendingUrl, setPendingUrl] = useState(null);

    useEffect(() => {
        if (_initialMount.current) { _initialMount.current = false; return; }
        isDirtyRef.current = true;
        setIsDirty(true);
    }, [items, typeName, identifierText, docVersion]);

    useEffect(() => {
        const handler = (e) => {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isDirty]);

    useEffect(() => {
        const unsub = router.on("before", (event) => {
            if (!isDirtyRef.current || allowNavRef.current) return;
            const url = event.detail?.visit?.url?.toString() ?? null;
            setPendingUrl(url);
            setShowLeaveModal(true);
            return false;
        });
        return unsub;
    }, []);

    // Reset preview OCR saat admin pindah ke item lain
    useEffect(() => {
        setTargetPreview(null);
    }, [activeIdx]);

    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== "application/pdf") return;
        setConverting(true);
        const formData = new FormData();
        formData.append("pdf", file);
        try {
            const { data } = await axios.post("/internal-api/template/convert-pdf", formData);
            if (data.image_url) {
                const pages       = data.page_images || [data.image_url];
                const pythonPaths = data.python_image_paths || [data.python_image_path || null];
                setTotalPages(data.total_pages || 1);
                setPageImages(pages);
                setPagePythonPaths(pythonPaths);
                setCurrentPage(1);
                setImageUrl(pages[0]);
                setPdfPath(data.pdf_path);
                setImagePath(data.image_path || null);
                setPythonImagePath(pythonPaths[0] || null);

                // OTOMATIS DETEKSI HEADER SETELAH UPLOAD
                handleAutoDetectHeader(data.pdf_path);
            }
        } catch (err) { alert("Fail: " + err.message); } finally { setConverting(false); }
    };

    const [confScore, setConfScore] = useState(null);

    const handleAutoDetectHeader = async (forcedPath = null) => {
        const targetPath = forcedPath || pdfPath;
        if (!targetPath) return alert("Upload PDF dulu Bang!");
        
        setDetectingHeader(true);
        setConfScore(null); // Reset score
        try {
            const { data } = await axios.post("/internal-api/template/detect-header", {
                file_path: targetPath
            });
            
            if (data.header) {
                if (data.header.title) setTypeName(data.header.title);
                if (data.header.doc_number) {
                    setIdentifierText(data.header.doc_number);
                } else {
                    setIdentifierText("");
                }
                setDocVersion(data.header.version ?? "");

                if (data.header.confidence) {
                    setConfScore(Math.round(data.header.confidence * 100));
                }
            }
        } catch (err) {
            console.error("Error Auto-Detect:", err.message);
        } finally {
            setDetectingHeader(false);
        }
    };

    const goToPage = useCallback((n) => {
        if (n < 1 || n > totalPages) return;
        setCurrentPage(n);
        setImageUrl(pageImages[n - 1] || null);
        setPythonImagePath(pagePythonPaths[n - 1] || null);
        setActiveIdx(null);
        setDrawMode(DRAW.NONE);
        setTargetPreview(null);
    }, [totalPages, pageImages, pagePythonPaths]);

    const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

    const performAutoOCR = async (box, index) => {
        if (!pythonImagePath) return;
        setOcrPredicting(true);
        try {
            const { data } = await axios.post("/internal-api/template/ocr-predict", {
                image_path: pythonImagePath,
                box: box
            });

            if (data.status === "ok") {
                const detectedText = data.text || "";
                console.log("OCR Success, Result:", detectedText);

                setItems(prev => {
                    const updated = [...prev];
                    const item = { ...updated[index] };

                    if (item.item_type === "field") {
                        item.field_anchor = detectedText;
                        if (item.field_name.startsWith("nilai_") || !item.field_name) {
                            item.field_name = slugify(detectedText);
                            item.field_key = item.field_name;
                        }
                    } else if (item.item_type === "table") {
                        item.table_anchor = detectedText;
                        if (item.table_name === "Tabel Baru" || item.table_name.startsWith("Tabel_") || !item.table_name) {
                            item.table_name = detectedText;
                            item.json_key = slugify(detectedText);
                        }
                    } else if (item.item_type === "section") {
                        // Auto-fill anchor_text section dari OCR
                        if (!item.anchor_text) {
                            item.anchor_text = detectedText;
                        }
                    }
                    updated[index] = item;
                    return updated;
                });
            }
        } catch (err) {
            console.error("Auto-OCR failed:", err);
        } finally {
            setOcrPredicting(false);
        }
    };

    // Auto-OCR untuk anchor box field di dalam section
    // Mengisi field_anchor (dan auto-fill field_name jika masih default)
    const performAutoOCRForSectionField = async (box, sectionIdx, fieldIdx) => {
        if (!pythonImagePath) return;
        setOcrPredicting(true);
        try {
            const { data } = await axios.post("/internal-api/template/ocr-predict", {
                image_path: pythonImagePath,
                box: box
            });
            if (data.status === "ok") {
                const detectedText = data.text || "";
                setItems(prev => {
                    const updated = [...prev];
                    const section = { ...updated[sectionIdx] };
                    const fields  = [...(section.fields || [])];
                    const field   = { ...fields[fieldIdx] };
                    field.field_anchor = detectedText;
                    if (detectedText && (field.field_name?.startsWith("field_") || !field.field_name)) {
                        field.field_name = slugify(detectedText) || field.field_name;
                        if (!field.manual_key) field.field_key = field.field_name;
                    }
                    fields[fieldIdx]    = field;
                    section.fields      = fields;
                    updated[sectionIdx] = section;
                    return updated;
                });
            }
        } catch (err) {
            console.error("Auto-OCR section field failed:", err);
        } finally {
            setOcrPredicting(false);
        }
    };

    // Auto-OCR untuk anchor box tabel di dalam section
    // Mengisi table_anchor (dan auto-fill table_name / json_key jika masih default)
    const performAutoOCRForSectionTable = async (box, sectionIdx, tableIdx) => {
        if (!pythonImagePath) return;
        setOcrPredicting(true);
        try {
            const { data } = await axios.post("/internal-api/template/ocr-predict", {
                image_path: pythonImagePath,
                box: box
            });
            if (data.status === "ok") {
                const detectedText = data.text || "";
                setItems(prev => {
                    const updated = [...prev];
                    const section = { ...updated[sectionIdx] };
                    const tables  = [...(section.tables || [])];
                    const tbl     = { ...tables[tableIdx] };
                    tbl.table_anchor = detectedText;
                    if (detectedText && (tbl.table_name?.startsWith("Tabel ") || !tbl.table_name)) {
                        tbl.table_name = detectedText;
                        if (!tbl.manual_key) tbl.json_key = slugify(detectedText);
                    }
                    tables[tableIdx]    = tbl;
                    section.tables      = tables;
                    updated[sectionIdx] = section;
                    return updated;
                });
            }
        } catch (err) {
            console.error("Auto-OCR section table failed:", err);
        } finally {
            setOcrPredicting(false);
        }
    };

    const handleConfirmLeave = () => {
        setShowLeaveModal(false);
        allowNavRef.current = true;
        isDirtyRef.current = false;
        setIsDirty(false);
        router.visit(pendingUrl ?? '/master-template');
    };
    const handleCancelLeave = () => {
        setShowLeaveModal(false);
        setPendingUrl(null);
    };

    // Preview OCR untuk kotak target/kolom tanpa mengubah state items
    const previewTargetOCR = async (box, itemIdx, targetIdx, textType = "printed") => {
        if (!pythonImagePath) return;

        // textType diterima sebagai parameter langsung dari handleBoxDrawn
        // (TIDAK dibaca dari items state karena bisa stale/belum terupdate)

        setTargetPreview({ itemIdx, targetIdx, text: "", status: "loading", engine: null });
        try {
            const { data } = await axios.post("/internal-api/template/ocr-predict", {
                image_path: pythonImagePath,
                box: box,
                text_type: textType  // ← kirim jenis tulisan ke backend
            });
            if (data.status === "ok") {
                const text = (data.text || "").trim();
                setTargetPreview({
                    itemIdx,
                    targetIdx,
                    text,
                    status: text.length > 0 ? "ok" : "empty",
                    engine: data.engine || null,
                });
            } else if (data.status === "loading") {
                // TrOCR masih load model
                setTargetPreview({
                    itemIdx,
                    targetIdx,
                    text: "",
                    status: "trocr_loading",
                    engine: "TrOCR",
                    message: data.message || "Model TrOCR sedang dimuat...",
                });
            } else if (data.status === "error") {
                // TrOCR gagal load atau crop gagal
                setTargetPreview({
                    itemIdx,
                    targetIdx,
                    text: "",
                    status: "trocr_error",
                    engine: "TrOCR",
                    message: data.message || "TrOCR tidak dapat membaca area ini.",
                });
            } else {
                setTargetPreview({ itemIdx, targetIdx, text: "", status: "empty", engine: null });
            }
        } catch (err) {
            console.error("Target OCR preview failed:", err);
            setTargetPreview({ itemIdx, targetIdx, text: "", status: "empty", engine: null });
        }
    };

    const handleBoxDrawn = (box, mode) => {
        if (activeIdx === null) return;

        const currentItem = items[activeIdx];
        const isSection   = currentItem?.item_type === "section";

        setItems(prev => {
            const updated = [...prev];
            const item    = { ...updated[activeIdx] };

            if (isSection) {
                // ── Section: simpan ke sub-item yang sesuai ────────────────
                if (mode === DRAW.SECTION_ANCHOR) {
                    // Anchor/hint box section sendiri
                    item.anchor_box   = box;
                    item.hint_position = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
                } else if (mode === DRAW.ANCHOR && activeSectionFieldIdx !== null) {
                    const fields = [...(item.fields || [])];
                    fields[activeSectionFieldIdx] = {
                        ...fields[activeSectionFieldIdx],
                        anchor_box:    box,
                        hint_position: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
                    };
                    item.fields = fields;
                } else if (mode === DRAW.TARGET && activeSectionFieldIdx !== null && activeSectionFieldTargetIdx !== null) {
                    const fields  = [...(item.fields || [])];
                    const targets = [...(fields[activeSectionFieldIdx].targets || [])];
                    targets[activeSectionFieldTargetIdx] = { ...targets[activeSectionFieldTargetIdx], box };
                    fields[activeSectionFieldIdx] = { ...fields[activeSectionFieldIdx], targets };
                    item.fields = fields;
                } else if (mode === DRAW.TABLE_ANCHOR && activeSectionTableIdx !== null) {
                    const tables = [...(item.tables || [])];
                    tables[activeSectionTableIdx] = {
                        ...tables[activeSectionTableIdx],
                        anchor_box:    box,
                        hint_position: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
                    };
                    item.tables = tables;
                } else if (mode === DRAW.TABLE_AREA && activeSectionTableIdx !== null) {
                    const tables = [...(item.tables || [])];
                    tables[activeSectionTableIdx] = { ...tables[activeSectionTableIdx], table_area: box };
                    item.tables = tables;
                } else if (mode === DRAW.COLUMN && activeSectionTableIdx !== null && activeSectionColumnIdx !== null) {
                    const tables = [...(item.tables || [])];
                    const cols   = [...(tables[activeSectionTableIdx].columns || [])];
                    cols[activeSectionColumnIdx] = { ...cols[activeSectionColumnIdx], box };
                    tables[activeSectionTableIdx] = { ...tables[activeSectionTableIdx], columns: cols };
                    item.tables = tables;
                }
            } else {
                // ── Field / Table biasa ────────────────────────────────────
                if (mode === DRAW.ANCHOR || mode === DRAW.TABLE_ANCHOR) {
                    item.anchor_box = box;
                } else if (mode === DRAW.TABLE_AREA) {
                    item.table_area = box;
                } else if (mode === DRAW.TARGET && activeTargetIdx !== null) {
                    const newTargets = [...(item.targets || [])];
                    newTargets[activeTargetIdx] = { ...newTargets[activeTargetIdx], box };
                    item.targets = newTargets;
                } else if (mode === DRAW.COLUMN && activeColumnIdx !== null) {
                    const newCols = [...(item.columns || [])];
                    newCols[activeColumnIdx] = { ...newCols[activeColumnIdx], box };
                    item.columns = newCols;
                }
            }

            updated[activeIdx] = item;
            return updated;
        });

        setDrawMode(DRAW.NONE);

        // ── Chain reactions ────────────────────────────────────────────────
        if (isSection) {
            if (mode === DRAW.SECTION_ANCHOR) {
                // Auto-OCR untuk section anchor (mengisi anchor_text section)
                performAutoOCR(box, activeIdx);
            } else if (mode === DRAW.ANCHOR && activeSectionFieldIdx !== null) {
                // Auto-OCR → isi field_anchor field di dalam section
                performAutoOCRForSectionField(box, activeIdx, activeSectionFieldIdx);
                setTargetPreview(null);
                // Auto-tambah target pertama jika belum ada, lalu langsung ke mode TARGET
                setItems(prev => {
                    const updated = [...prev];
                    const item    = { ...updated[activeIdx] };
                    const fields  = [...(item.fields || [])];
                    const targets = [...(fields[activeSectionFieldIdx].targets || [])];
                    if (targets.length === 0) {
                        targets.push({ id: `sv-${Date.now()}`, label: "val_1", key: "val_1", text_type: "printed", box: null, manual_key: false });
                        fields[activeSectionFieldIdx] = { ...fields[activeSectionFieldIdx], targets };
                        item.fields = fields;
                        updated[activeIdx] = item;
                    }
                    return updated;
                });
                setActiveSectionFieldTargetIdx(0);
                setDrawMode(DRAW.TARGET);
            } else if (mode === DRAW.TARGET && activeSectionFieldIdx !== null && activeSectionFieldTargetIdx !== null) {
                // Preview OCR untuk value box field di dalam section
                let textType = "printed";
                setItems(prev => {
                    const freshSection = prev[activeIdx];
                    const freshField   = freshSection?.fields?.[activeSectionFieldIdx];
                    const freshTarget  = freshField?.targets?.[activeSectionFieldTargetIdx];
                    textType = freshTarget?.text_type || freshField?.text_type || "printed";
                    return prev;
                });
                setTimeout(() => previewTargetOCR(box, activeIdx, activeSectionFieldTargetIdx, textType), 0);
            } else if (mode === DRAW.TABLE_ANCHOR && activeSectionTableIdx !== null) {
                // Auto-OCR → isi table_anchor tabel di dalam section
                performAutoOCRForSectionTable(box, activeIdx, activeSectionTableIdx);
                setTargetPreview(null);
                setDrawMode(DRAW.TABLE_AREA);
            }
        } else {
            if (mode === DRAW.ANCHOR) {
                addTarget(activeIdx);
                setActiveTargetIdx(0);
                setDrawMode(DRAW.TARGET);
                performAutoOCR(box, activeIdx);
                setTargetPreview(null);
            } else if (mode === DRAW.TABLE_ANCHOR) {
                setDrawMode(DRAW.TABLE_AREA);
                performAutoOCR(box, activeIdx);
                setTargetPreview(null);
            } else if (mode === DRAW.TARGET && activeTargetIdx !== null) {
                let textType = "printed";
                setItems(prev => {
                    const freshItem   = prev[activeIdx];
                    const freshTarget = freshItem?.targets?.[activeTargetIdx];
                    textType = freshTarget?.text_type || freshItem?.text_type || "printed";
                    console.log("=== DEBUG TARGET OCR ===");
                    console.log("activeIdx:", activeIdx, "| activeTargetIdx:", activeTargetIdx);
                    console.log("textType yang akan dikirim:", textType);
                    return prev;
                });
                setTimeout(() => previewTargetOCR(box, activeIdx, activeTargetIdx, textType), 0);
            } else if (mode === DRAW.COLUMN && activeColumnIdx !== null) {
                let textType = "printed";
                setItems(prev => {
                    const freshItem = prev[activeIdx];
                    const freshCol  = freshItem?.columns?.[activeColumnIdx];
                    textType = freshCol?.text_type || "printed";
                    console.log("=== DEBUG COLUMN OCR ===");
                    console.log("freshCol.text_type:", freshCol?.text_type, "| textType:", textType);
                    return prev;
                });
                setTimeout(() => previewTargetOCR(box, activeIdx, activeColumnIdx, textType), 0);
            }
        }
    };

    const addSection = () => {
        const sectionItems = items.filter(i => i.item_type === "section");
        const n = sectionItems.length + 1;
        const name = `Section ${n}`;
        setItems(p => [...p, {
            id:             `s-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item_type:      "section",
            page:           currentPage,
            section_name:   name,
            json_key:       slugify(name),
            manual_key:     false,
            anchor_text:    "",
            anchor_box:     null,
            hint_position:  null,
            hint_tolerance: 0.15,
            fields:         [],
            tables:         [],
        }]);
        setActiveIdx(items.length);
        setDrawMode(DRAW.SECTION_ANCHOR);
        setActiveSectionFieldIdx(null);
        setActiveSectionTableIdx(null);
    };

    const addFieldToSection = (sectionIdx) => {
        setItems(p => {
            const u    = [...p];
            const sec  = { ...u[sectionIdx] };
            const f    = [...(sec.fields || [])];
            const n    = f.length + 1;
            const name = `field_${n}`;
            f.push({
                id:            `sf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                field_name:    name,
                field_key:     name,
                field_anchor:  "",
                anchor_box:    null,
                hint_position: null,
                targets:       [],
                manual_key:    false,
            });
            sec.fields  = f;
            u[sectionIdx] = sec;
            return u;
        });
        setActiveSectionFieldIdx((items[sectionIdx]?.fields || []).length);
        setActiveSectionTableIdx(null);
        setDrawMode(DRAW.ANCHOR);
    };

    const addTableToSection = (sectionIdx) => {
        setItems(p => {
            const u   = [...p];
            const sec = { ...u[sectionIdx] };
            const t   = [...(sec.tables || [])];
            const n   = t.length + 1;
            t.push({
                id:            `st-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                table_name:    `Tabel ${n}`,
                json_key:      `table_${n}`,
                table_anchor:  "",
                anchor_box:    null,
                hint_position: null,
                table_area:    null,
                columns:       [],
            });
            sec.tables    = t;
            u[sectionIdx] = sec;
            return u;
        });
        setActiveSectionTableIdx((items[sectionIdx]?.tables || []).length);
        setActiveSectionFieldIdx(null);
        setDrawMode(DRAW.TABLE_ANCHOR);
    };

    const addField = () => {
        const fieldItems = items.filter(i => i.item_type === "field");
        const existingNums = fieldItems.map(i => {
            const m = (i.field_name || "").match(/nilai_(\d+)/);
            return m ? parseInt(m[1]) : 0;
        });
        const nextId = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        const kn = `nilai_${nextId}`;

        setItems(p => [...p, {
            id: `f-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item_type: "field",
            page: currentPage,
            field_name: kn,
            field_key: kn,
            json_section: "header",
            field_anchor: "",
            anchor_box: null,
            targets: []
        }]);
        setActiveIdx(items.length);
        setDrawMode(DRAW.ANCHOR);
    };
    const addTable = () => {
        setItems(p => [...p, {
            id: `t-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item_type: "table",
            page: currentPage,
            table_name: "Tabel Baru",
            json_key: "checklist",
            table_anchor: "",
            anchor_box: null,
            table_area: null,
            columns: [],
            fallback_row_anchor_id: ""
        }]);
        setActiveIdx(items.length);
        setDrawMode(DRAW.TABLE_ANCHOR);
    };
    const removeItem = (idx) => { if (confirm("Hapus?")) { setItems(p => p.filter((_, i) => i !== idx)); setActiveIdx(null); } };
    const updateItem = (idx, k, v) => {
        setItems(p => {
            const u = [...p];
            u[idx] = { ...u[idx], [k]: v };
            
            if (k === "field_name" && !u[idx].manual_key) {
                u[idx].field_key = slugify(v);
            }
            if (k === "field_key") u[idx].manual_key = true;
            return u;
        });
    };
    const addTarget = (idx) => {
        setItems(p => {
            const u = [...p];
            const item = { ...u[idx] };
            const t = [...(item.targets || [])];
            const kn = `val_${t.length + 1}`;
            t.push({ id: `v-${Date.now()}`, label: kn, key: kn, text_type: "printed", box: null, manual_key: false });
            item.targets = t;
            u[idx] = item;
            return u;
        });
    };
    const removeTarget = (idx, ti) => { 
        setItems(p => { 
            const u = [...p]; 
            const item = { ...u[idx] };
            const t = [...item.targets];
            t.splice(ti, 1); 
            item.targets = t;
            u[idx] = item;
            return u; 
        }); 
    };
    const updateTarget = (idx, ti, k, v) => {
        setItems(p => { 
            const u = [...p]; 
            const item = { ...u[idx] };
            const t = [...item.targets];
            t[ti] = { ...t[ti], [k]: v };
            
            if (k === "label" && !t[ti].manual_key) {
                t[ti].key = slugify(v);
            }
            if (k === "key") t[ti].manual_key = true;
            
            item.targets = t;
            u[idx] = item;
            return u; 
        });
    };
    const addColumn = (idx) => {
        const currentCols = items[idx].columns?.length || 0;
        setItems(p => {
            const u = [...p];
            const item = { ...u[idx] };
            const c = [...(item.columns || [])];
            const ln = `Kolom ${c.length+1}`;
            c.push({ id: `c-${Date.now()}`, label: ln, key: slugify(ln), text_type: "printed", box: null, manual_key: false });
            item.columns = c;
            u[idx] = item;
            return u;
        });
        setActiveIdx(idx);
        setActiveColumnIdx(currentCols);
        setDrawMode(DRAW.COLUMN);
    };
    const removeColumn = (idx, ci) => { 
        setItems(p => { 
            const u = [...p]; 
            const item = { ...u[idx] };
            const c = [...item.columns];
            const colId = c[ci].id;
            c.splice(ci, 1); 
            item.columns = c;
            if (item.fallback_row_anchor_id === colId) item.fallback_row_anchor_id = "";
            u[idx] = item;
            return u; 
        }); 
    };
    const updateColumn = (idx, ci, k, v) => {
        setItems(p => { 
            const u = deepClone(p); 
            u[idx].columns[ci][k] = v; 
            if (k === "label" && !u[idx].columns[ci].manual_key) {
                u[idx].columns[ci].key = slugify(v);
            }
            if (k === "key") u[idx].columns[ci].manual_key = true;
            return u; 
        });
    };

    const handleSave = async () => {
        if (!typeName.trim() || !pdfPath) return alert("Nama & PDF wajib.");

        // Peringatan halaman tanpa konfigurasi (hanya untuk template multi-halaman)
        if (totalPages > 1) {
            const emptyPages = [];
            for (let p = 1; p <= totalPages; p++) {
                if (!items.some(item => (item.page || 1) === p)) emptyPages.push(p);
            }
            if (emptyPages.length > 0) {
                const ok = confirm(
                    `Halaman ${emptyPages.join(', ')} belum memiliki konfigurasi apapun.\nApakah Anda yakin ingin menyimpan?`
                );
                if (!ok) return;
            }
        }

        // 0. Validasi Section
        for (const sec of items.filter(i => i.item_type === "section")) {
            if (!sec.anchor_text?.trim()) return alert(`Error: Section "${sec.section_name}" wajib memiliki Anchor Text.`);
            if (!sec.anchor_box)          return alert(`Error: Section "${sec.section_name}" wajib memiliki Hint Anchor box (gambar kotak dulu).`);
            if (!(sec.fields?.length > 0) && !(sec.tables?.length > 0))
                return alert(`Error: Section "${sec.section_name}" wajib memiliki minimal 1 field atau 1 tabel.`);
        }

        // 1. Validasi Tabel (Production Grade)
        for (const tab of items.filter(i => i.item_type === "table")) {
            if (!tab.table_anchor.trim() || !tab.anchor_box || !tab.table_area) {
                return alert(`Error: Tabel "${tab.table_name}" wajib memiliki Anchor (Poin 1) dan Area (Poin 2).`);
            }
            if (!tab.columns || tab.columns.length === 0) {
                return alert(`Error: Tabel "${tab.table_name}" tidak memiliki kolom.`);
            }
            if (!tab.columns.some(c => c.is_row_anchor)) {
                return alert(`Error: Tabel "${tab.table_name}" wajib memiliki minimal satu kolom Anchor baris.`);
            }
            
            // Overlap Validation (Jitter 10px)
            const cols = tab.columns;
            for (let i = 0; i < cols.length; i++) {
                for (let j = i + 1; j < cols.length; j++) {
                    const b1 = cols[i].box;
                    const b2 = cols[j].box;
                    if (b1 && b2) {
                        const b1x = b1.x ?? b1.left ?? 0;
                        const b2x = b2.x ?? b2.left ?? 0;
                        const b1w = b1.w ?? b1.width ?? 0;
                        const b2w = b2.w ?? b2.width ?? 0;
                        const start = Math.max(b1x, b2x);
                        const end = Math.min(b1x + b1w, b2x + b2w);
                        const overlap = Math.max(0, end - start);
                        if (overlap > 0.004) return alert(`Error: Kolom "${cols[i].label}" dan "${cols[j].label}" tumpang tindih. Harap rapikan.`);
                    }
                }
            }
        }

        // Helper to convert ratio box to pixel box
        const getBoxPx = (box) => {
            if (!box || !naturalSize) return box;
            if (box.w !== undefined) {
                return {
                    x: Math.round(box.x * naturalSize.width),
                    y: Math.round(box.y * naturalSize.height),
                    width: Math.round(box.w * naturalSize.width),
                    height: Math.round(box.h * naturalSize.height)
                };
            }
            return box;
        };

        const pFields = items.filter(i => i.item_type === "field" && i.anchor_box).flatMap(item =>
            (item.targets || []).filter(t => t.box).map(t => {
                const aBox = getBoxPx(item.anchor_box);
                const tBox = getBoxPx(t.box);
                return {
                    field_name: item.field_key + (item.targets.length > 1 ? `_${t.key}` : ""),
                    anchor_text: item.field_anchor,
                    offset_x: Math.round(tBox.x - aBox.x),
                    offset_y: Math.round(tBox.y - aBox.y),
                    width: tBox.width, height: tBox.height, type: t.text_type,
                    page: item.page || 1,
                    ...(t.text_type === "checkbox" ? {
                        checkbox_checked_value: t.checkbox_checked_value || "OK",
                        checkbox_empty_value: ""
                    } : {})
                };
            })
        );

        const pTables = items.filter(i => i.item_type === "table" && i.table_area && i.anchor_box).map(tab => {
            const rowAnchor = tab.columns.find(c => c.is_row_anchor);
            const multiLineCols = tab.columns.filter(c => c.is_multi_line);
            const fallbackCol = tab.columns.find(c => c.id === tab.fallback_row_anchor_id);
            
            const aBox = getBoxPx(tab.anchor_box);
            const areaBox = getBoxPx(tab.table_area);

            return {
                table_name: tab.table_name, json_key: tab.json_key,
                anchor: { 
                    texts: tab.table_anchor.split(",").map(s => s.trim()).filter(s => s), 
                    match_type: tab.table_anchor_match_type || "contains" 
                },
                area: { offset_y: Math.round(areaBox.y - aBox.y), height: Math.round(areaBox.height) },
                row_detection: { 
                    method: "anchor_based", 
                    primary_column: rowAnchor?.key || null,
                    fallback_column: fallbackCol?.key || null,
                    y_threshold: "auto" 
                },
                multi_line_handling: multiLineCols.map(c => ({
                    column: c.key, group_by: "y", y_threshold: "auto", merge_by: "x", output_format: "list", sort_order: ["y_asc", "x_asc"]
                })),
                columns: tab.columns.map(col => {
                    const cBox = getBoxPx(col.box);
                    const colData = {
                        name: col.label, key: col.key,
                        offset_x_start: Math.round((cBox?.x || 0) - aBox.x),
                        offset_x_end: Math.round(((cBox?.x || 0) + (cBox?.width || 0)) - aBox.x),
                        type: col.text_type || "printed",
                        is_row_anchor: !!col.is_row_anchor,
                        multi_line: !!col.is_multi_line
                    };
                    if (col.text_type === "checkbox") {
                        colData.checkbox_checked_value = col.checkbox_checked_value || "OK";
                        colData.checkbox_empty_value = "";
                    }
                    return colData;
                }),
                page: tab.page || 1,
                tolerance: { x_padding: 20, y_padding: 10 },
                fallback: { on_anchor_not_found: "skip_table", on_empty_cell: "return_empty_string" }
            };
        });

        // Transformasi repeating_sections
        const pSections = items
            .filter(i => i.item_type === "section" && i.anchor_box)
            .map(section => {
                const tolerance = section.hint_tolerance || 0.15;
                return {
                    section_name:   section.section_name,
                    json_key:       section.json_key,
                    anchor_text:    section.anchor_text,
                    hint_position:  section.hint_position || {
                        x: section.anchor_box.x + section.anchor_box.w / 2,
                        y: section.anchor_box.y + section.anchor_box.h / 2,
                    },
                    hint_tolerance: tolerance,
                    page:           section.page || 1,
                    fields: (section.fields || [])
                        .filter(f => f.anchor_box && (f.targets || []).some(t => t.box))
                        .map(f => {
                            const fABox = getBoxPx(f.anchor_box);
                            const t0    = (f.targets || []).find(t => t.box);
                            const tBox  = getBoxPx(t0?.box);
                            return {
                                field_name:    f.field_key,
                                anchor_text:   f.field_anchor,
                                hint_position: f.hint_position || {
                                    x: f.anchor_box.x + f.anchor_box.w / 2,
                                    y: f.anchor_box.y + f.anchor_box.h / 2,
                                },
                                hint_tolerance: tolerance,
                                offset_x: Math.round(tBox.x - fABox.x),
                                offset_y: Math.round(tBox.y - fABox.y),
                                width:    tBox.width,
                                height:   tBox.height,
                                type:     t0?.text_type || "printed",
                                ...(t0?.text_type === "checkbox" ? { checkbox_checked_value: t0.checkbox_checked_value || "OK", checkbox_empty_value: "" } : {}),
                            };
                        }),
                    tables: (section.tables || [])
                        .filter(t => t.anchor_box && t.table_area)
                        .map(t => {
                            const tABox   = getBoxPx(t.anchor_box);
                            const areaBox = getBoxPx(t.table_area);
                            const rowAnchorCol = (t.columns || []).find(c => c.is_row_anchor);
                            return {
                                table_name: t.table_name,
                                json_key:   t.json_key,
                                anchor: {
                                    texts:          [t.table_anchor].filter(Boolean),
                                    match_type:     t.table_anchor_match_type || "contains",
                                    hint_position:  t.hint_position || {
                                        x: t.anchor_box.x + t.anchor_box.w / 2,
                                        y: t.anchor_box.y + t.anchor_box.h / 2,
                                    },
                                    hint_tolerance: tolerance,
                                },
                                area: {
                                    offset_y: Math.round(areaBox.y - tABox.y),
                                    height:   Math.round(areaBox.height),
                                },
                                row_detection: {
                                    method:          "anchor_based",
                                    primary_column:  rowAnchorCol?.key || null,
                                    fallback_column: null,
                                    y_threshold:     "auto",
                                },
                                columns: (t.columns || []).map(col => {
                                    const cBox = getBoxPx(col.box);
                                    return {
                                        name:           col.label,
                                        key:            col.key,
                                        offset_x_start: Math.round((cBox?.x || 0) - tABox.x),
                                        offset_x_end:   Math.round(((cBox?.x || 0) + (cBox?.width || 0)) - tABox.x),
                                        type:           col.text_type || "printed",
                                        is_row_anchor:  !!col.is_row_anchor,
                                        multi_line:     !!col.is_multi_line,
                                    };
                                }),
                                tolerance: { x_padding: 20, y_padding: 10 },
                                fallback:  { on_anchor_not_found: "skip_table", on_empty_cell: "return_empty_string" },
                            };
                        }),
                };
            });

        setSaving(true);
        try {
            await axios.post("/internal-api/template/save", {
                template_name: typeName.toLowerCase().replace(/\s+/g, "_"),
                type_name: typeName,
                identifier_text: identifierText,
                doc_version: docVersion,
                pdf_path: pdfPath,
                mapping_config: {
                    fields:              pFields,
                    tables:              pTables,
                    ...(pSections.length > 0 && { repeating_sections: pSections }),
                    total_pages:         totalPages,
                },
                ui_metadata: items,
                image_path: imagePath,
                ...(isEdit && { template_id: editingTemplate.id })
            });
            setSaveMsg("success");
            setIsDirty(false);
            isDirtyRef.current = false;
            setTimeout(() => router.visit("/master-template"), 1500);
        } catch (err) { 
            setSaveMsg("error"); 
            const msg = err.response?.data?.message || err.message;
            alert("Gagal Simpan: " + msg);
        } finally { setSaving(false); }
    };

    const dmLabel = {
        [DRAW.ANCHOR]:         "📍 DRAW FIELD ANCHOR",
        [DRAW.TARGET]:         "🎯 DRAW FIELD VALUE",
        [DRAW.TABLE_ANCHOR]:   "⚓ DRAW TABLE ANCHOR (0,0)",
        [DRAW.TABLE_AREA]:     "🔳 DRAW TABLE AREA",
        [DRAW.COLUMN]:         "🟩 DRAW COLUMN BOUNDARY",
        [DRAW.SECTION_ANCHOR]: "🔄 DRAW SECTION HINT ANCHOR",
    }[drawMode];

    return (
        <AuthenticatedLayout header={isEdit ? "Edit Template" : "Buat Template"}>
            <Head title="Editor Template" />
            {showLeaveModal && (
                <UnsavedChangesModal onStay={handleCancelLeave} onLeave={handleConfirmLeave} />
            )}
            <div className="flex flex-col gap-4 max-w-[1600px] mx-auto px-4">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => {
                            if (isDirty) {
                                setPendingUrl('/master-template');
                                setShowLeaveModal(true);
                            } else {
                                router.visit('/master-template');
                            }
                        }}
                        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition"
                    ><BackIcon /> Back</button>
                    <button onClick={handleSave} disabled={saving || !typeName.trim() || !pdfPath} className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${saveMsg === "success" ? "bg-emerald-500 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"}`}>{saving ? "Saving..." : "Save Template"}</button>
                </div>

                <div className="flex gap-6">
                    <div className="flex-1 space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className={`grid gap-8 items-start transition-all duration-500 ${pdfPath ? "grid-cols-1" : "grid-cols-2"}`}>
                                {/* KOLOM KIRI: INPUT KONFIGURASI */}
                                <div className="space-y-4">
                                    <div className="relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-wider flex justify-between items-center">
                                            <span>Document Identifier</span>
                                            {detectingHeader && (
                                                <span className="flex items-center gap-1.5 text-indigo-600 animate-pulse lowercase font-bold tracking-normal italic">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]"></span>
                                                    AI Scanning Header...
                                                </span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={identifierText} 
                                                onChange={e => setIdentifierText(e.target.value)} 
                                                placeholder={detectingHeader ? "Reading document..." : "Teks unik di header..."} 
                                                className={`w-full border-none bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-100 font-medium text-sm text-slate-700 transition-all ${detectingHeader ? "opacity-50" : ""}`} 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-wider">Versi Dokumen</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={docVersion}
                                                onChange={e => setDocVersion(e.target.value)}
                                                placeholder="contoh: 1.0, 1.1 (rev.1)"
                                                className="w-full border-none bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-100 font-medium text-sm text-slate-700"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-wider">Template Name</label>
                                        <input type="text" value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="ex: Formulir PM UPS..." className="w-full border-none bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-100 font-medium text-sm text-slate-700" />
                                    </div>
                                    {pdfPath && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-3 py-1 rounded-full border border-emerald-100 animate-in fade-in slide-in-from-left-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                MASTER PDF LOADED 
                                            </div>
                                            {confScore && (
                                                <div className={`text-[10px] font-black px-2 py-0.5 rounded border ${confScore > 90 ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-amber-600 bg-amber-50 border-amber-100'}`}>
                                                    {confScore}% AI Confidence
                                                </div>
                                            )}
                                            <button onClick={() => {setPdfPath(null); setConfScore(null);}} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase">[Change File]</button>
                                        </div>
                                    )}
                                </div>

                                {/* KOLOM KANAN: UPLOAD (Hanya muncul kalau belum ada file) */}
                                {!pdfPath && (
                                    <div className="h-full flex flex-col justify-center animate-in fade-in zoom-in-95 duration-300">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block tracking-wider text-center">Master Document Source</label>
                                        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30 p-4 transition-all hover:border-indigo-100">
                                            <button 
                                                onClick={() => fileInputRef.current.click()} 
                                                className="w-full h-full min-h-[100px] bg-white border border-slate-200 text-slate-600 px-6 py-4 rounded-xl font-bold text-sm shadow-sm hover:shadow-md hover:border-indigo-400 hover:text-indigo-600 transition-all flex flex-col items-center justify-center gap-2 group"
                                            >
                                                <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-indigo-50 transition-colors">
                                                    <UploadIcon />
                                                </div>
                                                <span>{converting ? "Processing..." : "Upload Master PDF"}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                        </div>
                        {drawMode !== DRAW.NONE && <div className="bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold text-xs flex justify-between items-center shadow-lg animate-pulse"><span>{dmLabel}</span> <button onClick={() => setDrawMode(DRAW.NONE)} className="opacity-60 hover:opacity-100">✕ CANCEL</button></div>}

                        {totalPages > 1 && (
                            <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-3 shadow-sm w-fit">
                                <button
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm border border-slate-200"
                                >←</button>
                                <span className="text-xs font-bold text-slate-700 min-w-[110px] text-center">
                                    Halaman {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm border border-slate-200"
                                >→</button>
                                <span className="text-[9px] text-slate-400 border-l border-slate-100 pl-3">
                                    {items.filter(i => (i.page || 1) === currentPage).length} item di halaman ini
                                </span>
                            </div>
                        )}

                        {imageUrl && (
                            <div className="bg-white rounded-xl border border-slate-200 p-2 flex gap-2 w-fit mb-[-10px] ml-auto relative z-10 shadow-sm">
                                <button onClick={() => setZoom(z => Math.max(0.5, z-0.25))} className="w-8 h-8 rounded bg-slate-50 inline-flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100">-</button>
                                <span className="text-[10px] font-bold text-slate-500 min-w-[40px] text-center flex items-center justify-center">{Math.round(zoom*100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(3, z+0.25))} className="w-8 h-8 rounded bg-slate-50 inline-flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100">+</button>
                            </div>
                        )}

                        <CanvasEditor imageUrl={imageUrl} items={items} activeIdx={activeIdx} drawMode={drawMode} zoom={zoom} onBoxDrawn={handleBoxDrawn} onImageLoad={setNaturalSize} currentPage={currentPage} />
                    </div>

                    <div className="w-[360px] flex flex-col gap-4 sticky top-6 h-[calc(100vh-120px)] overflow-hidden">
                        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Add Elements</p>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={addField} className="bg-slate-50 hover:bg-slate-100 p-3 rounded-xl flex flex-col items-center gap-1 transition-all group border border-slate-100"><FieldIcon /><span className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-600">+ FIELD</span></button>
                                <button onClick={addTable} className="bg-white hover:bg-rose-50 p-3 rounded-xl flex flex-col items-center gap-1 transition-all group border border-rose-50"><TableIcon /><span className="text-[10px] font-bold text-rose-600">+ TABLE</span></button>
                                <button onClick={addSection} className="bg-white hover:bg-violet-50 p-3 rounded-xl flex flex-col items-center gap-1 transition-all group border border-violet-50"><RepeatIcon /><span className="text-[10px] font-bold text-violet-600">+ SECTION</span></button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 flex-1 flex flex-col shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuration List</p></div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {items.map((item, i) => (
                                    item.item_type === "field" ? (
                                        <FieldPanel key={i} item={item} idx={i} isActive={activeIdx === i} drawMode={drawMode} activeTargetIdx={activeTargetIdx} setActiveIdx={setActiveIdx} setDrawMode={setDrawMode} setActiveTargetIdx={setActiveTargetIdx} updateItem={updateItem} removeItem={removeItem} addTarget={addTarget} removeTarget={removeTarget} updateTarget={updateTarget} ocrPredicting={ocrPredicting} targetPreview={targetPreview} />
                                    ) : item.item_type === "table" ? (
                                        <TablePanel key={i} item={item} idx={i} isActive={activeIdx === i} drawMode={drawMode} activeColumnIdx={activeColumnIdx} setActiveIdx={setActiveIdx} setDrawMode={setDrawMode} setActiveColumnIdx={setActiveColumnIdx} updateItem={updateItem} removeItem={removeItem} addColumn={addColumn} removeColumn={removeColumn} updateColumn={updateColumn} ocrPredicting={ocrPredicting} targetPreview={targetPreview} />
                                    ) : item.item_type === "section" ? (
                                        <SectionPanel key={i} item={item} idx={i} isActive={activeIdx === i} drawMode={drawMode} setDrawMode={setDrawMode} setActiveIdx={setActiveIdx} updateItem={updateItem} removeItem={removeItem} addFieldToSection={addFieldToSection} addTableToSection={addTableToSection} activeSectionFieldIdx={activeSectionFieldIdx} setActiveSectionFieldIdx={setActiveSectionFieldIdx} activeSectionFieldTargetIdx={activeSectionFieldTargetIdx} setActiveSectionFieldTargetIdx={setActiveSectionFieldTargetIdx} activeSectionTableIdx={activeSectionTableIdx} setActiveSectionTableIdx={setActiveSectionTableIdx} activeSectionColumnIdx={activeSectionColumnIdx} setActiveSectionColumnIdx={setActiveSectionColumnIdx} ocrPredicting={ocrPredicting} />
                                    ) : null
                                ))}
                            </div>
                            <div className="h-44 bg-slate-900 overflow-hidden flex flex-col border-t border-slate-800">
                                <div className="p-3 border-b border-white/5 flex justify-between bg-white/[0.02]"><span className="text-[9px] font-bold text-slate-500 uppercase">Engine Live Preview (Generated JSON)</span><div className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span></div></div>
                                <div className="flex-1 p-3 overflow-auto font-mono text-[9px] text-emerald-400/80">
                                    <pre>{(() => {
                                        const getBoxPx = (box) => {
                                            if (!box || !naturalSize) return box;
                                            if (box.w !== undefined) {
                                                return {
                                                    x: Math.round(box.x * naturalSize.width),
                                                    y: Math.round(box.y * naturalSize.height),
                                                    width: Math.round(box.w * naturalSize.width),
                                                    height: Math.round(box.h * naturalSize.height)
                                                };
                                            }
                                            return box;
                                        };

                                        const previewSections = items
                                            .filter(i => i.item_type === "section" && i.anchor_box)
                                            .map(sec => ({
                                                section_name:   sec.section_name,
                                                json_key:       sec.json_key,
                                                anchor_text:    sec.anchor_text,
                                                hint_position:  sec.hint_position,
                                                hint_tolerance: sec.hint_tolerance || 0.15,
                                                page:           sec.page || 1,
                                                fields_count:   (sec.fields || []).length,
                                                tables_count:   (sec.tables || []).length,
                                            }));

                                        return JSON.stringify({
                                            total_pages: totalPages,
                                            fields: items.filter(i=>i.item_type==="field" && i.anchor_box).flatMap(item =>
                                                (item.targets || []).filter(t => t.box).map(t => {
                                                    const aBox = getBoxPx(item.anchor_box);
                                                    const tBox = getBoxPx(t.box);
                                                    return {
                                                        field_name: item.field_key + (item.targets.length > 1 ? `_${t.key}` : ""),
                                                        anchor_text: item.field_anchor,
                                                        offset_x: Math.round(tBox.x - aBox.x),
                                                        offset_y: Math.round(tBox.y - aBox.y),
                                                        width: tBox.width, height: tBox.height, type: t.text_type,
                                                        page: item.page || 1,
                                                        ...(t.text_type === "checkbox" ? { checkbox_checked_value: t.checkbox_checked_value || "OK", checkbox_empty_value: "" } : {})
                                                    };
                                                })
                                            ),
                                            tables: items.filter(i => i.item_type === "table" && i.table_area && i.anchor_box).map(tab => {
                                                const rowAnchor = (tab.columns || []).find(c => c.is_row_anchor);
                                                const multiLineCols = (tab.columns || []).filter(c => c.is_multi_line);
                                                const fallbackCol = (tab.columns || []).find(c => c.id === tab.fallback_row_anchor_id);
                                                const aBox = getBoxPx(tab.anchor_box);
                                                const areaBox = getBoxPx(tab.table_area);
                                                return {
                                                    table_name: tab.table_name,
                                                    json_key: tab.json_key,
                                                    anchor: { 
                                                        texts: (tab.table_anchor || "").split(",").map(s => s.trim()).filter(s => s), 
                                                        match_type: tab.table_anchor_match_type || "contains" 
                                                    },
                                                    area: { 
                                                        offset_y: Math.round(areaBox.y - aBox.y), 
                                                        height: areaBox.height 
                                                    },
                                                    row_detection: {
                                                        method: "anchor_based",
                                                        primary_column: rowAnchor?.key || null,
                                                        fallback_column: fallbackCol?.key || null,
                                                        y_threshold: "auto"
                                                    },
                                                    page: tab.page || 1,
                                                    columns: (tab.columns || []).map(col => {
                                                        const cBox = getBoxPx(col.box);
                                                        const cd = {
                                                            name: col.label,
                                                            key: col.key,
                                                            offset_x_start: Math.round((cBox?.x || 0) - aBox.x),
                                                            offset_x_end: Math.round(((cBox?.x || 0) + (cBox?.width || 0)) - aBox.x),
                                                            type: col.text_type || "printed",
                                                            is_row_anchor: !!col.is_row_anchor,
                                                            multi_line: !!col.is_multi_line,
                                                            ...(col.text_type === "checkbox" ? { checkbox_checked_value: col.checkbox_checked_value || "OK", checkbox_empty_value: "" } : {})
                                                        };
                                                        return cd;
                                                    }),
                                                    multi_line_handling: multiLineCols.map(c => ({ 
                                                        column: c.key, group_by: "y", y_threshold: "auto", sort_order: ["y_asc", "x_asc"]
                                                    })),
                                                    tolerance: { x_padding: 20, y_padding: 10 }
                                                };
                                            }),
                                            ...(previewSections.length > 0 && { repeating_sections: previewSections }),
                                        }, null, 2);
                                    })()}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
