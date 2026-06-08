import { useState, useRef, useCallback } from "react";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import axios from "axios";

// ─── Colour helpers ────────────────────────────────────────────
const CONF_COLOR = (c) => (c >= 0.9 ? "#10b981" : c >= 0.7 ? "#f59e0b" : "#ef4444");

const STATUS_COLORS = {
    need_validation: { bg: "rgba(245,158,11,0.15)",  text: "#f59e0b" },
    approved:        { bg: "rgba(16,185,129,0.15)",   text: "#10b981" },
    rejected:        { bg: "rgba(239,68,68,0.15)",    text: "#ef4444" },
    failed:          { bg: "rgba(239,68,68,0.12)",    text: "#f87171" },
};

// Derive PNG URL on Python engine from document's Supabase file_path
function getImageUrl(doc, pythonEngineUrl) {
    if (!doc?.file_path) return null;
    const filename = doc.file_path.split("/").pop();        // "abc_name.pdf"
    const fileStem = filename.replace(/\.[^.]+$/, "");      // "abc_name"
    const stem     = `temp_${doc.id}_${fileStem}`;
    return `${pythonEngineUrl}/static/pages/${stem}/page_1.png`;
}

// ─── Small reusable bits ───────────────────────────────────────
function StatusBadge({ status }) {
    const c = STATUS_COLORS[status] ?? { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" };
    return (
        <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 600,
            padding: "2px 8px", borderRadius: 99, textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {status?.replace(/_/g, " ")}
        </span>
    );
}

function Stat({ label, value, accent }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: accent ?? "#f5f5f5", fontFamily: "monospace" }}>{value}</span>
        </div>
    );
}

function LegendItem({ color, label, dashed }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 10, borderRadius: 2,
                background: `${color}22`, border: `1.5px ${dashed ? "dashed" : "solid"} ${color}`, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
        </div>
    );
}

function SelectBox({ label, value, onChange, children, style }) {
    return (
        <div style={{ flex: "1 1 280px", minWidth: 200, ...style }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#888",
                marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
            </label>
            <select value={value} onChange={onChange}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a",
                    borderRadius: 10, padding: "9px 12px", color: value ? "#f5f5f5" : "#666",
                    fontSize: 13, outline: "none" }}>
                {children}
            </select>
        </div>
    );
}

function ActionBtn({ onClick, disabled, loading, label, color = "#10b981" }) {
    const off = disabled || loading;
    return (
        <button onClick={onClick} disabled={off}
            style={{ background: off ? "#1a1a1a" : color, color: off ? "#555" : "#fff",
                border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 600,
                cursor: off ? "not-allowed" : "pointer", transition: "background 200ms",
                whiteSpace: "nowrap", flexShrink: 0 }}>
            {loading ? "Scanning…" : label}
        </button>
    );
}

// ─── SVG overlay — MODE 1: Paddle OCR ─────────────────────────
function PaddleOverlay({ boxes, scaleX, scaleY, showLabels, hovered, onHover }) {
    return boxes.map((box, i) => {
        const x = box.x * scaleX, y = box.y * scaleY;
        const w = box.w * scaleX, h = box.h * scaleY;
        const isHov = hovered?.kind === "box" && hovered.idx === i;
        const col   = CONF_COLOR(box.confidence);
        return (
            <g key={i}>
                <rect x={x} y={y} width={w} height={h} fill="transparent"
                    style={{ pointerEvents: "all", cursor: "crosshair" }}
                    onMouseEnter={() => onHover({ kind: "box", idx: i })}
                    onMouseLeave={() => onHover(null)} />
                <rect x={x} y={y} width={w} height={h}
                    fill={isHov ? `${col}33` : `${col}18`}
                    stroke={col} strokeWidth={isHov ? 1.5 : 0.8}
                    style={{ pointerEvents: "none" }} />
                {showLabels && w > 28 && (
                    <text x={x + 2} y={y - 3} fontSize={Math.max(7, Math.min(10, h * 0.5))}
                        fill={col} fontFamily="monospace" fontWeight={600}
                        style={{ pointerEvents: "none" }}>
                        {box.text.length > 20 ? box.text.slice(0, 18) + "…" : box.text}
                    </text>
                )}
            </g>
        );
    });
}

// ─── SVG overlay — MODE 2: Template Mapping ───────────────────
function TemplateMappingOverlay({ fields, tables, repeatingSections, scaleX, scaleY, showLabels, hovered, onHover }) {
    return (
        <>
            {/* Fields: anchor (red) + value box (blue, dashed) */}
            {fields.map((field, fi) => {
                if (!field.found || !field.anchor) return null;
                const a  = field.anchor;
                const vb = field.value_box;
                const ax = a.x * scaleX,  ay = a.y * scaleY,  aw = a.w * scaleX,  ah = a.h * scaleY;
                const vx = vb.x * scaleX, vy = vb.y * scaleY, vw = vb.w * scaleX, vh = vb.h * scaleY;
                const hovA = hovered?.kind === "field_anchor" && hovered.idx === fi;
                const hovV = hovered?.kind === "field_value"  && hovered.idx === fi;
                return (
                    <g key={`f${fi}`}>
                        {/* Value box (blue, dashed) — drawn first so anchor sits on top */}
                        <rect x={vx} y={vy} width={vw} height={vh} fill="transparent"
                            style={{ pointerEvents: "all", cursor: "crosshair" }}
                            onMouseEnter={() => onHover({ kind: "field_value", idx: fi })}
                            onMouseLeave={() => onHover(null)} />
                        <rect x={vx} y={vy} width={vw} height={vh}
                            fill={hovV ? "rgba(59,130,246,0.22)" : "rgba(59,130,246,0.08)"}
                            stroke="#3b82f6" strokeWidth={hovV ? 1.8 : 1} strokeDasharray="5 3"
                            style={{ pointerEvents: "none" }} />
                        {/* Anchor box (red, solid) */}
                        <rect x={ax} y={ay} width={aw} height={ah} fill="transparent"
                            style={{ pointerEvents: "all", cursor: "crosshair" }}
                            onMouseEnter={() => onHover({ kind: "field_anchor", idx: fi })}
                            onMouseLeave={() => onHover(null)} />
                        <rect x={ax} y={ay} width={aw} height={ah}
                            fill={hovA ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.14)"}
                            stroke="#ef4444" strokeWidth={hovA ? 2 : 1.2}
                            style={{ pointerEvents: "none" }} />
                        {showLabels && (
                            <text x={ax + 2} y={ay - 3} fontSize={9} fill="#ef4444"
                                fontFamily="monospace" fontWeight={700} style={{ pointerEvents: "none" }}>
                                {field.field_name}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Tables: area (green) → anchor (orange) → columns (yellow) */}
            {tables.map((table, ti) => {
                if (!table.found || !table.anchor) return null;
                const a  = table.anchor;
                const ar = table.area;
                const ax  = a.x  * scaleX, ay  = a.y  * scaleY, aw  = a.w  * scaleX, ah  = a.h  * scaleY;
                const arx = ar.x * scaleX, ary = ar.y * scaleY, arw = ar.w * scaleX, arh = ar.h * scaleY;
                const hovA  = hovered?.kind === "table_anchor" && hovered.idx === ti;
                const hovAr = hovered?.kind === "table_area"   && hovered.idx === ti;
                return (
                    <g key={`t${ti}`}>
                        {/* Table area (green, dashed) */}
                        <rect x={arx} y={ary} width={arw} height={arh} fill="transparent"
                            style={{ pointerEvents: "all", cursor: "crosshair" }}
                            onMouseEnter={() => onHover({ kind: "table_area", idx: ti })}
                            onMouseLeave={() => onHover(null)} />
                        <rect x={arx} y={ary} width={arw} height={arh}
                            fill={hovAr ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.05)"}
                            stroke="#10b981" strokeWidth={1} strokeDasharray="7 4"
                            style={{ pointerEvents: "none" }} />

                        {/* Column dividers (yellow) within table area */}
                        {table.columns.map((col, ci) => {
                            const cx  = col.x_start * scaleX;
                            const cw  = (col.x_end - col.x_start) * scaleX;
                            const hovC = hovered?.kind === "table_col" && hovered.tableIdx === ti && hovered.colIdx === ci;
                            return (
                                <g key={`c${ti}-${ci}`}>
                                    <rect x={cx} y={ary} width={cw} height={arh} fill="transparent"
                                        style={{ pointerEvents: "all", cursor: "crosshair" }}
                                        onMouseEnter={() => onHover({ kind: "table_col", tableIdx: ti, colIdx: ci })}
                                        onMouseLeave={() => onHover(null)} />
                                    <rect x={cx} y={ary} width={cw} height={arh}
                                        fill={hovC ? "rgba(234,179,8,0.22)" : "transparent"}
                                        stroke="#eab308" strokeWidth={hovC ? 1.5 : 0.8} strokeDasharray="4 4"
                                        style={{ pointerEvents: "none" }} />
                                    {showLabels && cw > 18 && (
                                        <text x={cx + 2} y={ary - 3} fontSize={8} fill="#eab308"
                                            fontFamily="monospace" fontWeight={600} style={{ pointerEvents: "none" }}>
                                            {col.name}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {/* Table anchor (orange, solid) — on top */}
                        <rect x={ax} y={ay} width={aw} height={ah} fill="transparent"
                            style={{ pointerEvents: "all", cursor: "crosshair" }}
                            onMouseEnter={() => onHover({ kind: "table_anchor", idx: ti })}
                            onMouseLeave={() => onHover(null)} />
                        <rect x={ax} y={ay} width={aw} height={ah}
                            fill={hovA ? "rgba(249,115,22,0.3)" : "rgba(249,115,22,0.14)"}
                            stroke="#f97316" strokeWidth={hovA ? 2 : 1.2}
                            style={{ pointerEvents: "none" }} />
                        {showLabels && (
                            <text x={ax + 2} y={ay - 3} fontSize={9} fill="#f97316"
                                fontFamily="monospace" fontWeight={700} style={{ pointerEvents: "none" }}>
                                {table.table_name}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Repeating Sections: anchor (violet) → field anchors (indigo) + value boxes (indigo dashed) → table anchors (rose) */}
            {(repeatingSections ?? []).map((sec, si) => (
                <g key={`sec${si}`}>
                    {/* Section anchor — violet solid */}
                    {sec.found && sec.anchor && (() => {
                        const a = sec.anchor;
                        const ax = a.x * scaleX, ay = a.y * scaleY, aw = a.w * scaleX, ah = a.h * scaleY;
                        const hovS = hovered?.kind === "sec_anchor" && hovered.secIdx === si;
                        return (
                            <g>
                                <rect x={ax} y={ay} width={aw} height={ah} fill="transparent"
                                    style={{ pointerEvents: "all", cursor: "crosshair" }}
                                    onMouseEnter={() => onHover({ kind: "sec_anchor", secIdx: si })}
                                    onMouseLeave={() => onHover(null)} />
                                <rect x={ax} y={ay} width={aw} height={ah}
                                    fill={hovS ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.15)"}
                                    stroke="#8b5cf6" strokeWidth={hovS ? 2 : 1.5}
                                    style={{ pointerEvents: "none" }} />
                                {showLabels && (
                                    <text x={ax + 2} y={ay - 3} fontSize={9} fill="#8b5cf6"
                                        fontFamily="monospace" fontWeight={700} style={{ pointerEvents: "none" }}>
                                        {sec.section_name ?? "Section"}
                                    </text>
                                )}
                            </g>
                        );
                    })()}

                    {/* Fields within section — anchor indigo solid, value box indigo dashed */}
                    {(sec.fields ?? []).map((f, fi) => {
                        if (!f.found || !f.anchor) return null;
                        const a = f.anchor; const vb = f.value_box;
                        const ax = a.x * scaleX, ay = a.y * scaleY, aw = a.w * scaleX, ah = a.h * scaleY;
                        const hovFA = hovered?.kind === "sec_field_anchor" && hovered.secIdx === si && hovered.fieldIdx === fi;
                        const hovFV = hovered?.kind === "sec_field_value"  && hovered.secIdx === si && hovered.fieldIdx === fi;
                        return (
                            <g key={`sf${si}-${fi}`}>
                                {vb && (
                                    <>
                                        <rect x={vb.x*scaleX} y={vb.y*scaleY} width={vb.w*scaleX} height={vb.h*scaleY}
                                            fill="transparent" style={{ pointerEvents: "all", cursor: "crosshair" }}
                                            onMouseEnter={() => onHover({ kind: "sec_field_value", secIdx: si, fieldIdx: fi })}
                                            onMouseLeave={() => onHover(null)} />
                                        <rect x={vb.x*scaleX} y={vb.y*scaleY} width={vb.w*scaleX} height={vb.h*scaleY}
                                            fill={hovFV ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.08)"}
                                            stroke="#6366f1" strokeWidth={hovFV ? 1.8 : 1} strokeDasharray="5 3"
                                            style={{ pointerEvents: "none" }} />
                                    </>
                                )}
                                <rect x={ax} y={ay} width={aw} height={ah} fill="transparent"
                                    style={{ pointerEvents: "all", cursor: "crosshair" }}
                                    onMouseEnter={() => onHover({ kind: "sec_field_anchor", secIdx: si, fieldIdx: fi })}
                                    onMouseLeave={() => onHover(null)} />
                                <rect x={ax} y={ay} width={aw} height={ah}
                                    fill={hovFA ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.14)"}
                                    stroke="#6366f1" strokeWidth={hovFA ? 2 : 1.2}
                                    style={{ pointerEvents: "none" }} />
                                {showLabels && (
                                    <text x={ax + 2} y={ay - 3} fontSize={9} fill="#6366f1"
                                        fontFamily="monospace" fontWeight={700} style={{ pointerEvents: "none" }}>
                                        {f.field_name}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* Tables within section — area orange dashed + anchor rose solid */}
                    {(sec.tables ?? []).map((t, ti) => {
                        if (!t.found || !t.anchor) return null;
                        const a  = t.anchor;
                        const ar = t.area;
                        const ax = a.x * scaleX, ay = a.y * scaleY, aw = a.w * scaleX, ah = a.h * scaleY;
                        const hovTA  = hovered?.kind === "sec_table_anchor" && hovered.secIdx === si && hovered.tableIdx === ti;
                        const hovTAr = hovered?.kind === "sec_table_area"   && hovered.secIdx === si && hovered.tableIdx === ti;
                        return (
                            <g key={`st${si}-${ti}`}>
                                {/* Table area (orange dashed) */}
                                {ar && (<>
                                    <rect x={ar.x * scaleX} y={ar.y * scaleY} width={ar.w * scaleX} height={ar.h * scaleY} fill="transparent"
                                        style={{ pointerEvents: "all", cursor: "crosshair" }}
                                        onMouseEnter={() => onHover({ kind: "sec_table_area", secIdx: si, tableIdx: ti })}
                                        onMouseLeave={() => onHover(null)} />
                                    <rect x={ar.x * scaleX} y={ar.y * scaleY} width={ar.w * scaleX} height={ar.h * scaleY}
                                        fill={hovTAr ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.05)"}
                                        stroke="#f97316" strokeWidth={1} strokeDasharray="7 4"
                                        style={{ pointerEvents: "none" }} />
                                    {showLabels && (
                                        <text x={ar.x * scaleX + 2} y={ar.y * scaleY - 3} fontSize={8} fill="#f97316"
                                            fontFamily="monospace" fontWeight={600} style={{ pointerEvents: "none" }}>
                                            {t.area_label ?? `${sec.json_key}_${t.table_name}_area`}
                                        </text>
                                    )}
                                </>)}
                                {/* Table anchor (rose solid) */}
                                <rect x={ax} y={ay} width={aw} height={ah} fill="transparent"
                                    style={{ pointerEvents: "all", cursor: "crosshair" }}
                                    onMouseEnter={() => onHover({ kind: "sec_table_anchor", secIdx: si, tableIdx: ti })}
                                    onMouseLeave={() => onHover(null)} />
                                <rect x={ax} y={ay} width={aw} height={ah}
                                    fill={hovTA ? "rgba(225,29,72,0.3)" : "rgba(225,29,72,0.14)"}
                                    stroke="#e11d48" strokeWidth={hovTA ? 2 : 1.2}
                                    style={{ pointerEvents: "none" }} />
                                {showLabels && (
                                    <text x={ax + 2} y={ay - 3} fontSize={9} fill="#e11d48"
                                        fontFamily="monospace" fontWeight={700} style={{ pointerEvents: "none" }}>
                                        {t.table_name}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </g>
            ))}
        </>
    );
}

// ─── Tooltip ──────────────────────────────────────────────────
function buildTooltip(hovered, mode, activeResult, scaleX, scaleY, imgSize) {
    if (!hovered || !activeResult || imgSize.w === 0) return null;

    let boxScreen = null, title = "", lines = [], color = "#10b981";

    const s = (b) => ({ x: b.x * scaleX, y: b.y * scaleY, h: b.h * scaleY });

    if (mode === "paddle" && hovered.kind === "box") {
        const b = activeResult.boxes?.[hovered.idx]; if (!b) return null;
        boxScreen = s(b);
        color = CONF_COLOR(b.confidence);
        title = b.text;
        lines = [`Confidence: ${(b.confidence * 100).toFixed(1)}%`, `x=${b.x}  y=${b.y}  w=${b.w}  h=${b.h}`];

    } else if (hovered.kind === "field_anchor") {
        const f = activeResult.fields?.[hovered.idx]; if (!f?.anchor) return null;
        boxScreen = s(f.anchor);
        color = "#ef4444";
        title = `Anchor — ${f.field_name}`;
        lines = [`"${f.anchor.text}"`, `x=${f.anchor.x}  y=${f.anchor.y}  w=${f.anchor.w}  h=${f.anchor.h}`];

    } else if (hovered.kind === "field_value") {
        const f = activeResult.fields?.[hovered.idx]; if (!f?.value_box) return null;
        boxScreen = s(f.value_box);
        color = "#3b82f6";
        title = `Value box — ${f.field_name}`;
        lines = [`x=${f.value_box.x}  y=${f.value_box.y}  w=${f.value_box.w}  h=${f.value_box.h}`];

    } else if (hovered.kind === "table_anchor") {
        const t = activeResult.tables?.[hovered.idx]; if (!t?.anchor) return null;
        boxScreen = s(t.anchor);
        color = "#f97316";
        title = `Table Anchor — ${t.table_name}`;
        lines = [`"${t.anchor.text}"`, `x=${t.anchor.x}  y=${t.anchor.y}  w=${t.anchor.w}  h=${t.anchor.h}`];

    } else if (hovered.kind === "table_area") {
        const t = activeResult.tables?.[hovered.idx]; if (!t?.area) return null;
        boxScreen = s(t.area);
        color = "#10b981";
        title = `Table Area — ${t.table_name}`;
        lines = [`x=${t.area.x}  y=${t.area.y}  w=${t.area.w}  h=${t.area.h}`];

    } else if (hovered.kind === "table_col") {
        const t   = activeResult.tables?.[hovered.tableIdx];
        const col = t?.columns?.[hovered.colIdx];
        if (!col || !t?.area) return null;
        boxScreen = { x: col.x_start * scaleX, y: t.area.y * scaleY, h: t.area.h * scaleY };
        color = "#eab308";
        title = `Column — ${col.name}  (${t.table_name})`;
        lines = [`x_start=${col.x_start}  x_end=${col.x_end}`, `w=${col.x_end - col.x_start}  type: ${col.type}`];

    } else if (hovered.kind === "sec_anchor") {
        const sec = activeResult.repeating_sections?.[hovered.secIdx]; if (!sec?.anchor) return null;
        boxScreen = s(sec.anchor); color = "#8b5cf6";
        title = `Section — ${sec.section_name ?? "Section"}`;
        lines = [`"${sec.anchor.text}"`, `x=${sec.anchor.x}  y=${sec.anchor.y}  w=${sec.anchor.w}  h=${sec.anchor.h}`];

    } else if (hovered.kind === "sec_field_anchor") {
        const sec = activeResult.repeating_sections?.[hovered.secIdx];
        const f = sec?.fields?.[hovered.fieldIdx]; if (!f?.anchor) return null;
        boxScreen = s(f.anchor); color = "#6366f1";
        title = `Section Field Anchor — ${f.field_name}`;
        lines = [`"${f.anchor.text}"`, `x=${f.anchor.x}  y=${f.anchor.y}  w=${f.anchor.w}  h=${f.anchor.h}`];

    } else if (hovered.kind === "sec_field_value") {
        const sec = activeResult.repeating_sections?.[hovered.secIdx];
        const f = sec?.fields?.[hovered.fieldIdx]; if (!f?.value_box) return null;
        boxScreen = s(f.value_box); color = "#6366f1";
        title = `Section Field Value — ${f.field_name}`;
        lines = [`x=${f.value_box.x}  y=${f.value_box.y}  w=${f.value_box.w}  h=${f.value_box.h}`];

    } else if (hovered.kind === "sec_table_anchor") {
        const sec = activeResult.repeating_sections?.[hovered.secIdx];
        const t = sec?.tables?.[hovered.tableIdx]; if (!t?.anchor) return null;
        boxScreen = s(t.anchor); color = "#e11d48";
        title = `Section Table Anchor — ${t.table_name}`;
        lines = [`"${t.anchor.text}"`, `x=${t.anchor.x}  y=${t.anchor.y}  w=${t.anchor.w}  h=${t.anchor.h}`];

    } else {
        return null;
    }

    if (!boxScreen) return null;
    const tipY = boxScreen.y > 92 ? boxScreen.y - 92 : boxScreen.y + boxScreen.h + 8;
    const tipX = Math.max(0, Math.min(boxScreen.x, imgSize.w - 260));
    return { x: tipX, y: tipY, title, lines, color };
}

// ─── Main page ─────────────────────────────────────────────────
export default function DebugOCR({ documents, templates, pythonEngineUrl }) {
    const [mode, setMode]                   = useState("paddle");   // "paddle" | "template"
    const [selectedDocId, setSelectedDocId] = useState("");
    const [selectedTplId, setSelectedTplId] = useState("");
    const [paddleResult, setPaddleResult]   = useState(null);
    const [templateResult, setTemplateResult] = useState(null);
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState(null);
    const [showLabels, setShowLabels]       = useState(true);
    const [hovered, setHovered]             = useState(null);
    const [imgSize, setImgSize]             = useState({ w: 0, h: 0 });

    const imgRef = useRef(null);

    const selectedDoc = documents.find((d) => d.id === parseInt(selectedDocId));
    const imageUrl    = getImageUrl(selectedDoc, pythonEngineUrl);
    const activeResult = mode === "paddle" ? paddleResult : templateResult;
    const scaleX = activeResult ? imgSize.w / activeResult.image_width  : 1;
    const scaleY = activeResult ? imgSize.h / activeResult.image_height : 1;

    const handleImgLoad = useCallback(() => {
        if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    }, []);

    const clearResults = () => { setPaddleResult(null); setTemplateResult(null); setError(null); setHovered(null); };

    // ── Download Preview ─────────────────────────────────────────
    // Render gambar asli + semua overlay ke <canvas> lalu download PNG.
    // Box digambar pada resolusi asli (image_width × image_height) agar
    // hasil download tajam, bukan menggunakan ukuran render di layar.
    const downloadPreview = useCallback(() => {
        if (!activeResult || !imageUrl) return;

        const iw = activeResult.image_width;
        const ih = activeResult.image_height;

        const canvas    = document.createElement("canvas");
        canvas.width    = iw;
        canvas.height   = ih;
        const ctx       = canvas.getContext("2d");

        // Konversi hex (#rrggbb) ke rgba string
        const hexRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        };

        // Gambar satu bounding box: isi transparan + border + opsional label
        const lw = Math.max(2, Math.round(iw / 800));   // lebar stroke proporsional

        const drawBox = (x, y, w, h, color, fillAlpha, dash = []) => {
            ctx.beginPath();
            ctx.setLineDash(dash);
            ctx.lineWidth   = lw;
            ctx.strokeStyle = color;
            ctx.fillStyle   = hexRgba(color, fillAlpha);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        };

        const drawLabel = (text, x, y, color) => {
            const fs  = Math.max(18, Math.round(iw / 100));
            ctx.font  = `bold ${fs}px monospace`;
            const tw  = ctx.measureText(text).width;
            const pad = 4;
            // Background gelap di balik teks agar terbaca di atas gambar
            ctx.fillStyle = "rgba(0,0,0,0.72)";
            ctx.fillRect(x, y - fs - pad, tw + pad * 2, fs + pad * 2);
            ctx.fillStyle = color;
            ctx.fillText(text, x + pad, y - 1);
        };

        const img        = new Image();
        img.crossOrigin  = "anonymous";
        img.onload = () => {
            // 1. Gambar dokumen
            ctx.drawImage(img, 0, 0, iw, ih);

            if (mode === "paddle") {
                // ── Mode Paddle OCR: satu warna per confidence ───────
                for (const box of (activeResult.boxes ?? [])) {
                    const col = CONF_COLOR(box.confidence);
                    drawBox(box.x, box.y, box.w, box.h, col, 0.15);
                    if (showLabels && box.w > 40) {
                        const label = box.text.length > 22
                            ? box.text.slice(0, 20) + "…"
                            : box.text;
                        drawLabel(label, box.x, box.y, col);
                    }
                }
            } else {
                // ── Mode Template Mapping ─────────────────────────────
                const DASH_VALUE  = [Math.round(iw / 200), Math.round(iw / 400)];
                const DASH_COL    = [Math.round(iw / 300), Math.round(iw / 400)];

                for (const table of (activeResult.tables ?? [])) {
                    if (!table.found) continue;
                    const ar = table.area;
                    const a  = table.anchor;

                    // Area tabel (hijau, dashed, isi sangat transparan)
                    drawBox(ar.x, ar.y, ar.w, ar.h, "#10b981", 0.06, DASH_VALUE);

                    // Kolom (kuning, dashed, tanpa isi)
                    for (const col of table.columns) {
                        drawBox(col.x_start, ar.y, col.x_end - col.x_start, ar.h, "#eab308", 0, DASH_COL);
                        if (showLabels && (col.x_end - col.x_start) > 30) {
                            drawLabel(col.name, col.x_start, ar.y, "#eab308");
                        }
                    }

                    // Anchor tabel (orange, solid)
                    drawBox(a.x, a.y, a.w, a.h, "#f97316", 0.18);
                    if (showLabels) drawLabel(table.table_name, a.x, a.y, "#f97316");
                }

                for (const field of (activeResult.fields ?? [])) {
                    if (!field.found) continue;
                    const vb = field.value_box;
                    const a  = field.anchor;

                    // Value box (biru, dashed)
                    drawBox(vb.x, vb.y, vb.w, vb.h, "#3b82f6", 0.08, DASH_VALUE);

                    // Anchor field (merah, solid) — di atas value box
                    drawBox(a.x, a.y, a.w, a.h, "#ef4444", 0.18);
                    if (showLabels) drawLabel(field.field_name, a.x, a.y, "#ef4444");
                }

                // Repeating Sections
                for (const sec of (activeResult.repeating_sections ?? [])) {
                    // Section anchor (violet)
                    if (sec.found && sec.anchor) {
                        const a = sec.anchor;
                        drawBox(a.x, a.y, a.w, a.h, "#8b5cf6", 0.18);
                        if (showLabels) drawLabel(sec.section_name ?? "Section", a.x, a.y, "#8b5cf6");
                    }
                    // Section fields
                    for (const f of (sec.fields ?? [])) {
                        if (!f.found) continue;
                        if (f.value_box) drawBox(f.value_box.x, f.value_box.y, f.value_box.w, f.value_box.h, "#6366f1", 0.08, DASH_VALUE);
                        if (f.anchor) {
                            drawBox(f.anchor.x, f.anchor.y, f.anchor.w, f.anchor.h, "#6366f1", 0.18);
                            if (showLabels) drawLabel(f.field_name, f.anchor.x, f.anchor.y, "#6366f1");
                        }
                    }
                    // Section table areas (orange dashed) + anchors (rose solid)
                    for (const t of (sec.tables ?? [])) {
                        if (!t.found || !t.anchor) continue;
                        if (t.area) {
                            drawBox(t.area.x, t.area.y, t.area.w, t.area.h, "#f97316", 0.06, DASH_VALUE);
                            if (showLabels) drawLabel(t.area_label ?? `${sec.json_key}_${t.table_name}_area`, t.area.x, t.area.y, "#f97316");
                        }
                        drawBox(t.anchor.x, t.anchor.y, t.anchor.w, t.anchor.h, "#e11d48", 0.18);
                        if (showLabels) drawLabel(t.table_name, t.anchor.x, t.anchor.y, "#e11d48");
                    }
                }
            }

            // 2. Trigger download
            canvas.toBlob((blob) => {
                const url    = URL.createObjectURL(blob);
                const link   = document.createElement("a");
                const stem   = selectedDoc?.original_name?.replace(/\.[^.]+$/, "") ?? "debug";
                link.href     = url;
                link.download = `debug_${mode}_${stem}.png`;
                link.click();
                URL.revokeObjectURL(url);
            }, "image/png");
        };

        img.onerror = () => {
            // CORS fallback: Python engine belum kirim header Allow-Origin
            alert("Gagal memuat gambar. Pastikan Python Engine berjalan dan CORS aktif.");
        };

        img.src = imageUrl;
    }, [activeResult, imageUrl, mode, showLabels, selectedDoc]);

    // ── Scan Paddle OCR ──────────────────────────────────────────
    const handleScanPaddle = async () => {
        if (!selectedDocId) return;
        setLoading(true); setError(null); setPaddleResult(null); setHovered(null);
        try {
            const { data } = await axios.post("/internal-api/debug-ocr", { document_id: parseInt(selectedDocId) });
            if (data.error) setError(data.error);
            else setPaddleResult(data);
        } catch (e) {
            setError(e.response?.data?.error ?? e.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Scan Template Mapping ────────────────────────────────────
    const handleScanTemplate = async () => {
        if (!selectedDocId || !selectedTplId) return;
        setLoading(true); setError(null); setTemplateResult(null); setHovered(null);
        try {
            const { data } = await axios.post("/internal-api/debug-template", {
                document_id: parseInt(selectedDocId),
                template_id: parseInt(selectedTplId),
            });
            if (data.error) setError(data.error);
            else setTemplateResult(data);
        } catch (e) {
            setError(e.response?.data?.error ?? e.message);
        } finally {
            setLoading(false);
        }
    };

    const tooltip = buildTooltip(hovered, mode, activeResult, scaleX, scaleY, imgSize);

    // ── Stats ────────────────────────────────────────────────────
    const renderStats = () => {
        if (!activeResult) return null;
        if (mode === "paddle") {
            const boxes = activeResult.boxes ?? [];
            const avgConf = boxes.length
                ? (boxes.reduce((s, b) => s + b.confidence, 0) / boxes.length * 100).toFixed(1)
                : "—";
            return (
                <>
                    <Stat label="Total Box" value={boxes.length} />
                    <Stat label="Ukuran Gambar" value={`${activeResult.image_width}×${activeResult.image_height}`} />
                    <Stat label="Avg Confidence" value={`${avgConf}%`} />
                    <Stat label="High (≥90%)"  value={boxes.filter(b => b.confidence >= 0.9).length} accent="#10b981" />
                    <Stat label="Low (<70%)"   value={boxes.filter(b => b.confidence < 0.7).length}  accent="#ef4444" />
                </>
            );
        }
        const fields   = activeResult.fields ?? [];
        const tables   = activeResult.tables ?? [];
        const sections = activeResult.repeating_sections ?? [];
        return (
            <>
                <Stat label="Ukuran Gambar"   value={`${activeResult.image_width}×${activeResult.image_height}`} />
                <Stat label="Total Fields"    value={fields.length} />
                <Stat label="Fields Found"    value={fields.filter(f => f.found).length} accent="#10b981" />
                <Stat label="Fields Missing"  value={fields.filter(f => !f.found).length} accent="#ef4444" />
                <Stat label="Total Tables"    value={tables.length} />
                <Stat label="Tables Found"    value={tables.filter(t => t.found).length} accent="#10b981" />
                {sections.length > 0 && <>
                    <Stat label="Sections"       value={sections.length} accent="#8b5cf6" />
                    <Stat label="Sections Found" value={sections.filter(s => s.found).length} accent="#8b5cf6" />
                </>}
            </>
        );
    };

    // ── Legend ───────────────────────────────────────────────────
    const renderLegend = () => {
        if (!activeResult) return null;
        if (mode === "paddle") {
            return (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 20px",
                    borderTop: "1px solid #2a2a2a" }}>
                    <LegendItem color="#10b981" label="Confidence ≥ 90%" />
                    <LegendItem color="#f59e0b" label="Confidence 70–89%" />
                    <LegendItem color="#ef4444" label="Confidence < 70%" />
                </div>
            );
        }
        return (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 20px",
                borderTop: "1px solid #2a2a2a" }}>
                <LegendItem color="#ef4444" label="Field Anchor" />
                <LegendItem color="#3b82f6" label="Field Value Box" dashed />
                <LegendItem color="#f97316" label="Table Anchor" />
                <LegendItem color="#10b981" label="Table Area" dashed />
                <LegendItem color="#eab308" label="Column" dashed />
                <LegendItem color="#8b5cf6" label="Section Anchor" />
                <LegendItem color="#6366f1" label="Section Field Anchor" />
                <LegendItem color="#6366f1" label="Section Field Value" dashed />
                <LegendItem color="#e11d48" label="Section Table Anchor" />
                <LegendItem color="#f97316" label="Section Table Area" dashed />
            </div>
        );
    };

    // ── Details table ────────────────────────────────────────────
    const renderDetailsTable = () => {
        if (!activeResult) return null;

        if (mode === "paddle") {
            const boxes = activeResult.boxes ?? [];
            if (!boxes.length) return null;
            return (
                <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>Semua Bounding Box ({boxes.length})</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#1a1a1a" }}>
                                    {["#", "Teks", "x", "y", "w", "h", "Confidence"].map((h) => (
                                        <th key={h} style={{ padding: "8px 14px", textAlign: h === "Teks" ? "left" : "right",
                                            color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase",
                                            borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {boxes.map((box, i) => (
                                    <tr key={i}
                                        onMouseEnter={() => setHovered({ kind: "box", idx: i })}
                                        onMouseLeave={() => setHovered(null)}
                                        style={{ background: hovered?.kind === "box" && hovered.idx === i ? "#1a1a1a" : "transparent",
                                            borderBottom: "1px solid #1e1e1e", cursor: "default", transition: "background 100ms" }}>
                                        <td style={{ padding: "7px 14px", color: "#555", textAlign: "right" }}>{i + 1}</td>
                                        <td style={{ padding: "7px 14px", color: "#f5f5f5", maxWidth: 300, wordBreak: "break-word" }}>{box.text}</td>
                                        <td style={{ padding: "7px 14px", color: "#aaa", textAlign: "right", fontFamily: "monospace" }}>{box.x}</td>
                                        <td style={{ padding: "7px 14px", color: "#aaa", textAlign: "right", fontFamily: "monospace" }}>{box.y}</td>
                                        <td style={{ padding: "7px 14px", color: "#aaa", textAlign: "right", fontFamily: "monospace" }}>{box.w}</td>
                                        <td style={{ padding: "7px 14px", color: "#aaa", textAlign: "right", fontFamily: "monospace" }}>{box.h}</td>
                                        <td style={{ padding: "7px 14px", textAlign: "right" }}>
                                            <span style={{ color: CONF_COLOR(box.confidence), fontWeight: 600, fontFamily: "monospace" }}>
                                                {(box.confidence * 100).toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // Template mode: field table + tables table + repeating sections
        const fields   = activeResult.fields ?? [];
        const tables   = activeResult.tables ?? [];
        const sections = activeResult.repeating_sections ?? [];
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Fields */}
                {fields.length > 0 && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>Fields ({fields.length})</span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: "#1a1a1a" }}>
                                        {["Field", "Anchor Text", "Type", "Found", "Anchor Pos", "Value Box"].map(h => (
                                            <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#888",
                                                fontWeight: 600, fontSize: 11, textTransform: "uppercase",
                                                borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {fields.map((f, i) => {
                                        const isHov = (hovered?.kind === "field_anchor" || hovered?.kind === "field_value") && hovered.idx === i;
                                        return (
                                            <tr key={i}
                                                onMouseEnter={() => setHovered({ kind: "field_anchor", idx: i })}
                                                onMouseLeave={() => setHovered(null)}
                                                style={{ background: isHov ? "#1a1a1a" : "transparent",
                                                    borderBottom: "1px solid #1e1e1e", cursor: "default", transition: "background 100ms" }}>
                                                <td style={{ padding: "7px 14px", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{f.field_name}</td>
                                                <td style={{ padding: "7px 14px", color: "#aaa" }}>"{f.anchor_text}"</td>
                                                <td style={{ padding: "7px 14px", color: "#888" }}>{f.field_type}</td>
                                                <td style={{ padding: "7px 14px" }}>
                                                    <span style={{ color: f.found ? "#10b981" : "#ef4444", fontWeight: 700 }}>{f.found ? "✓" : "✗"}</span>
                                                </td>
                                                <td style={{ padding: "7px 14px", color: "#aaa", fontFamily: "monospace" }}>
                                                    {f.anchor ? `(${f.anchor.x}, ${f.anchor.y})` : "—"}
                                                </td>
                                                <td style={{ padding: "7px 14px", color: "#6ea8fe", fontFamily: "monospace" }}>
                                                    {f.value_box ? `x=${f.value_box.x} y=${f.value_box.y} ${f.value_box.w}×${f.value_box.h}` : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Tables */}
                {tables.length > 0 && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>Tables ({tables.length})</span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: "#1a1a1a" }}>
                                        {["Tabel", "Anchor Text", "Found", "Anchor Pos", "Area", "Columns"].map(h => (
                                            <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#888",
                                                fontWeight: 600, fontSize: 11, textTransform: "uppercase",
                                                borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tables.map((t, ti) => {
                                        const isHov = (hovered?.kind === "table_anchor" || hovered?.kind === "table_area") && hovered.idx === ti;
                                        return (
                                            <tr key={ti}
                                                onMouseEnter={() => setHovered({ kind: "table_anchor", idx: ti })}
                                                onMouseLeave={() => setHovered(null)}
                                                style={{ background: isHov ? "#1a1a1a" : "transparent",
                                                    borderBottom: "1px solid #1e1e1e", cursor: "default", transition: "background 100ms" }}>
                                                <td style={{ padding: "7px 14px", color: "#f97316", fontFamily: "monospace", fontWeight: 700 }}>{t.table_name}</td>
                                                <td style={{ padding: "7px 14px", color: "#aaa" }}>"{t.anchor_text}"</td>
                                                <td style={{ padding: "7px 14px" }}>
                                                    <span style={{ color: t.found ? "#10b981" : "#ef4444", fontWeight: 700 }}>{t.found ? "✓" : "✗"}</span>
                                                </td>
                                                <td style={{ padding: "7px 14px", color: "#aaa", fontFamily: "monospace" }}>
                                                    {t.anchor ? `(${t.anchor.x}, ${t.anchor.y})` : "—"}
                                                </td>
                                                <td style={{ padding: "7px 14px", color: "#6ee7b7", fontFamily: "monospace" }}>
                                                    {t.area ? `${t.area.w}×${t.area.h} @ y=${t.area.y}` : "—"}
                                                </td>
                                                <td style={{ padding: "7px 14px", color: "#888" }}>
                                                    {t.columns.length ? t.columns.map(c => c.name).join(", ") : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Repeating Sections */}
                {sections.length > 0 && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa" }}>Repeating Sections ({sections.length})</span>
                        </div>
                        {sections.map((sec, si) => (
                            <div key={si} style={{ borderBottom: "1px solid #1e1e1e" }}>
                                {/* Section header row */}
                                <div style={{ padding: "10px 20px", background: "rgba(139,92,246,0.08)",
                                    display: "flex", alignItems: "center", gap: 12 }}
                                    onMouseEnter={() => setHovered({ kind: "sec_anchor", secIdx: si })}
                                    onMouseLeave={() => setHovered(null)}>
                                    <span style={{ color: "#8b5cf6", fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                                        {sec.section_name ?? sec.json_key ?? `Section ${si+1}`}
                                    </span>
                                    <span style={{ color: sec.found ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 12 }}>
                                        {sec.found ? "✓ found" : "✗ not found"}
                                    </span>
                                    {sec.anchor && (
                                        <span style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>
                                            anchor: "{sec.anchor.text}" @ ({sec.anchor.x}, {sec.anchor.y})
                                        </span>
                                    )}
                                </div>
                                {/* Section fields */}
                                {(sec.fields ?? []).length > 0 && (
                                    <div style={{ overflowX: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ background: "#161616" }}>
                                                    {["Field", "Anchor Text", "Found", "Anchor Pos", "Value Box"].map(h => (
                                                        <th key={h} style={{ padding: "6px 14px", textAlign: "left", color: "#666",
                                                            fontWeight: 600, fontSize: 10, textTransform: "uppercase",
                                                            borderBottom: "1px solid #222" }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(sec.fields ?? []).map((f, fi) => {
                                                    const isHov = (hovered?.kind === "sec_field_anchor" || hovered?.kind === "sec_field_value") && hovered.secIdx === si && hovered.fieldIdx === fi;
                                                    return (
                                                        <tr key={fi}
                                                            onMouseEnter={() => setHovered({ kind: "sec_field_anchor", secIdx: si, fieldIdx: fi })}
                                                            onMouseLeave={() => setHovered(null)}
                                                            style={{ background: isHov ? "#1a1a1a" : "transparent",
                                                                borderBottom: "1px solid #1e1e1e", transition: "background 100ms" }}>
                                                            <td style={{ padding: "6px 14px", color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>{f.field_name}</td>
                                                            <td style={{ padding: "6px 14px", color: "#aaa" }}>"{f.anchor_text}"</td>
                                                            <td style={{ padding: "6px 14px" }}>
                                                                <span style={{ color: f.found ? "#10b981" : "#ef4444", fontWeight: 700 }}>{f.found ? "✓" : "✗"}</span>
                                                            </td>
                                                            <td style={{ padding: "6px 14px", color: "#aaa", fontFamily: "monospace" }}>
                                                                {f.anchor ? `(${f.anchor.x}, ${f.anchor.y})` : "—"}
                                                            </td>
                                                            <td style={{ padding: "6px 14px", color: "#6ea8fe", fontFamily: "monospace" }}>
                                                                {f.value_box ? `x=${f.value_box.x} y=${f.value_box.y} ${f.value_box.w}×${f.value_box.h}` : "—"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {/* Section tables */}
                                {(sec.tables ?? []).map((t, ti) => (
                                    <div key={ti} style={{ padding: "6px 20px 6px 32px", display: "flex", alignItems: "center", gap: 10,
                                        borderTop: "1px solid #1a1a1a" }}
                                        onMouseEnter={() => setHovered({ kind: "sec_table_anchor", secIdx: si, tableIdx: ti })}
                                        onMouseLeave={() => setHovered(null)}>
                                        <span style={{ color: "#f43f5e", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>⊞ {t.table_name}</span>
                                        <span style={{ color: t.found ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 11 }}>{t.found ? "✓" : "✗"}</span>
                                        {t.anchor && <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>"{t.anchor.text}" @ ({t.anchor.x}, {t.anchor.y})</span>}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ─── Render ────────────────────────────────────────────────
    return (
        <AuthenticatedLayout header="Debug OCR">
            <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1400, margin: "0 auto" }}>

                {/* ── Mode toggle + controls ── */}
                <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16,
                    padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Mode toggle */}
                    <div style={{ display: "flex", gap: 4, background: "#1a1a1a", borderRadius: 10, padding: 4, alignSelf: "flex-start" }}>
                        {[{ id: "paddle", label: "Paddle OCR" }, { id: "template", label: "Template Mapping" }].map(({ id, label }) => (
                            <button key={id} onClick={() => { setMode(id); setHovered(null); }}
                                style={{ padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    border: "none", cursor: "pointer", transition: "all 200ms",
                                    background: mode === id ? "#10b981" : "transparent",
                                    color:      mode === id ? "#fff" : "#888" }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Inputs row */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
                        {/* Document select */}
                        <SelectBox label="Pilih Dokumen" value={selectedDocId}
                            onChange={(e) => { setSelectedDocId(e.target.value); clearResults(); }}>
                            <option value="">— Pilih dokumen yang sudah diproses —</option>
                            {documents.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                    #{doc.id} · {doc.original_name} · {doc.status?.replace(/_/g, " ")} · {doc.processed_at}
                                </option>
                            ))}
                        </SelectBox>

                        {/* Template select — only in template mode */}
                        {mode === "template" && (
                            <SelectBox label="Pilih Template" value={selectedTplId}
                                onChange={(e) => { setSelectedTplId(e.target.value); setTemplateResult(null); setError(null); }}>
                                <option value="">— Pilih template —</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.type_name} ({t.template_code})</option>
                                ))}
                            </SelectBox>
                        )}

                        {/* Status badge */}
                        {selectedDoc && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                                <StatusBadge status={selectedDoc.status} />
                                {selectedDoc.template_name && (
                                    <span style={{ fontSize: 12, color: "#888" }}>{selectedDoc.template_name}</span>
                                )}
                            </div>
                        )}

                        {/* Scan button */}
                        {mode === "paddle" ? (
                            <ActionBtn onClick={handleScanPaddle} disabled={!selectedDocId}
                                loading={loading} label="Scan OCR" />
                        ) : (
                            <ActionBtn onClick={handleScanTemplate}
                                disabled={!selectedDocId || !selectedTplId}
                                loading={loading} label="Scan Template" />
                        )}

                        {/* Label toggle */}
                        {activeResult && (
                            <button onClick={() => setShowLabels((v) => !v)}
                                style={{ background: showLabels ? "rgba(16,185,129,0.12)" : "#1a1a1a",
                                    color: showLabels ? "#10b981" : "#888",
                                    border: `1px solid ${showLabels ? "#10b981" : "#2a2a2a"}`,
                                    borderRadius: 10, padding: "9px 16px", fontSize: 12, fontWeight: 600,
                                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                                {showLabels ? "Sembunyikan Label" : "Tampilkan Label"}
                            </button>
                        )}

                        {/* Download Preview */}
                        {activeResult && (
                            <button onClick={downloadPreview}
                                style={{ background: "#1a1a1a", color: "#a3a3a3",
                                    border: "1px solid #2a2a2a", borderRadius: 10,
                                    padding: "9px 16px", fontSize: 12, fontWeight: 600,
                                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                                    display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Download Preview
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Stats bar ── */}
                {activeResult && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 12,
                        padding: "12px 20px", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                        {renderStats()}
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 12, padding: "14px 20px", color: "#f87171", fontSize: 13 }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* ── Canvas ── */}
                {imageUrl && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
                        {/* Canvas header */}
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a",
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>
                                {selectedDoc?.original_name ?? "Dokumen"}
                            </span>
                            <span style={{ fontSize: 12, color: "#888" }}>
                                {mode === "paddle" && activeResult && `${activeResult.boxes?.length ?? 0} box`}
                                {mode === "template" && activeResult && (
                                    `${activeResult.fields?.filter(f => f.found).length ?? 0}/${activeResult.fields?.length ?? 0} field · `
                                    + `${activeResult.tables?.filter(t => t.found).length ?? 0}/${activeResult.tables?.length ?? 0} table`
                                    + ((activeResult.repeating_sections?.length ?? 0) > 0
                                        ? ` · ${activeResult.repeating_sections.filter(s => s.found).length}/${activeResult.repeating_sections.length} section`
                                        : "")
                                )}
                                {hovered && (
                                    <span style={{ color: "#10b981", marginLeft: 8 }}>
                                        {hovered.kind === "box" && `· "${activeResult?.boxes?.[hovered.idx]?.text}"`}
                                        {hovered.kind === "field_anchor" && `· anchor: ${activeResult?.fields?.[hovered.idx]?.field_name}`}
                                        {hovered.kind === "field_value"  && `· value: ${activeResult?.fields?.[hovered.idx]?.field_name}`}
                                        {hovered.kind === "table_anchor"    && `· table: ${activeResult?.tables?.[hovered.idx]?.table_name}`}
                                        {hovered.kind === "table_area"      && `· area: ${activeResult?.tables?.[hovered.idx]?.table_name}`}
                                        {hovered.kind === "table_col"       && `· col: ${activeResult?.tables?.[hovered.tableIdx]?.columns?.[hovered.colIdx]?.name}`}
                                        {hovered.kind === "sec_anchor"      && `· section: ${activeResult?.repeating_sections?.[hovered.secIdx]?.section_name}`}
                                        {hovered.kind === "sec_field_anchor"&& `· sec field: ${activeResult?.repeating_sections?.[hovered.secIdx]?.fields?.[hovered.fieldIdx]?.field_name}`}
                                        {hovered.kind === "sec_field_value" && `· sec value: ${activeResult?.repeating_sections?.[hovered.secIdx]?.fields?.[hovered.fieldIdx]?.field_name}`}
                                        {hovered.kind === "sec_table_anchor"&& `· sec table: ${activeResult?.repeating_sections?.[hovered.secIdx]?.tables?.[hovered.tableIdx]?.table_name}`}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Image + overlay */}
                        <div style={{ padding: 20, overflowX: "auto" }}>
                            <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                                <img ref={imgRef} src={imageUrl} alt="Document"
                                    onLoad={handleImgLoad}
                                    style={{ display: "block", maxWidth: "100%", height: "auto",
                                        borderRadius: 8, opacity: loading ? 0.45 : 1, transition: "opacity 300ms" }} />

                                {/* SVG overlay */}
                                {activeResult && imgSize.w > 0 && (
                                    <svg style={{ position: "absolute", top: 0, left: 0,
                                        width: imgSize.w, height: imgSize.h, pointerEvents: "none" }}
                                        viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}>
                                        {mode === "paddle" ? (
                                            <PaddleOverlay
                                                boxes={activeResult.boxes ?? []}
                                                scaleX={scaleX} scaleY={scaleY}
                                                showLabels={showLabels}
                                                hovered={hovered} onHover={setHovered} />
                                        ) : (
                                            <TemplateMappingOverlay
                                                fields={activeResult.fields ?? []}
                                                tables={activeResult.tables ?? []}
                                                repeatingSections={activeResult.repeating_sections ?? []}
                                                scaleX={scaleX} scaleY={scaleY}
                                                showLabels={showLabels}
                                                hovered={hovered} onHover={setHovered} />
                                        )}
                                    </svg>
                                )}

                                {/* Tooltip */}
                                {tooltip && (
                                    <div style={{ position: "absolute", top: tooltip.y, left: tooltip.x,
                                        background: "#1a1a1a", border: `1px solid ${tooltip.color}44`,
                                        borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#f5f5f5",
                                        pointerEvents: "none", zIndex: 20, minWidth: 180, maxWidth: 260,
                                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)", lineHeight: 1.6 }}>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: tooltip.color, marginBottom: 4 }}>
                                            {tooltip.title}
                                        </div>
                                        {tooltip.lines.map((l, i) => (
                                            <div key={i} style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11 }}>{l}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Loading overlay */}
                                {loading && (
                                    <div style={{ position: "absolute", inset: 0, display: "flex",
                                        alignItems: "center", justifyContent: "center",
                                        background: "rgba(10,10,10,0.65)", borderRadius: 8 }}>
                                        <span style={{ color: "#10b981", fontSize: 14, fontWeight: 600 }}>Scanning…</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Legend */}
                        {renderLegend()}
                    </div>
                )}

                {/* ── Details table ── */}
                {renderDetailsTable()}

                {/* ── Empty state ── */}
                {!imageUrl && !loading && !error && (
                    <div style={{ background: "#111111", border: "1px solid #2a2a2a", borderRadius: 16,
                        padding: "60px 24px", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 12, color: "#555" }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>
                            {mode === "paddle"
                                ? "Pilih dokumen lalu klik Scan OCR"
                                : "Pilih dokumen + template lalu klik Scan Template"}
                        </p>
                        <p style={{ fontSize: 12, color: "#444" }}>
                            {documents.length === 0
                                ? "Belum ada dokumen yang selesai diproses."
                                : `${documents.length} dokumen · ${templates.length} template tersedia`}
                        </p>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
