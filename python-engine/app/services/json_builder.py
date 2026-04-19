"""
app/services/json_builder.py
-----------------------------
Menyusun hasil ekstraksi mentah menjadi JSON terstruktur sesuai
ekspektasi output sistem IDP.

Menerima dua sumber data:
    1. fixed_results:  Hasil dari grup "fixed" (Header, Document, dll).
    2. table_results:  Hasil dari grup "dynamic_table" (Checklist, dll).

Contoh output akhir:
{
    "document": { "no_dok": "...", "versi": "..." },
    "header": { "location": "...", "date_time": "..." },
    "checklist": [
        {
            "no": 1,
            "category": "Visual Check",
            "items": [
                { "sub": "a", "description": "...", "result": "...", "status": "..." }
            ]
        }
    ],
    "pelaksana": [...],
    "mengetahui": {},
    "notes": {}
}
"""

from typing import Any


def build_hierarchical_json(
    fixed_results: list[dict],
    table_results: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Susun hasil ekstraksi dari semua grup menjadi JSON terstruktur.

    Args:
        fixed_results:  List hasil grup "fixed". Setiap item berisi
                        { group_type, group_key, group_name, fields: [...] }.
        table_results:  List hasil grup "dynamic_table". Setiap item berisi
                        { group_type, group_key, group_name, data: [...] }.

    Returns:
        Dict JSON terstruktur lengkap.
    """
    if table_results is None:
        table_results = []

    final_json: dict[str, Any] = {
        "document":   {},
        "header":     {},
        "checklist":  [],
        "notes":      {},
        "pelaksana":  [],
        "mengetahui": {},
        "copyright":  "©HakCipta PT. APLIKANUSA LINTASARTA, Indonesia",
        "form_reference": "",
    }

    # ══════════════════════════════════════════════════════════════
    # BAGIAN 1: Proses Grup Fixed
    # ══════════════════════════════════════════════════════════════
    for group in fixed_results:
        g_key  = group.get("group_key", "")
        g_name = group.get("group_name", "")

        # Tentukan target node di JSON akhir berdasarkan group_key
        # Jika group_key ada di final_json (document, header, notes, dll), gunakan itu.
        # Jika tidak, buat key baru.
        if g_key in final_json and isinstance(final_json[g_key], dict):
            target_node = final_json[g_key]
        else:
            final_json[g_key] = {}
            target_node = final_json[g_key]

        for field in group.get("fields", []):
            field_key = field.get("field_key", "")
            if not field_key:
                continue

            extracted = field.get("extracted_values", {})

            # Untuk grup fixed, ambil nilai pertama dari extracted_values
            # (biasanya key "result" atau key pertama yang ada)
            if "result" in extracted:
                target_node[field_key] = extracted["result"]
            elif extracted:
                # Ambil nilai pertama apapun yang ada
                target_node[field_key] = next(iter(extracted.values()), "")
            else:
                target_node[field_key] = ""

    # ══════════════════════════════════════════════════════════════
    # BAGIAN 2: Proses Grup Pelaksana (List/Array)
    # ══════════════════════════════════════════════════════════════
    # Pelaksana ditangani khusus karena merupakan array of objects
    pelaksana_group = next(
        (g for g in fixed_results if g.get("group_key") == "pelaksana"),
        None
    )
    if pelaksana_group:
        pelaksana_data: dict[int, dict[str, Any]] = {}
        for field in pelaksana_group.get("fields", []):
            field_key = field.get("field_key", "")  # Contoh: "nama_1", "dept_2"
            extracted_val = ""
            ev = field.get("extracted_values", {})
            if ev:
                extracted_val = ev.get("result", next(iter(ev.values()), ""))

            # Parse index dari akhir key (nama_1 → index 0, nama_2 → index 1)
            parts = field_key.rsplit("_", 1)
            if len(parts) == 2 and parts[1].isdigit():
                base_key = parts[0]
                idx = int(parts[1]) - 1
            else:
                base_key = field_key
                idx = 0

            if idx not in pelaksana_data:
                pelaksana_data[idx] = {"no": idx + 1}
            pelaksana_data[idx][base_key] = extracted_val

        # Susun sebagai list yang terurut
        if pelaksana_data:
            final_json["pelaksana"] = [
                pelaksana_data[i]
                for i in sorted(pelaksana_data.keys())
            ]

    # ══════════════════════════════════════════════════════════════
    # BAGIAN 3: Proses Grup Dynamic Table → Checklist
    # ══════════════════════════════════════════════════════════════
    for group in table_results:
        g_key = group.get("group_key", "checklist")
        data  = group.get("data", [])

        if g_key == "checklist" or g_key.startswith("checklist"):
            # Data sudah berformat list of category dict dari table_extractor.py
            # Format: [{ no, category, items: [...] }]
            final_json["checklist"].extend(data)
        else:
            # Grup tabel dengan key custom — tambahkan sebagai key baru
            if g_key not in final_json:
                final_json[g_key] = []
            final_json[g_key].extend(data)

    # ══════════════════════════════════════════════════════════════
    # BAGIAN 4: Normalisasi — Pastikan field wajib selalu ada
    # ══════════════════════════════════════════════════════════════
    # Checklist harus sudah terurut berdasarkan no. kategori
    if final_json["checklist"]:
        try:
            final_json["checklist"].sort(key=lambda c: c.get("no", 0))
        except (TypeError, AttributeError):
            pass  # Abaikan jika tidak bisa di-sort

    return final_json
