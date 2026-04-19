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

// ══════════════════════════════════════════════════════════════
// MODE GAMBAR
// ══════════════════════════════════════════════════════════════
const DRAW = {
    NONE:         "none",
    ANCHOR:       "anchor",       // Anchor field biasa (kuning)
    TARGET:       "target",       // Target field biasa (biru)
    TABLE_AREA:   "table_area",   // Area keseluruhan tabel (oranye)
    COLUMN:       "column",       // Kotak kolom ( hijau)
    NODE_ANCHOR:  "node_anchor",  // Anchor node tabel (kuning)
    NODE_VALUE:   "node_value",   // Nilai node tabel (biru ungu)
};

// Tipe node dalam hierarki tabel
const NODE = {
    CATEGORY:    "category",
    ITEM:        "item",
    PARENT_ITEM: "parent_item",
    SUB_ITEM:    "sub_item",
};

const NODE_STYLE = {
    category:    { border: "#7c3aed", bg: "rgba(124,58,237,0.08)",  badge: "bg-violet-600",  label: "KATEGORI" },
    item:        { border: "#2563eb", bg: "rgba(37,99,235,0.06)",   badge: "bg-blue-600",    label: "ITEM" },
    parent_item: { border: "#0891b2", bg: "rgba(8,145,178,0.06)",   badge: "bg-cyan-600",    label: "PARENT" },
    sub_item:    { border: "#059669", bg: "rgba(5,150,105,0.06)",   badge: "bg-emerald-600", label: "SUB" },
};

// Seksi JSON yang tersedia untuk field biasa
const JSON_SECTIONS = [
    { value: "document", label: "document — Info Dokumen" },
    { value: "header",   label: "header — Header Form" },
    { value: "notes",    label: "notes — Catatan / Footer" },
    { value: "mengetahui", label: "mengetahui — Pengesah" },
];

// ══════════════════════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════════════════════
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const getNodeAtPath = (nodes, path) => {
    if (!path || path.length === 0 || !nodes) return null;
    let node = nodes[path[0]];
    for (let i = 1; i < path.length; i++) {
        if (!node?.children) return null;
        node = node.children[path[i]];
    }
    return node;
};

const setNodeAtPath = (nodes, path, updater) => {
    const cloned = deepClone(nodes);
    if (path.length === 1) {
        cloned[path[0]] = updater(cloned[path[0]]);
        return cloned;
    }
    const setIn = (arr, pathSlice) => {
        const idx = pathSlice[0];
        if (pathSlice.length === 1) {
            arr[idx] = updater(arr[idx]);
        } else {
            arr[idx] = { ...arr[idx] };
            arr[idx].children = deepClone(arr[idx].children || []);
            setIn(arr[idx].children, pathSlice.slice(1));
        }
    };
    setIn(cloned, path);
    return cloned;
};

// ══════════════════════════════════════════════════════════════
// CANVAS EDITOR
// ══════════════════════════════════════════════════════════════
function CanvasEditor({ imageUrl, items, activeIdx, drawMode, zoom = 1, onBoxDrawn }) {
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const [scale, setScale] = useState(1);
    const [drawing, setDrawing] = useState(false);
    const [startPt, setStartPt] = useState(null);
    const [curPt, setCurPt] = useState(null);

    const computeScale = useCallback(() => {
        if (!containerRef.current || !imgRef.current) return;
        setScale(containerRef.current.clientWidth / imgRef.current.naturalWidth);
    }, []);

    useEffect(() => { computeScale(); }, [zoom, computeScale]);

    const getPos = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
    };

    const canDraw = drawMode !== DRAW.NONE;

    const onMouseDown = (e) => {
        if (!canDraw) return;
        e.preventDefault();
        const pos = getPos(e);
        setDrawing(true); setStartPt(pos); setCurPt(pos);
    };
    const onMouseMove = (e) => { if (drawing) setCurPt(getPos(e)); };
    const onMouseUp = (e) => {
        if (!drawing || !startPt) return;
        const end = getPos(e);
        const box = {
            x: Math.round(Math.min(startPt.x, end.x)),
            y: Math.round(Math.min(startPt.y, end.y)),
            width: Math.round(Math.abs(end.x - startPt.x)),
            height: Math.round(Math.abs(end.y - startPt.y)),
        };
        if (box.width > 5 && box.height > 5) onBoxDrawn(box, drawMode);
        setDrawing(false); setStartPt(null); setCurPt(null);
    };

    // Warna kotak sementara
    const tempColor = {
        [DRAW.ANCHOR]:      "border-amber-500 bg-amber-400/15",
        [DRAW.TARGET]:      "border-indigo-500 bg-indigo-400/15",
        [DRAW.TABLE_AREA]:  "border-orange-500 bg-orange-400/10",
        [DRAW.COLUMN]:      "border-green-500 bg-green-400/10",
        [DRAW.NODE_ANCHOR]: "border-amber-500 bg-amber-400/15",
        [DRAW.NODE_VALUE]:  "border-indigo-500 bg-indigo-400/15",
    }[drawMode] || "border-slate-400 bg-slate-400/10";

    const tempBox = drawing && startPt && curPt ? {
        left:   Math.min(startPt.x, curPt.x) * scale,
        top:    Math.min(startPt.y, curPt.y) * scale,
        width:  Math.abs(curPt.x - startPt.x) * scale,
        height: Math.abs(curPt.y - startPt.y) * scale,
    } : null;

    // Render semua box
    const boxes = [];
    (items || []).forEach((item, ii) => {
        const isActive = ii === activeIdx;

        if (item.item_type === "field") {
            if (item.anchor_box) {
                boxes.push(
                    <div key={`fa-${ii}`} className="absolute pointer-events-none"
                        style={{ left: item.anchor_box.x * scale, top: item.anchor_box.y * scale, width: item.anchor_box.width * scale, height: item.anchor_box.height * scale, border: `2px solid ${isActive ? "#f59e0b" : "rgba(245,158,11,0.4)"}`, background: isActive ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.04)", zIndex: isActive ? 10 : 1 }}>
                        <span className="absolute -top-5 left-0 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                            A · {item.field_name}
                        </span>
                    </div>
                );
            }
            (item.targets || []).forEach((t, ti) => {
                if (!t.box) return;
                boxes.push(
                    <div key={`ft-${ii}-${ti}`} className="absolute pointer-events-none"
                        style={{ left: t.box.x * scale, top: t.box.y * scale, width: t.box.width * scale, height: t.box.height * scale, border: `2px solid ${isActive ? "#6366f1" : "rgba(99,102,241,0.3)"}`, background: isActive ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.03)", zIndex: isActive ? 10 : 1 }}>
                        <span className="absolute -bottom-5 left-0 bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                            {t.label}
                        </span>
                    </div>
                );
            });
        }

        if (item.item_type === "table") {
            if (item.table_area) {
                boxes.push(
                    <div key={`ta-${ii}`} className="absolute pointer-events-none"
                        style={{ left: item.table_area.x * scale, top: item.table_area.y * scale, width: item.table_area.width * scale, height: item.table_area.height * scale, border: "2px solid #ea580c", background: "rgba(234,88,12,0.05)", zIndex: 1 }}>
                        <span className="absolute -top-5 left-0 bg-orange-600 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                            TABEL · {item.table_name}
                        </span>
                    </div>
                );
            }
            (item.columns || []).forEach((col, ci) => {
                if (!col.box) return;
                boxes.push(
                    <div key={`tc-${ii}-${ci}`} className="absolute pointer-events-none"
                        style={{ left: col.box.x * scale, top: col.box.y * scale, width: col.box.width * scale, height: col.box.height * scale, border: "1.5px dashed #16a34a", background: "rgba(22,163,74,0.05)", zIndex: 2 }}>
                        <span className="absolute -top-5 left-0 bg-green-600 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                            {col.label || col.key}
                        </span>
                    </div>
                );
            });
            // Render node boxes rekursif
            const renderNodes = (nodes, depth = 0) => {
                (nodes || []).forEach((node, ni) => {
                    const style = NODE_STYLE[node.node_type] || NODE_STYLE.item;
                    if (node.anchor_box) {
                        boxes.push(
                            <div key={`tn-${ii}-${depth}-${ni}`} className="absolute pointer-events-none"
                                style={{ left: node.anchor_box.x * scale, top: node.anchor_box.y * scale, width: node.anchor_box.width * scale, height: node.anchor_box.height * scale, border: `2px solid ${style.border}`, background: style.bg, zIndex: 3 + depth }}>
                                <span className={`absolute -top-5 left-0 ${style.badge} text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap`}>
                                    {style.label} · {node.label}
                                </span>
                            </div>
                        );
                    }
                    Object.entries(node.values || {}).forEach(([vk, vd]) => {
                        if (!vd.box) return;
                        boxes.push(
                            <div key={`tv-${ii}-${depth}-${ni}-${vk}`} className="absolute pointer-events-none"
                                style={{ left: vd.box.x * scale, top: vd.box.y * scale, width: vd.box.width * scale, height: vd.box.height * scale, border: "1.5px solid rgba(99,102,241,0.5)", background: "rgba(99,102,241,0.05)", zIndex: 3 + depth }}>
                                <span className="absolute -bottom-5 left-0 bg-indigo-500 text-white text-[9px] px-1 py-0.5 rounded whitespace-nowrap">
                                    {vk}
                                </span>
                            </div>
                        );
                    });
                    if (node.children) renderNodes(node.children, depth + 1);
                });
            };
            renderNodes(item.nodes);
        }
    });

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-auto">
            <div ref={containerRef} className="relative select-none"
                style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, cursor: canDraw ? "crosshair" : "default" }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
                onMouseLeave={() => { setDrawing(false); setStartPt(null); setCurPt(null); }}>
                {imageUrl ? (
                    <>
                        <img ref={imgRef} src={imageUrl} alt="Dokumen" className="w-full h-auto block" onLoad={computeScale} draggable={false} />
                        {boxes}
                        {tempBox && <div className={`absolute border-2 pointer-events-none ${tempColor}`} style={{ left: tempBox.left, top: tempBox.top, width: tempBox.width, height: tempBox.height }} />}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-72 gap-3 text-slate-400">
                        <UploadIcon />
                        <p className="text-sm">Upload PDF master untuk memulai</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// NODE PANEL (rekursif, untuk tabel)
// ══════════════════════════════════════════════════════════════
function NodePanel({ node, nodePath, itemIdx, activeNodePath, activeValueKey, drawMode,
    setActiveNodePath, setActiveValueKey, setDrawMode, updateNode, removeNode, addChildNode, syncNodeValues, depth = 0 }) {

    // FIX BUG: activeNodePath adalah { path: [...], itemIdx } bukan array
    const isActive =
        activeNodePath != null &&
        activeNodePath.itemIdx === itemIdx &&
        JSON.stringify(activeNodePath.path) === JSON.stringify(nodePath);

    const style      = NODE_STYLE[node.node_type] || NODE_STYLE.item;
    const isCategory = node.node_type === NODE.CATEGORY;
    const isParent   = node.node_type === NODE.PARENT_ITEM;
    const isItem     = node.node_type === NODE.ITEM;
    const isSubItem  = node.node_type === NODE.SUB_ITEM;
    const needsValues = isItem || isSubItem;

    // Semua tipe node punya anchor — Kategori juga perlu digambar posisi barisnya
    const anchorDone  = !!node.anchor_box;
    const valuesDone  = !needsValues || Object.values(node.values || {}).every(v => v.box);
    const rowComplete = anchorDone && valuesDone;

    // Auto-label berdasarkan tipe dan posisi di tree
    const depth0 = nodePath[nodePath.length - 1]; // index di antara siblings
    const autoLabel = isCategory ? `Kategori ${nodePath[0] + 1}`
                    : isParent   ? `Parent Baris ${depth0 + 1}`
                    : isItem     ? `Baris ${depth0 + 1}`
                    :              `Sub ${depth0 + 1}`;

    return (
        <div className="mt-1" style={{ marginLeft: depth * 10 }}>
            <div className={`rounded-lg cursor-pointer transition border ${isActive ? "border-indigo-300 bg-white shadow-sm" : "border-transparent hover:bg-slate-50"}`}
                onClick={() => { setActiveNodePath({ path: nodePath, itemIdx }); setDrawMode(DRAW.NONE); }}>

                {/* Baris ringkasan node */}
                <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`${style.badge} text-white text-[8px] px-1 py-0.5 rounded font-bold flex-shrink-0`}>
                            {style.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 truncate">
                            {autoLabel}
                        </span>
                        {/* Status indicator */}
                        <span className={`text-[8px] px-1 rounded flex-shrink-0 ${anchorDone ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
                            {anchorDone ? "✓" : "□"}
                        </span>
                        {needsValues && (
                            <span className={`text-[8px] px-1 rounded flex-shrink-0 ${valuesDone && Object.keys(node.values || {}).length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                                {Object.values(node.values || {}).filter(v => v.box).length}/{Object.keys(node.values || {}).length}
                            </span>
                        )}
                        {rowComplete && Object.keys(node.values || {}).length > 0 && (
                            <span className="text-[8px] px-1 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">✓ OK</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {isCategory && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); addChildNode(itemIdx, nodePath, NODE.ITEM); }}
                                    className="text-[9px] text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"
                                    title="Tambah Item biasa">+Item</button>
                                <button onClick={(e) => { e.stopPropagation(); addChildNode(itemIdx, nodePath, NODE.PARENT_ITEM); }}
                                    className="text-[9px] text-cyan-600 hover:bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-100"
                                    title="Tambah Parent Item (ada sub di bawahnya)">+Parent</button>
                            </>
                        )}
                        {isParent && (
                            <button onClick={(e) => { e.stopPropagation(); addChildNode(itemIdx, nodePath, NODE.SUB_ITEM); }}
                                className="text-[9px] text-emerald-600 hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100"
                                title="Tambah Sub-Item">+Sub</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); removeNode(itemIdx, nodePath); }}
                            className="text-slate-300 hover:text-red-500 p-0.5 rounded"><TrashIcon /></button>
                    </div>
                </div>

                {/* Detail — tampil hanya saat dipilih */}
                {isActive && (
                    <div className="px-2 pb-2.5 space-y-2 border-t border-slate-100 pt-2" onClick={e => e.stopPropagation()}>

                        {/* ── LANGKAH 1: Gambar Baris di Canvas ───────────── */}
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                            <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] flex-shrink-0 ${anchorDone ? "bg-amber-500" : "bg-amber-300"}`}>1</span>
                            Tandai Baris Ini di Canvas
                        </div>
                        <div className="ml-6 rounded-lg border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
                            <p className="text-[9px] text-amber-800 leading-relaxed">
                                {isCategory
                                    ? "Kotaki seluruh baris ini (No + Deskripsi)."
                                    : isParent
                                        ? "Kotaki teks baris ini di kolom Deskripsi."
                                        : "Kotaki teks deskripsi baris ini di kolom Deskripsi."
                                }
                            </p>
                            <button
                                onClick={() => setDrawMode(drawMode === DRAW.NODE_ANCHOR ? DRAW.NONE : DRAW.NODE_ANCHOR)}
                                className={`w-full py-1.5 rounded-lg border text-[10px] font-bold transition ${
                                    drawMode === DRAW.NODE_ANCHOR
                                        ? "bg-amber-500 text-white border-amber-600"
                                        : anchorDone
                                            ? "bg-amber-100 border-amber-300 text-amber-800"
                                            : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"
                                }`}>
                                {drawMode === DRAW.NODE_ANCHOR
                                    ? "⬛ Klik & tarik di canvas…"
                                    : anchorDone
                                        ? "✓ Tergambar — klik untuk gambar ulang"
                                        : "📍 Klik, lalu gambar kotak di canvas"}
                            </button>
                        </div>

                        {/* Info untuk Parent Item */}
                        {isParent && anchorDone && (
                            <p className="ml-6 text-[9px] text-cyan-700 bg-cyan-50 px-2 py-1.5 rounded border border-cyan-100">
                                Klik "+Sub" di kanan untuk tambah baris sub di bawah ini.
                            </p>
                        )}

                        {/* ── LANGKAH 2: Nilai (hanya Item & Sub-Item) ────────── */}
                        {needsValues && (
                            <>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                                    <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] flex-shrink-0 ${valuesDone ? "bg-indigo-600" : "bg-indigo-300"}`}>3</span>
                                    Gambar Nilai — Sejajar Baris Anchor
                                </div>

                                {/* Nilai belum ada — tampilkan tombol Sinkron */}
                                {Object.keys(node.values || {}).length === 0 ? (
                                    <div className="ml-6 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-3 space-y-2">
                                        <p className="text-[9px] text-indigo-700">
                                            Belum ada kolom gambar. Tambah kolom di ② dulu, lalu klik Sinkron.
                                        </p>
                                        <button
                                            onClick={() => syncNodeValues(itemIdx, nodePath)}
                                            className="w-full py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition">
                                            🔄 Sinkron Nilai dari Kolom
                                        </button>
                                    </div>
                                ) : (
                                    <div className="ml-6 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[9px] text-indigo-700">
                                                Gambar kotak per kolom, <strong>sejajar</strong> dengan baris di atas.
                                            </p>
                                            <button
                                                onClick={() => syncNodeValues(itemIdx, nodePath)}
                                                className="text-[8px] text-indigo-500 hover:text-indigo-700 underline flex-shrink-0 ml-1"
                                                title="Perbarui jika kolom tabel berubah">
                                                🔄 Sinkron
                                            </button>
                                        </div>
                                        {Object.entries(node.values || {}).map(([vk, vd]) => (
                                            <div key={vk} className="bg-white rounded-lg border border-indigo-100 p-1.5 space-y-1">
                                                <div className="flex items-center gap-1.5 text-[10px]">
                                                    <span className={`font-mono font-bold w-20 truncate ${vd.box ? "text-emerald-700" : "text-indigo-800"}`}>
                                                        {vd.box ? "✓ " : ""}{vk}
                                                    </span>
                                                    <select value={vd.text_type || "printed"}
                                                        onChange={e => updateNode(itemIdx, nodePath, `values.${vk}.text_type`, e.target.value)}
                                                        className="flex-1 text-[9px] border border-slate-200 rounded bg-white focus:ring-0">
                                                        <option value="printed">Teks Cetak</option>
                                                        <option value="handwritten">Tulisan Tangan</option>
                                                    </select>
                                                    <label className="flex items-center gap-0.5 text-slate-500 text-[9px] whitespace-nowrap">
                                                        <input type="checkbox" checked={vd.multi_line || false}
                                                            onChange={e => updateNode(itemIdx, nodePath, `values.${vk}.multi_line`, e.target.checked)}
                                                            className="w-3 h-3" />Multi
                                                    </label>
                                                </div>
                                                <button
                                                    onClick={() => { setActiveValueKey(vk); setDrawMode(drawMode === DRAW.NODE_VALUE && activeValueKey === vk ? DRAW.NONE : DRAW.NODE_VALUE); }}
                                                    className={`w-full py-1 rounded border text-[9px] font-bold transition ${
                                                        drawMode === DRAW.NODE_VALUE && activeValueKey === vk
                                                            ? "bg-indigo-600 text-white border-indigo-700"
                                                            : vd.box
                                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                                    }`}>
                                                    {drawMode === DRAW.NODE_VALUE && activeValueKey === vk
                                                        ? `⬛ Gambar kotak "${vk}" di canvas…`
                                                        : vd.box
                                                            ? `✓ ${vk} — klik untuk gambar ulang`
                                                            : `📦 Gambar kotak kolom "${vk}"`}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Children rekursif */}
            {(node.children || []).map((child, ci) => (
                <NodePanel key={ci} node={child} nodePath={[...nodePath, ci]} itemIdx={itemIdx}
                    activeNodePath={activeNodePath} activeValueKey={activeValueKey} drawMode={drawMode}
                    setActiveNodePath={setActiveNodePath} setActiveValueKey={setActiveValueKey}
                    setDrawMode={setDrawMode} updateNode={updateNode} removeNode={removeNode}
                    addChildNode={addChildNode} syncNodeValues={syncNodeValues} depth={depth + 1} />
            ))}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR: PANEL FIELD BIASA
// ══════════════════════════════════════════════════════════════
function FieldPanel({ item, idx, isActive, drawMode, activeTargetIdx,
    setActiveIdx, setDrawMode, setActiveTargetIdx,
    updateItem, removeItem, addTarget, removeTarget, updateTarget }) {

    return (
        <div className={`rounded-xl border transition cursor-pointer ${isActive ? "border-indigo-300 bg-white shadow-sm ring-1 ring-indigo-400/20" : "border-slate-100 hover:border-slate-200 bg-slate-50/50"}`}
            onClick={() => { setActiveIdx(idx); setDrawMode(DRAW.NONE); }}>
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><FieldIcon />FIELD</span>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">{item.field_name || "Field Baru"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-mono">{item.json_section}/{item.field_key || "..."}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                        className="text-slate-300 hover:text-red-500 p-1 rounded"><TrashIcon /></button>
                </div>
            </div>

            {isActive && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
                    {/* Nama Field */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500">Nama Field</label>
                            <input type="text" value={item.field_name}
                                onChange={e => updateItem(idx, "field_name", e.target.value)}
                                className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 flex justify-between">
                                JSON Key
                                <button onClick={() => updateItem(idx, "is_custom_key", !item.is_custom_key)} className="text-[9px] text-indigo-500">
                                    {item.is_custom_key ? "Auto" : "Edit"}
                                </button>
                            </label>
                            <input type="text" value={item.field_key}
                                disabled={!item.is_custom_key}
                                onChange={e => updateItem(idx, "field_key", e.target.value)}
                                className={`w-full text-xs rounded-lg p-1.5 border border-slate-200 ${!item.is_custom_key ? "bg-slate-50 text-slate-400" : "text-indigo-600 font-mono"}`} />
                        </div>
                    </div>

                    {/* Seksi JSON */}
                    <div>
                        <label className="text-[10px] text-slate-500">Bagian JSON Output</label>
                        <select value={item.json_section}
                            onChange={e => updateItem(idx, "json_section", e.target.value)}
                            className="w-full text-xs rounded-lg p-1.5 border border-slate-200">
                            {JSON_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>

                    {/* Anchor */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-500">Kata Kunci Anchor</label>
                            <button
                                onClick={() => setDrawMode(drawMode === DRAW.ANCHOR ? DRAW.NONE : DRAW.ANCHOR)}
                                className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.ANCHOR ? "bg-amber-500 text-white border-amber-600" : item.anchor_box ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                                {item.anchor_box ? "✓ Gambar Ulang" : "Gambar Box"}
                            </button>
                        </div>
                        <input type="text" value={item.field_anchor}
                            onChange={e => updateItem(idx, "field_anchor", e.target.value)}
                            placeholder="ex: Location, No. Dok…"
                            className="w-full text-xs rounded-lg p-1.5 border border-slate-200" />
                        <p className="text-[9px] text-slate-400 mt-1">💡 Teks label yang tercetak di formulir, digunakan sebagai titik acuan posisi.</p>
                    </div>

                    {/* Targets */}
                    <div className="border-t border-slate-100 pt-2">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Area Nilai</span>
                            <button onClick={() => addTarget(idx)}
                                className="bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded hover:bg-indigo-700">+ Nilai</button>
                        </div>
                        {(item.targets || []).length === 0 && (
                            <p className="text-[9px] text-slate-400 italic">Klik "+ Nilai" lalu gambar kotak area isian di canvas.</p>
                        )}
                        {(item.targets || []).map((t, ti) => (
                            <div key={ti} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100 mb-1">
                                <input type="text" value={t.label}
                                    onChange={e => updateTarget(idx, ti, "label", e.target.value)}
                                    className="flex-1 text-[10px] p-0 border-none bg-transparent focus:ring-0 font-medium"
                                    placeholder="result…" />
                                <select value={t.text_type || "printed"}
                                    onChange={e => updateTarget(idx, ti, "text_type", e.target.value)}
                                    className="w-16 text-[9px] border-none bg-slate-200/60 rounded p-0 focus:ring-0">
                                    <option value="printed">Cetak</option>
                                    <option value="handwritten">Tulis</option>
                                </select>
                                <button
                                    onClick={() => { setActiveTargetIdx(ti); setDrawMode(drawMode === DRAW.TARGET && activeTargetIdx === ti ? DRAW.NONE : DRAW.TARGET); }}
                                    className={`p-1 rounded transition ${drawMode === DRAW.TARGET && activeTargetIdx === ti ? "bg-indigo-600 text-white" : t.box ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-300 border"}`}
                                    title="Gambar kotak"><BoxIcon /></button>
                                <button onClick={() => removeTarget(idx, ti)} className="text-slate-200 hover:text-red-400"><TrashIcon /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR: PANEL TABEL
// ══════════════════════════════════════════════════════════════
function TablePanel({ item, idx, isActive, drawMode, activeColumnIdx, activeNodePath, activeValueKey,
    setActiveIdx, setDrawMode, setActiveColumnIdx, setActiveNodePath, setActiveValueKey,
    updateItem, removeItem, addColumn, removeColumn, updateColumn,
    addRootNode, updateNode, removeNode, addChildNode, syncNodeValues }) {

    const hasArea    = !!item.table_area;
    const hasCols    = (item.columns || []).length > 0;
    const isThisNode = (path) => activeNodePath && activeNodePath.itemIdx === idx && JSON.stringify(activeNodePath.path) === JSON.stringify(path);

    return (
        <div className={`rounded-xl border transition cursor-pointer ${isActive ? "border-orange-300 bg-white shadow-sm" : "border-slate-100 hover:border-orange-200 bg-orange-50/20"}`}
            onClick={() => { setActiveIdx(idx); setDrawMode(DRAW.NONE); }}>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><TableIcon />TABEL</span>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">{item.table_name || "Tabel Baru"}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                    className="text-slate-300 hover:text-red-500 p-1 rounded"><TrashIcon /></button>
            </div>

            {isActive && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
                    {/* Nama & Key */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500">Nama Tabel</label>
                            <input type="text" value={item.table_name || ""}
                                onChange={e => updateItem(idx, "table_name", e.target.value)}
                                className="w-full text-xs rounded-lg p-1.5 border border-slate-200" placeholder="ex: Checklist" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500">JSON Key</label>
                            <input type="text" value={item.json_key || ""}
                                onChange={e => updateItem(idx, "json_key", e.target.value)}
                                className="w-full text-xs rounded-lg p-1.5 border border-slate-200 font-mono text-indigo-600" placeholder="checklist" />
                        </div>
                    </div>

                    {/* FASE 1: Area Tabel */}
                    <div className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/60">
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase">① Gambar Area Tabel</p>
                            <button
                                onClick={() => setDrawMode(drawMode === DRAW.TABLE_AREA ? DRAW.NONE : DRAW.TABLE_AREA)}
                                className={`text-[9px] px-2 py-0.5 rounded border font-bold transition ${drawMode === DRAW.TABLE_AREA ? "bg-orange-500 text-white border-orange-600" : item.table_area ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                                {item.table_area ? "✓ Gambar Ulang" : "Gambar"}
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-400">Gambar satu kotak besar yang mencakup seluruh area tabel dari baris pertama hingga terakhir.</p>
                        {item.table_area && <p className="text-[9px] text-emerald-600 mt-1">✓ x:{item.table_area.x} y:{item.table_area.y}</p>}
                    </div>

                    {/* FASE 2: Kolom */}
                    {hasArea && (
                        <div className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/60">
                            <div className="flex justify-between items-center mb-1.5">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">② Definisi Kolom</p>
                                <button
                                    onClick={() => { setActiveColumnIdx((item.columns || []).length); addColumn(idx); setDrawMode(DRAW.COLUMN); }}
                                    className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700">+ Kolom</button>
                            </div>
                            <p className="text-[9px] text-slate-400 mb-2">Gambar kotak vertikal yang memanjang ke bawah untuk setiap kolom (No, Deskripsi, Hasil, Standard, Status).</p>
                            {(item.columns || []).length === 0 && <p className="text-[9px] text-slate-400 italic">Belum ada kolom.</p>}
                            <div className="space-y-1">
                                {(item.columns || []).map((col, ci) => (
                                    <div key={ci} className={`flex items-center gap-2 p-1.5 rounded border text-[10px] transition ${activeColumnIdx === ci && isActive ? "bg-green-50 border-green-300" : "bg-white border-slate-100"}`}
                                        onClick={(e) => { e.stopPropagation(); setActiveColumnIdx(ci); }}>
                                        <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${col.box ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                                            {ci + 1}
                                        </span>
                                        <span className="flex-1 font-mono text-slate-600 text-[9px]">
                                            {col.key || `kolom_${ci + 1}`}
                                            {col.box && <span className="ml-1 text-emerald-600">✓</span>}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setActiveColumnIdx(ci); setDrawMode(DRAW.COLUMN); }}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition ${drawMode === DRAW.COLUMN && activeColumnIdx === ci ? "bg-green-600 text-white border-green-700" : col.box ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-400 border-slate-200 hover:border-green-300"}`}>
                                            {col.box ? "✓ Gambar Ulang" : "🟩 Gambar"}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeColumn(idx, ci); }} className="text-slate-300 hover:text-red-400"><TrashIcon /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* FASE 3: Node */}
                    {hasCols && (
                        <div className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/60">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">③ Isi Data Tabel</p>
                                <button onClick={() => addRootNode(idx, NODE.CATEGORY)}
                                    className="text-[9px] bg-violet-600 text-white px-2 py-0.5 rounded hover:bg-violet-700">+ Kategori</button>
                            </div>
                            <p className="text-[9px] text-slate-400 mb-2">Tambah Kategori (ex: "Visual Check"), lalu tambah Item atau Parent Item di dalamnya.</p>
                            {(item.nodes || []).length === 0 && <p className="text-[9px] text-slate-400 italic">Belum ada data.</p>}
                            {(item.nodes || []).map((node, ni) => (
                                <NodePanel key={ni} node={node} nodePath={[ni]} itemIdx={idx}
                                    activeNodePath={activeNodePath} activeValueKey={activeValueKey}
                                    drawMode={drawMode}
                                    setActiveNodePath={setActiveNodePath}
                                    setActiveValueKey={setActiveValueKey}
                                    setDrawMode={setDrawMode}
                                    updateNode={updateNode} removeNode={removeNode} addChildNode={addChildNode}
                                    syncNodeValues={syncNodeValues} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function MasterTemplateEditor({ editingTemplate = null }) {
    const isEdit = !!editingTemplate;

    // ── State Umum ────────────────────────────────────────────
    const [imageUrl,   setImageUrl]   = useState(editingTemplate?.master_file_url ?? null);
    const [pdfPath,    setPdfPath]    = useState(editingTemplate?.master_file_path ?? null);
    const [imagePath,  setImagePath]  = useState(null); // path PNG yang tersimpan lokal
    const [pdfFile,    setPdfFile]    = useState(null);
    const [converting, setConverting] = useState(false);
    const [typeName,   setTypeName]   = useState(editingTemplate?.type_name ?? "");
    const [saving,     setSaving]     = useState(false);
    const [saveMsg,    setSaveMsg]    = useState(null);
    const [zoom,       setZoom]       = useState(1);
    const fileInputRef = useRef(null);

    // ── State Navigasi ────────────────────────────────────────
    const [drawMode,        setDrawMode]        = useState(DRAW.NONE);
    const [activeIdx,       setActiveIdx]       = useState(null);   // Index item yang dipilih
    const [activeTargetIdx, setActiveTargetIdx] = useState(null);   // Index target field biasa
    const [activeColumnIdx, setActiveColumnIdx] = useState(null);   // Index kolom tabel
    const [activeNodePath,  setActiveNodePath]  = useState(null);   // { path: [...], itemIdx }
    const [activeValueKey,  setActiveValueKey]  = useState(null);   // Key nilai node

    // ── State Data Utama (FLAT) ───────────────────────────────
    // Setiap elemen adalah "field" atau "table" — tanpa grup
    const [items, setItems] = useState(() => {
        if (!editingTemplate?.mapping_config) return [];
        // Convert dari format lama (groups) ke format baru (items) jika perlu
        const config = editingTemplate.mapping_config;
        if (Array.isArray(config) && config[0]?.item_type) return config; // sudah format baru
        // Konversi dari format lama (groups)
        const converted = [];
        (config || []).forEach(group => {
            if (group.group_type === "fixed") {
                (group.fields || []).forEach(field => {
                    converted.push({
                        item_type: "field",
                        field_name: field.field_name || "",
                        field_key: field.field_key || "",
                        json_section: group.group_key || "header",
                        field_anchor: field.field_anchor || "",
                        anchor_box: field.anchor_box || null,
                        targets: field.targets || [],
                        is_custom_key: false,
                    });
                });
            } else if (group.group_type === "dynamic_table") {
                converted.push({
                    item_type: "table",
                    table_name: group.group_anchor || "",
                    json_key: group.group_key || "checklist",
                    table_area: group.table_area || null,
                    columns: group.columns || [],
                    nodes: group.nodes || [],
                });
            }
        });
        return converted;
    });

    // ══════════════════════════════════════════════════════════
    // UPLOAD PDF
    // ══════════════════════════════════════════════════════════
    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== "application/pdf") return;
        setPdfFile(file);
        setConverting(true);
        const formData = new FormData();
        formData.append("pdf", file);
        try {
            const { data } = await axios.post("/internal-api/template/convert-pdf", formData, { headers: { "Accept": "application/json" } });
            if (data.image_url) {
                setImageUrl(data.image_url);
                setPdfPath(data.pdf_path);
                setImagePath(data.image_path || null);
            } else alert("PDF terkirim tapi preview tidak tersedia.\n" + JSON.stringify(data));
        } catch (err) {
            alert("Gagal memproses PDF:\n" + (err.response?.data?.error || err.message));
        } finally { setConverting(false); }
    };

    // ══════════════════════════════════════════════════════════
    // HANDLER BOX DRAWN
    // ══════════════════════════════════════════════════════════
    const handleBoxDrawn = (box, mode) => {
        if (activeIdx === null) return;
        setItems(prev => {
            const updated = deepClone(prev);
            const item = updated[activeIdx];

            if (mode === DRAW.ANCHOR) {
                item.anchor_box = box;
                setDrawMode(DRAW.NONE);
            } else if (mode === DRAW.TARGET && activeTargetIdx !== null) {
                if (!item.targets) item.targets = [];
                if (item.targets[activeTargetIdx]) {
                    item.targets[activeTargetIdx] = { ...item.targets[activeTargetIdx], box, width: box.width, height: box.height };
                }
                setDrawMode(DRAW.NONE);
                setActiveTargetIdx(null);
            } else if (mode === DRAW.TABLE_AREA) {
                item.table_area = box;
                setDrawMode(DRAW.NONE);
            } else if (mode === DRAW.COLUMN && activeColumnIdx !== null) {
                if (!item.columns) item.columns = [];
                if (!item.columns[activeColumnIdx]) item.columns[activeColumnIdx] = { label: "", key: "", text_type: "printed" };
                item.columns[activeColumnIdx].box = box;
                setDrawMode(DRAW.NONE);
            } else if (mode === DRAW.NODE_ANCHOR && activeNodePath && activeNodePath.itemIdx === activeIdx) {
                item.nodes = setNodeAtPath(item.nodes, activeNodePath.path, n => {
                    const updated = { ...n, anchor_box: box };
                    // Auto-detect value columns: kolom yang ada di KANAN anchor box
                    const needsVals = n.node_type === NODE.ITEM || n.node_type === NODE.SUB_ITEM;
                    if (needsVals) {
                        const rightKeys = getValueKeysFromColumns(item.columns || [], box);
                        if (rightKeys.length > 0) {
                            const existingValues = n.values || {};
                            const newValues = {};
                            rightKeys.forEach(k => {
                                newValues[k] = existingValues[k] || { text_type: "handwritten", box: null, multi_line: false };
                            });
                            updated.values = newValues;
                        }
                    }
                    return updated;
                });
                setDrawMode(DRAW.NONE);
            } else if (mode === DRAW.NODE_VALUE && activeNodePath && activeNodePath.itemIdx === activeIdx && activeValueKey) {
                item.nodes = setNodeAtPath(item.nodes, activeNodePath.path, n => {
                    const values = deepClone(n.values || {});
                    if (!values[activeValueKey]) values[activeValueKey] = { text_type: "handwritten", multi_line: false };
                    values[activeValueKey].box = box;
                    return { ...n, values };
                });
                setDrawMode(DRAW.NONE);
                setActiveValueKey(null);
            }
            return updated;
        });
    };

    // ══════════════════════════════════════════════════════════
    // CRUD ITEMS
    // ══════════════════════════════════════════════════════════
    const addField = () => {
        const newItem = {
            item_type: "field", field_name: "Field Baru", field_key: "field_baru",
            json_section: "header", field_anchor: "", anchor_box: null, targets: [], is_custom_key: false,
        };
        setItems(prev => [...prev, newItem]);
        setActiveIdx(items.length);
        setDrawMode(DRAW.NONE);
    };

    const addTable = () => {
        const newItem = {
            item_type: "table", table_name: "Tabel Baru", json_key: "checklist",
            table_area: null, columns: [], nodes: [],
        };
        setItems(prev => [...prev, newItem]);
        setActiveIdx(items.length);
        setDrawMode(DRAW.NONE);
    };

    const removeItem = (idx) => {
        if (!confirm("Hapus item ini?")) return;
        setItems(prev => prev.filter((_, i) => i !== idx));
        setActiveIdx(null);
    };

    const updateItem = (idx, key, val) => {
        setItems(prev => {
            const updated = deepClone(prev);
            updated[idx][key] = val;
            if (key === "field_name" && !updated[idx].is_custom_key) {
                updated[idx].field_key = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            }
            return updated;
        });
    };

    // ── Targets (Field Biasa) ─────────────────────────────────
    const addTarget = (idx) => {
        setItems(prev => {
            const updated = deepClone(prev);
            const targets = updated[idx].targets || [];
            targets.push({ label: `nilai_${targets.length + 1}`, key: `nilai_${targets.length + 1}`, text_type: "handwritten", box: null });
            updated[idx].targets = targets;
            return updated;
        });
    };
    const removeTarget = (idx, ti) => {
        setItems(prev => { const u = deepClone(prev); u[idx].targets.splice(ti, 1); return u; });
    };
    const updateTarget = (idx, ti, key, val) => {
        setItems(prev => {
            const updated = deepClone(prev);
            updated[idx].targets[ti][key] = val;
            if (key === "label") updated[idx].targets[ti].key = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return updated;
        });
    };

    // ── Columns (Tabel) ───────────────────────────────────────
    const addColumn = (idx) => {
        setItems(prev => {
            const u = deepClone(prev);
            if (!u[idx].columns) u[idx].columns = [];
            const n = u[idx].columns.length + 1;
            u[idx].columns.push({ label: `Kolom ${n}`, key: `kolom_${n}`, text_type: "printed", box: null });
            return u;
        });
    };
    const removeColumn = (idx, ci) => {
        setItems(prev => { const u = deepClone(prev); u[idx].columns.splice(ci, 1); return u; });
        setActiveColumnIdx(null);
    };
    const updateColumn = (idx, ci, key, val) => {
        setItems(prev => {
            const u = deepClone(prev);
            u[idx].columns[ci][key] = val;
            if (key === "label" && !u[idx].columns[ci].is_custom_key) u[idx].columns[ci].key = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return u;
        });
    };

    // ── Nodes (Tabel) ─────────────────────────────────────────
    const buildDefaultNode = (nodeType, valueKeys) => {
        const values = {};
        valueKeys.forEach(k => { values[k] = { text_type: "handwritten", box: null, multi_line: false }; });
        return {
            node_type: nodeType, label: "", anchor_keyword: "", anchor_box: null,
            ...(nodeType === NODE.CATEGORY && { no: 1, children: [] }),
            ...(nodeType === NODE.ITEM && { sub: "", values }),
            ...(nodeType === NODE.PARENT_ITEM && { sub: "", children: [] }),
            ...(nodeType === NODE.SUB_ITEM && { values }),
        };
    };

    // Helper: deteksi kolom yang berada di KANAN anchor box (berdasarkan koordinat X)
    // Ini memungkinkan sistem auto-skip kolom No. dan Descriptions
    const getValueKeysFromColumns = (cols, anchorBox) => {
        if (!anchorBox || cols.every(c => !c.box)) {
            // Fallback: jika belum ada kolom yang digambar, return semua kolom
            return cols.map((c, ci) => c.key || `kolom_${ci + 1}`);
        }
        const anchorRight = anchorBox.x + anchorBox.width;
        return cols
            .map((c, ci) => ({ key: c.key || `kolom_${ci + 1}`, box: c.box, ci }))
            .filter(({ box }) => box && box.x >= anchorRight - 25) // 25px tolerance
            .map(({ key }) => key);
    };

    const getValueKeys = (idx) => {
        // Semua kolom menjadi value keys — admin cukup gambar
        return (items[idx]?.columns || []).map((c, ci) => c.key || `kolom_${ci + 1}`);
    };

    const addRootNode = (idx, nodeType) => {
        // Start with empty values — akan diisi otomatis saat anchor digambar
        setItems(prev => { const u = deepClone(prev); if (!u[idx].nodes) u[idx].nodes = []; u[idx].nodes.push(buildDefaultNode(nodeType, [])); return u; });
        setActiveNodePath({ path: [items[idx]?.nodes?.length ?? 0], itemIdx: idx });
    };

    const addChildNode = (idx, parentPath, nodeType) => {
        // Start with empty values — akan diisi otomatis saat anchor digambar
        setItems(prev => {
            const u = deepClone(prev);
            u[idx].nodes = setNodeAtPath(u[idx].nodes, parentPath, parent => {
                const children = deepClone(parent.children || []);
                children.push(buildDefaultNode(nodeType, []));
                return { ...parent, children };
            });
            return u;
        });
        const parentNode = getNodeAtPath(items[idx]?.nodes, parentPath);
        setActiveNodePath({ path: [...parentPath, (parentNode?.children || []).length], itemIdx: idx });
    };

    const syncNodeValues = (idx, nodePath) => {
        setItems(prev => {
            const u = deepClone(prev);
            u[idx].nodes = setNodeAtPath(u[idx].nodes, nodePath, node => {
                const existing = node.values || {};
                const cols = u[idx].columns || [];
                // Gunakan anchor_box untuk deteksi kolom kanan jika tersedia
                const keys = node.anchor_box
                    ? getValueKeysFromColumns(cols, node.anchor_box)
                    : cols.map((c, ci) => c.key || `kolom_${ci + 1}`);
                if (keys.length === 0) {
                    alert("Gambar anchor dulu, lalu klik Sinkron. Atau pastikan kolom sudah digambar di ② Definisi Kolom.");
                    return node;
                }
                const newValues = {};
                keys.forEach(k => {
                    newValues[k] = existing[k] || { text_type: "handwritten", box: null, multi_line: false };
                });
                return { ...node, values: newValues };
            });
            return u;
        });
    };

    const removeNode = (idx, nodePath) => {
        if (!confirm("Hapus node ini?")) return;
        setItems(prev => {
            const u = deepClone(prev);
            if (nodePath.length === 1) {
                u[idx].nodes.splice(nodePath[0], 1);
            } else {
                const parentPath = nodePath.slice(0, -1);
                const lastIdx = nodePath[nodePath.length - 1];
                u[idx].nodes = setNodeAtPath(u[idx].nodes, parentPath, parent => {
                    const children = deepClone(parent.children || []);
                    children.splice(lastIdx, 1);
                    return { ...parent, children };
                });
            }
            return u;
        });
        setActiveNodePath(null);
    };

    const updateNode = (idx, nodePath, key, val) => {
        setItems(prev => {
            const u = deepClone(prev);
            u[idx].nodes = setNodeAtPath(u[idx].nodes, nodePath, node => {
                if (key.includes(".")) {
                    const parts = key.split(".");
                    let ref = node;
                    for (let i = 0; i < parts.length - 1; i++) { if (!ref[parts[i]]) ref[parts[i]] = {}; ref = ref[parts[i]]; }
                    ref[parts[parts.length - 1]] = val;
                } else { node[key] = val; }
                return { ...node };
            });
            return u;
        });
    };

    // ══════════════════════════════════════════════════════════
    // SAVE — Konversi flat items → format groups untuk engine
    // ══════════════════════════════════════════════════════════
    const handleSave = async () => {
        if (!typeName.trim()) return alert("Nama template wajib diisi.");
        if (!pdfPath)         return alert("Upload PDF master terlebih dahulu.");
        if (items.length === 0) return alert("Tambahkan minimal satu field atau tabel.");

        // Konversi items flat → groups untuk backend & engine
        const fieldsBySectionMap = {};
        const tableGroups = [];

        items.forEach(item => {
            if (item.item_type === "field") {
                const sec = item.json_section || "header";
                if (!fieldsBySectionMap[sec]) fieldsBySectionMap[sec] = [];
                // Hitung offset targets
                const targets = (item.targets || []).map(t => {
                    if (item.anchor_box && t.box) {
                        return { ...t, offset_x: t.box.x - item.anchor_box.x, offset_y: t.box.y - item.anchor_box.y, width: t.box.width, height: t.box.height };
                    }
                    return t;
                });
                fieldsBySectionMap[sec].push({
                    field_name: item.field_name, field_key: item.field_key,
                    field_anchor: item.field_anchor, anchor_box: item.anchor_box, targets,
                });
            } else if (item.item_type === "table") {
                tableGroups.push({
                    group_type: "dynamic_table",
                    group_anchor: item.table_name,
                    group_key: item.json_key || "checklist",
                    table_area: item.table_area,
                    columns: item.columns,
                    nodes: item.nodes,
                });
            }
        });

        const fixedGroups = Object.entries(fieldsBySectionMap).map(([sec, fields]) => ({
            group_type: "fixed", group_anchor: sec, group_key: sec, fields,
        }));

        const groups = [...fixedGroups, ...tableGroups];

        setSaving(true); setSaveMsg(null);
        try {
            await axios.post("/internal-api/template/save", {
                template_name: typeName.toLowerCase().replace(/\s+/g, "_"),
                type_name: typeName, pdf_path: pdfPath, groups,
                mapping_config: items,
                ...(imagePath && { image_path: imagePath }),
                ...(isEdit && { template_id: editingTemplate.id }),
            });
            setSaveMsg("success");
            setTimeout(() => router.visit("/master-template"), 1500);
        } catch (err) {
            console.error("Save error:", err.response?.data ?? err);
            setSaveMsg("error");
        } finally { setSaving(false); }
    };

    const drawModeLabel = {
        [DRAW.ANCHOR]:      "Gambar Kotak ANCHOR (kuning) — klik & tarik di canvas",
        [DRAW.TARGET]:      "Gambar Kotak NILAI (biru) — klik & tarik di canvas",
        [DRAW.TABLE_AREA]:  "Gambar Area TABEL (oranye) — kotak besar seluruh tabel",
        [DRAW.COLUMN]:      "Gambar Kotak KOLOM (hijau) — kotak vertikal satu kolom",
        [DRAW.NODE_ANCHOR]: "Gambar Kotak ANCHOR ROW (kuning) — teks label baris ini",
        [DRAW.NODE_VALUE]:  `Gambar Kotak NILAI "${activeValueKey}" (biru)`,
    }[drawMode];

    return (
        <AuthenticatedLayout header={isEdit ? "Edit Template" : "Buat Template"}>
            <Head title={isEdit ? "Edit Template" : "Buat Template"} />

            <div className="flex flex-col gap-4">
                {/* Topbar */}
                <div className="flex items-center justify-between">
                    <Link href="/master-template" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition">
                        <BackIcon /> Kembali
                    </Link>
                    <button onClick={handleSave} disabled={saving || !typeName.trim() || !pdfPath}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                            saveMsg === "success" ? "bg-emerald-500 text-white" :
                            saving || !typeName.trim() || !pdfPath ? "bg-slate-200 text-slate-400 cursor-not-allowed" :
                            "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90 shadow-sm"}`}>
                        <SaveIcon />
                        {saving ? "Menyimpan…" : saveMsg === "success" ? "✓ Tersimpan!" : "Simpan Template"}
                    </button>
                </div>

                {saveMsg === "error" && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                        Gagal menyimpan. Cek koneksi ke server.
                    </div>
                )}

                <div className="flex gap-5 items-start">
                    {/* ── CANVAS ── */}
                    <div className="flex-1 min-w-0 flex flex-col gap-3">

                        {/* Upload & Nama Template */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
                            <input type="text" value={typeName} onChange={e => setTypeName(e.target.value)}
                                placeholder="Nama Template (ex: Formulir PM UPS)"
                                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition" />
                            {!isEdit ? (
                                // Mode create: tampilkan tombol upload PDF
                                <>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={converting}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-60 whitespace-nowrap">
                                        <UploadIcon />{converting ? "Memproses…" : "Upload PDF"}
                                    </button>
                                    <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                                </>
                            ) : (
                                // Mode edit: tampilkan info PDF yang sudah ada
                                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
                                    <span className="text-emerald-600 font-medium">✓ PDF tersimpan</span>
                                    {pdfPath && <span className="text-xs text-slate-400 truncate max-w-[140px]" title={pdfPath}>{pdfPath.split('/').pop()}</span>}
                                </div>
                            )}
                        </div>

                        {/* Mode Gambar Aktif */}
                        {drawMode !== DRAW.NONE && (
                            <div className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 bg-indigo-600 text-white shadow-sm">
                                <BoxIcon />
                                <span className="flex-1">{drawModeLabel}</span>
                                <button onClick={() => setDrawMode(DRAW.NONE)} className="text-white/70 hover:text-white text-xs ml-auto">✕ Batal</button>
                            </div>
                        )}

                        {/* Zoom */}
                        {imageUrl && (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                <span className="text-xs text-slate-500 mr-1">Zoom:</span>
                                <button onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600">−</button>
                                <span className="text-xs font-semibold text-slate-600 w-10 text-center">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(3, parseFloat((z + 0.25).toFixed(2))))} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600">+</button>
                            </div>
                        )}

                        {/* Canvas */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
                            <CanvasEditor imageUrl={imageUrl} items={items} activeIdx={activeIdx}
                                drawMode={drawMode} zoom={zoom} onBoxDrawn={handleBoxDrawn} />
                        </div>
                    </div>

                    {/* ── SIDEBAR ── */}
                    <div className="w-80 flex-shrink-0 flex flex-col gap-3 sticky top-0">

                        {/* Tombol Tambah */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Tambah Elemen</p>
                            <div className="flex gap-2">
                                <button onClick={addField}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                                    <FieldIcon /><PlusIcon /> Field
                                </button>
                                <button onClick={addTable}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 transition border border-orange-200">
                                    <TableIcon /><PlusIcon /> Tabel
                                </button>
                            </div>
                        </div>

                        {/* Daftar Items */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <div className="px-4 py-2.5 border-b border-slate-100">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                    Daftar Elemen <span className="font-normal text-slate-400">({items.length} item)</span>
                                </p>
                            </div>
                            <div className="max-h-[72vh] overflow-y-auto p-2 pb-20 space-y-1.5">
                                {items.length === 0 && (
                                    <div className="text-center py-10 text-slate-400">
                                        <p className="text-sm">Belum ada elemen.</p>
                                        <p className="text-xs mt-1">Klik "+ Field" atau "+ Tabel" di atas.</p>
                                    </div>
                                )}
                                {items.map((item, idx) => {
                                    if (item.item_type === "field") {
                                        return (
                                            <FieldPanel key={idx} item={item} idx={idx} isActive={activeIdx === idx}
                                                drawMode={drawMode} activeTargetIdx={activeTargetIdx}
                                                setActiveIdx={setActiveIdx} setDrawMode={setDrawMode}
                                                setActiveTargetIdx={setActiveTargetIdx}
                                                updateItem={updateItem} removeItem={removeItem}
                                                addTarget={addTarget} removeTarget={removeTarget} updateTarget={updateTarget} />
                                        );
                                    }
                                    if (item.item_type === "table") {
                                        return (
                                            <TablePanel key={idx} item={item} idx={idx} isActive={activeIdx === idx}
                                                drawMode={drawMode} activeColumnIdx={idx === activeIdx ? activeColumnIdx : null}
                                                activeNodePath={activeIdx === idx ? activeNodePath : null}
                                                activeValueKey={activeValueKey}
                                                setActiveIdx={setActiveIdx} setDrawMode={setDrawMode}
                                                setActiveColumnIdx={setActiveColumnIdx}
                                                setActiveNodePath={setActiveNodePath}
                                                setActiveValueKey={setActiveValueKey}
                                                updateItem={updateItem} removeItem={removeItem}
                                                addColumn={addColumn} removeColumn={removeColumn} updateColumn={updateColumn}
                                                addRootNode={addRootNode} updateNode={updateNode}
                                                removeNode={removeNode} addChildNode={addChildNode}
                                                syncNodeValues={syncNodeValues} />
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}