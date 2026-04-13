import axios from "axios";
import { useState, useRef, useCallback, useEffect } from "react";
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
const ChevronDownIcon = ({ open }) => (
    <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

// ── Mode gambar ────────────────────────────────────────────────
const MODE = { NONE: "none", ANCHOR: "anchor", TARGET_RESULT: "target_result", TARGET_STATUS: "target_status" };

// ── Canvas Editor Component ────────────────────────────────────
function CanvasEditor({ imageUrl, groups, activeGroupIdx, activeFieldIdx, onBoxDrawn, drawMode, zoom = 1 }) {
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

    const onImageLoad = useCallback(() => { computeScale(); }, [computeScale]);

    useEffect(() => { computeScale(); }, [zoom, computeScale]);

    const getPos = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    const isReadyToDraw = drawMode !== MODE.NONE && activeGroupIdx !== null && activeFieldIdx !== null;

    const onMouseDown = (e) => {
        if (!isReadyToDraw) return;
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
            x: Math.round(Math.min(startPt.x, end.x)),
            y: Math.round(Math.min(startPt.y, end.y)),
            width: Math.round(Math.abs(end.x - startPt.x)),
            height: Math.round(Math.abs(end.y - startPt.y)),
        };
        if (box.width > 5 && box.height > 5) onBoxDrawn(box, drawMode);
        setDrawing(false);
        setStartPt(null);
        setCurPt(null);
    };

    // Kotak sementara saat drag
    const tempBox = drawing && startPt && curPt ? {
        left: Math.min(startPt.x, curPt.x) * scale,
        top: Math.min(startPt.y, curPt.y) * scale,
        width: Math.abs(curPt.x - startPt.x) * scale,
        height: Math.abs(curPt.y - startPt.y) * scale,
    } : null;

    let tempBorderColor = "";
    if (drawMode === MODE.ANCHOR) tempBorderColor = "border-amber-500 bg-amber-400/15";
    else if (drawMode === MODE.TARGET_RESULT) tempBorderColor = "border-emerald-500 bg-emerald-400/15";
    else if (drawMode === MODE.TARGET_STATUS) tempBorderColor = "border-indigo-500 bg-indigo-400/15";

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-auto">
            <div
                ref={containerRef}
                className="relative select-none"
                style={{
                    width: `${zoom * 100}%`,
                    minWidth: `${zoom * 100}%`,
                    cursor: isReadyToDraw ? "crosshair" : "default",
                }}
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
                        {groups.map((group, gi) =>
                            group.fields.map((field, fi) => {
                                const isActive = gi === activeGroupIdx && fi === activeFieldIdx;
                                return (
                                    <div key={`${gi}-${fi}`}>
                                        {field.anchor_box && (
                                            <div
                                                className={`absolute border-2 pointer-events-none ${isActive ? "border-amber-500 bg-amber-400/15 z-10" : "border-amber-400/50 bg-amber-400/5 z-0"}`}
                                                style={{ left: field.anchor_box.x * scale, top: field.anchor_box.y * scale, width: field.anchor_box.width * scale, height: field.anchor_box.height * scale }}
                                            >
                                                <span className="absolute -top-5 left-0 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
                                                    A · {field.field_name || "Field"}
                                                </span>
                                            </div>
                                        )}
                                        {field.targets?.result?.box && (
                                            <div
                                                className={`absolute border-2 pointer-events-none ${isActive ? "border-emerald-500 bg-emerald-400/15 z-10" : "border-emerald-400/50 bg-emerald-400/5 z-0"}`}
                                                style={{ left: field.targets.result.box.x * scale, top: field.targets.result.box.y * scale, width: field.targets.result.box.width * scale, height: field.targets.result.box.height * scale }}
                                            >
                                                <span className="absolute -top-5 left-0 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
                                                    R · {field.field_name}
                                                </span>
                                            </div>
                                        )}
                                        {field.targets?.status?.box && (
                                            <div
                                                className={`absolute border-2 pointer-events-none ${isActive ? "border-indigo-500 bg-indigo-400/15 z-10" : "border-indigo-400/50 bg-indigo-400/5 z-0"}`}
                                                style={{ left: field.targets.status.box.x * scale, top: field.targets.status.box.y * scale, width: field.targets.status.box.width * scale, height: field.targets.status.box.height * scale }}
                                            >
                                                <span className="absolute -top-5 left-0 bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
                                                    S · {field.field_name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}

                        {/* Kotak sementara saat drag */}
                        {tempBox && (
                            <div
                                className={`absolute border-2 pointer-events-none ${tempBorderColor}`}
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
        </div>
    );
}

// ── Halaman Create/Edit ────────────────────────────────────────
export default function MasterTemplateEditor({ editingTemplate = null }) {
    const isEdit = !!editingTemplate;

    const [imageUrl, setImageUrl] = useState(editingTemplate?.master_file_url ?? null);
    const [pdfPath, setPdfPath] = useState(editingTemplate?.master_file_path ?? null);
    const [pdfFile, setPdfFile] = useState(null);
    const [converting, setConverting] = useState(false);

    const [typeName, setTypeName] = useState(editingTemplate?.type_name ?? "");
    const [drawMode, setDrawMode] = useState(MODE.NONE);

    // Tree navigation
    const [activeGroupIdx, setActiveGroupIdx] = useState(0);
    const [activeFieldIdx, setActiveFieldIdx] = useState(null);

    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);
    const [zoom, setZoom] = useState(1);

    const [groups, setGroups] = useState(
        editingTemplate?.mapping_config ?? [
            {
                group_anchor: "Group 1",
                group_key: "group_1",
                expanded: true,
                fields: [
                    {
                        field_anchor: "",
                        field_key: "",
                        field_name: "Field 1",
                        row_type: "single",
                        row_span: 1,
                        take_from_row: "middle",
                        anchor_box: null,
                        targets: { result: null, status: null }
                    }
                ]
            }
        ]
    );

    const fileInputRef = useRef(null);

    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== "application/pdf") return;
        setPdfFile(file);
        setConverting(true);

        const formData = new FormData();
        formData.append("pdf", file);

        try {
            const { data } = await axios.post("/internal-api/template/convert-pdf", formData, {
                headers: { "Accept": "application/json" },
            });
            if (data.image_url) {
                setImageUrl(data.image_url);
                setPdfPath(data.pdf_path);
            } else {
                alert("PDF terkirim tapi preview tidak tersedia.\nResponse: " + JSON.stringify(data));
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.message || err.message;
            alert("Gagal memproses PDF:\n" + msg);
        } finally {
            setConverting(false);
        }
    };

    const handleBoxDrawn = (box, mode) => {
        if (activeGroupIdx === null || activeFieldIdx === null) return;
        setGroups((prev) => {
            const updated = JSON.parse(JSON.stringify(prev)); // Deep clone simple object
            const field = updated[activeGroupIdx].fields[activeFieldIdx];

            if (mode === MODE.ANCHOR) {
                field.anchor_box = box;
                setDrawMode(MODE.TARGET_RESULT); // Auto switch
            } else if (mode === MODE.TARGET_RESULT) {
                if (!field.targets) field.targets = {};
                field.targets.result = { box, offset_x: 0, offset_y: 0, width: box.width, height: box.height };
                setDrawMode(MODE.TARGET_STATUS); // Auto switch
            } else if (mode === MODE.TARGET_STATUS) {
                if (!field.targets) field.targets = {};
                field.targets.status = { box, offset_x: 0, offset_y: 0, width: box.width, height: box.height };
                setDrawMode(MODE.NONE); // Selesai
            }
            return updated;
        });
    };

    // CRUD Groups
    const addGroup = () => {
        setGroups(prev => [
            ...prev,
            {
                group_anchor: `Group ${prev.length + 1}`,
                group_key: `group_${prev.length + 1}`,
                expanded: true,
                fields: []
            }
        ]);
        setActiveGroupIdx(groups.length);
        setActiveFieldIdx(null);
        setDrawMode(MODE.NONE);
    };

    const removeGroup = (gi) => {
        if (!confirm("Hapus grup ini beserta isinya?")) return;
        setGroups(prev => prev.filter((_, i) => i !== gi));
        setActiveGroupIdx(null);
        setActiveFieldIdx(null);
    };

    const updateGroup = (gi, key, val) => {
        setGroups(prev => {
            const updated = [...prev];
            updated[gi] = { ...updated[gi], [key]: val };
            if (key === "group_anchor") {
                updated[gi].group_key = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            }
            return updated;
        });
    };

    const toggleGroup = (gi) => {
        setGroups(prev => {
            const updated = [...prev];
            updated[gi].expanded = !updated[gi].expanded;
            return updated;
        });
    };

    // CRUD Fields
    const addField = (gi) => {
        setGroups(prev => {
            const updated = [...prev];
            updated[gi].expanded = true;
            updated[gi].fields.push({
                field_anchor: "",
                field_key: "",
                field_name: `Field ${updated[gi].fields.length + 1}`,
                row_type: "single",
                row_span: 1,
                take_from_row: "middle",
                anchor_box: null,
                targets: { result: null, status: null }
            });
            return updated;
        });
        setActiveGroupIdx(gi);
        setActiveFieldIdx(groups[gi].fields.length);
        setDrawMode(MODE.NONE);
    };

    const removeField = (gi, fi) => {
        setGroups(prev => {
            const updated = JSON.parse(JSON.stringify(prev));
            updated[gi].fields.splice(fi, 1);
            return updated;
        });
        setActiveGroupIdx(gi);
        setActiveFieldIdx(null);
        setDrawMode(MODE.NONE);
    };

    const updateField = (gi, fi, key, val) => {
        setGroups(prev => {
            const updated = JSON.parse(JSON.stringify(prev));
            updated[gi].fields[fi][key] = val;
            if (key === "field_name") {
                updated[gi].fields[fi].field_key = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            }
            return updated;
        });
    };

    const handleSave = async () => {
        if (!typeName.trim()) return alert("Nama template wajib diisi.");
        if (!pdfPath) return alert("Upload PDF master terlebih dahulu.");

        // Compute offsets sebelum disimpan
        const computedGroups = groups.map(g => ({
            group_anchor: g.group_anchor,
            group_key: g.group_key,
            fields: g.fields.map(f => {
                const computedTargets = {};
                // Result Calc
                if (f.anchor_box && f.targets?.result?.box) {
                    computedTargets.result = {
                        box: f.targets.result.box, // tetapkan box agar bisa di-visualize saat diedit kelak
                        offset_x: f.targets.result.box.x - f.anchor_box.x,
                        offset_y: f.targets.result.box.y - f.anchor_box.y,
                        width: f.targets.result.box.width,
                        height: f.targets.result.box.height
                    };
                }
                // Status Calc
                if (f.anchor_box && f.targets?.status?.box) {
                    computedTargets.status = {
                        box: f.targets.status.box,
                        offset_x: f.targets.status.box.x - f.anchor_box.x,
                        offset_y: f.targets.status.box.y - f.anchor_box.y,
                        width: f.targets.status.box.width,
                        height: f.targets.status.box.height
                    };
                }

                return {
                    field_anchor: f.field_anchor,
                    field_key: f.field_key,
                    field_name: f.field_name,
                    row_type: f.row_type,
                    ...(f.row_type === "multi" ? { row_span: Number(f.row_span || 1), take_from_row: f.take_from_row || "middle" } : {}),
                    anchor_box: f.anchor_box,
                    targets: computedTargets
                };
            })
        }));

        setSaving(true);
        setSaveMsg(null);

        try {
            await axios.post("/internal-api/template/save", {
                template_name: typeName.toLowerCase().replace(/\s+/g, "_"),
                type_name: typeName,
                pdf_path: pdfPath,
                groups: computedGroups,
                ...(isEdit && { template_id: editingTemplate.id }),
            });

            setSaveMsg("success");
            setTimeout(() => router.visit("/master-template"), 1500);
        } catch (err) {
            console.error("Save error:", err.response?.data ?? err);
            setSaveMsg("error");
        } finally {
            setSaving(false);
        }
    };

    const activeField = (activeGroupIdx !== null && activeFieldIdx !== null && groups[activeGroupIdx]) 
        ? groups[activeGroupIdx].fields[activeFieldIdx] 
        : null;

    return (
        <AuthenticatedLayout header={isEdit ? "Edit Template" : "Buat Template"}>
            <Head title={isEdit ? "Edit Template" : "Buat Template"} />

            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <Link href="/master-template" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition">
                        <BackIcon /> Kembali ke daftar
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving || !typeName.trim() || !pdfPath || groups.length === 0}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${saveMsg === "success"
                                ? "bg-emerald-500 text-white"
                                : saving || !typeName.trim() || !pdfPath || groups.length === 0
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

                <div className="flex gap-5 items-start">
                    {/* PANEL KIRI: CANVAS */}
                    <div className="flex-1 min-w-0 flex flex-col gap-4">
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

                        {imageUrl && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex items-center gap-3 flex-wrap">
                                <p className="text-xs font-semibold text-slate-500">Mode Gambar:</p>
                                {[
                                    { mode: MODE.ANCHOR, label: "Anchor (A)", color: "amber" },
                                    { mode: MODE.TARGET_RESULT, label: "Target: Result (R)", color: "emerald" },
                                    { mode: MODE.TARGET_STATUS, label: "Target: Status (S)", color: "indigo" },
                                ].map(({ mode, label, color }) => {
                                    const isDisabled = activeFieldIdx === null;
                                    let btnColors = "";
                                    if (color === "amber") btnColors = drawMode === mode ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100";
                                    else if (color === "emerald") btnColors = drawMode === mode ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100";
                                    else if (color === "indigo") btnColors = drawMode === mode ? "bg-indigo-500 text-white" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100";
                                    
                                    return (
                                        <button
                                            key={mode}
                                            onClick={() => setDrawMode(drawMode === mode ? MODE.NONE : mode)}
                                            disabled={isDisabled}
                                            className={["px-3 py-1.5 rounded-lg text-xs font-medium transition", btnColors, isDisabled ? "opacity-40 cursor-not-allowed" : ""].join(" ")}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}

                                {activeFieldIdx === null && (
                                    <p className="text-xs text-slate-400">← Pilih field dulu</p>
                                )}
                                {activeField && (
                                    <p className="text-xs text-slate-400">
                                        Aktif: <strong className="text-slate-600">{activeField.field_name}</strong>
                                    </p>
                                )}

                                <div className="ml-auto flex items-center gap-1.5">
                                    <button onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center justify-center text-base font-bold leading-none select-none">−</button>
                                    <span className="text-xs font-semibold text-slate-600 w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(z => Math.min(3, parseFloat((z + 0.25).toFixed(2))))} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center justify-center text-base font-bold leading-none select-none">+</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <CanvasEditor
                                imageUrl={imageUrl}
                                groups={groups}
                                activeGroupIdx={activeGroupIdx}
                                activeFieldIdx={activeFieldIdx}
                                onBoxDrawn={handleBoxDrawn}
                                drawMode={drawMode}
                                zoom={zoom}
                            />
                        </div>
                    </div>

                    {/* PANEL KANAN: PROPERTIES */}
                    <div className="w-80 flex-shrink-0 flex flex-col gap-4 sticky top-0">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Template</label>
                            <input
                                type="text"
                                value={typeName}
                                onChange={(e) => setTypeName(e.target.value)}
                                placeholder="contoh: Formulir PM Vendor A"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                            />
                        </div>

                        {/* Hierarki Tree */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Struktur Data
                                </p>
                                <button onClick={addGroup} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition">
                                    <PlusIcon /> Grup
                                </button>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 p-2">
                                {groups.map((group, gi) => (
                                    <div key={gi} className="mb-2">
                                        {/* HEADER GRUP */}
                                        <div 
                                            className={`flex flex-col gap-2 p-2 rounded-lg cursor-pointer transition ${activeGroupIdx === gi && activeFieldIdx === null ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50 border border-transparent"}`}
                                            onClick={() => { setActiveGroupIdx(gi); setActiveFieldIdx(null); setDrawMode(MODE.NONE); }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); toggleGroup(gi); }}>
                                                    <span className="text-slate-400 p-1 hover:bg-slate-200 rounded"><ChevronDownIcon open={group.expanded} /></span>
                                                    <span className="text-xs font-bold text-slate-700 uppercase">{group.group_anchor || `Group ${gi + 1}`}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); addField(gi); }} className="text-xs text-indigo-600 hover:bg-indigo-100 p-1 rounded font-medium"><PlusIcon /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); removeGroup(gi); }} className="text-xs text-red-500 hover:bg-red-50 p-1 rounded"><TrashIcon /></button>
                                                </div>
                                            </div>
                                            
                                            {/* Form Group jika aktif/expanded */}
                                            {group.expanded && (
                                                <div className="pl-7 space-y-2 mt-1" onClick={e => e.stopPropagation()}>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 font-medium">Group Anchor (Teks)</label>
                                                        <input 
                                                            type="text" value={group.group_anchor} 
                                                            onChange={e => updateGroup(gi, "group_anchor", e.target.value)} 
                                                            className="w-full text-xs box-border rounded p-1.5 border-slate-200" placeholder="Contoh: Visual Check"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* FIELDS DI DALAM GRUP */}
                                        {group.expanded && (
                                            <div className="ml-5 mt-1 border-l-2 border-slate-100 pl-2 space-y-1">
                                                {group.fields.length === 0 && (
                                                    <p className="text-[10px] text-slate-400 italic py-1 pl-2">Belum ada field di grup ini.</p>
                                                )}
                                                {group.fields.map((field, fi) => {
                                                    const isActive = activeGroupIdx === gi && activeFieldIdx === fi;
                                                    return (
                                                        <div 
                                                            key={fi} 
                                                            className={`p-2 rounded-lg cursor-pointer transition ${isActive ? "bg-white shadow-sm border border-indigo-200 ring-1 ring-indigo-500/20" : "hover:bg-slate-50 border border-slate-100"}`}
                                                            onClick={() => { setActiveGroupIdx(gi); setActiveFieldIdx(fi); setDrawMode(MODE.NONE); }}
                                                        >
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-xs font-semibold text-slate-700">{field.field_name}</span>
                                                                <button onClick={(e) => { e.stopPropagation(); removeField(gi, fi); }} className="text-slate-400 hover:text-red-500"><TrashIcon /></button>
                                                            </div>

                                                            {isActive && (
                                                                <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                                                    <input 
                                                                        type="text" value={field.field_name} onChange={e => updateField(gi, fi, "field_name", e.target.value)}
                                                                        placeholder="Nama Data (ex: Environment Condition)" className="w-full text-[11px] rounded p-1.5 border-slate-200"
                                                                    />
                                                                    <input 
                                                                        type="text" value={field.field_anchor} onChange={e => updateField(gi, fi, "field_anchor", e.target.value)}
                                                                        placeholder="Anchor Kata Kunci (ex: a. Environment)" className="w-full text-[11px] rounded p-1.5 border-slate-200"
                                                                    />
                                                                    
                                                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                                                        <div>
                                                                            <label className="text-[9px] text-slate-500">Row Type</label>
                                                                            <select value={field.row_type} onChange={e => updateField(gi, fi, "row_type", e.target.value)} className="w-full text-[10px] rounded p-1.5 border-slate-200">
                                                                                <option value="single">Single Row</option>
                                                                                <option value="multi">Multi Row (Span)</option>
                                                                            </select>
                                                                        </div>
                                                                        {field.row_type === "multi" && (
                                                                            <div>
                                                                                <label className="text-[9px] text-slate-500">Row Span</label>
                                                                                <input type="number" min="2" value={field.row_span} onChange={e => updateField(gi, fi, "row_span", e.target.value)} className="w-full text-[10px] rounded p-1.5 border-slate-200" />
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Indikator Mode Box */}
                                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${field.anchor_box ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>A</span>
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${field.targets?.result?.box ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>R</span>
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${field.targets?.status?.box ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>S</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
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