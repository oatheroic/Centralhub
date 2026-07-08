// Helpers for handling multiple asset code/name pairs (Step 3)
// Stored as JSON arrays of strings in existing text columns
// asset_code / asset_name / asset_quantity / asset_unit.
// Backward compatible: if values are not JSON arrays, treat as a single item;
// missing quantity/unit default to "".

export type AssetItem = {
  code: string;
  name: string;
  quantity: string; // numeric string, optional
  unit: string;     // e.g. "เครื่อง", optional
};

// Extended item used for "old asset" in Step 1 — each item carries its own image,
// disposal method, and trade-in value.
export type OldAssetItem = {
  code: string;
  name: string;
  quantity: string;     // numeric string, required
  unit: string;         // e.g. "เครื่อง", "อัน"
  image: string;        // public URL(s), joined
  disposal: string;     // e.g. "3. ขายเทิร์น"
  tradeInValue: string; // numeric string, used when disposal is 3 or 4
  repairForm: string;   // public URL(s), joined — per-item repair form
};


function tryParseArr(v: any): string[] | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("[")) return null;
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map((x) => String(x ?? ""));
  } catch {}
  return null;
}

export function parseAssetItems(
  codeRaw: any,
  nameRaw: any,
  quantityRaw?: any,
  unitRaw?: any,
): AssetItem[] {
  const codes = tryParseArr(codeRaw);
  const names = tryParseArr(nameRaw);
  const qtys = tryParseArr(quantityRaw);
  const units = tryParseArr(unitRaw);
  if (codes || names) {
    const len = Math.max(codes?.length ?? 0, names?.length ?? 0);
    const out: AssetItem[] = [];
    for (let i = 0; i < len; i++) {
      const c = (codes?.[i] ?? "").trim();
      const n = (names?.[i] ?? "").trim();
      const q = (qtys?.[i] ?? "").trim();
      const u = (units?.[i] ?? "").trim();
      if (c || n || q || u) out.push({ code: c, name: n, quantity: q, unit: u });
    }
    return out;
  }
  const c = (codeRaw ?? "").toString().trim();
  const n = (nameRaw ?? "").toString().trim();
  const q = (quantityRaw ?? "").toString().trim();
  const u = (unitRaw ?? "").toString().trim();
  if (!c && !n && !q && !u) return [];
  return [{ code: c, name: n, quantity: q, unit: u }];
}

export function serializeAssetItems(
  items: AssetItem[],
): { code: string; name: string; quantity: string; unit: string } {
  const filtered = items
    .map((it) => ({
      code: it.code.trim(),
      name: it.name.trim(),
      quantity: (it.quantity ?? "").toString().trim(),
      unit: (it.unit ?? "").trim(),
    }))
    .filter((it) => it.code || it.name || it.quantity || it.unit);
  return {
    code: JSON.stringify(filtered.map((it) => it.code)),
    name: JSON.stringify(filtered.map((it) => it.name)),
    quantity: JSON.stringify(filtered.map((it) => it.quantity)),
    unit: JSON.stringify(filtered.map((it) => it.unit)),
  };
}


/**
 * Parse old_asset_info field. Supports:
 *   - New: JSON array of {code,name,image,disposal,tradeInValue}
 *   - Old: JSON array of {code,name}
 *   - Legacy: "code | name" or plain string
 * Legacy fallbacks (old_asset_image / asset_disposal_method / trade_in_value)
 * are merged into the first item when the JSON shape lacks per-item info.
 */
export function parseOldAssetItems(
  raw: any,
  legacy?: { image?: string | null; disposal?: string | null; tradeIn?: number | string | null; repairForm?: string | null },
): OldAssetItem[] {
  const fallbackImage = (legacy?.image ?? "").toString();
  const fallbackDisposal = (legacy?.disposal ?? "").toString();
  const fallbackTrade = legacy?.tradeIn != null ? String(legacy.tradeIn) : "";
  const fallbackRepair = (legacy?.repairForm ?? "").toString();

  let items: OldAssetItem[] = [];

  if (raw !== null && raw !== undefined) {
    const s = String(raw).trim();
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          items = arr
            .map((it: any) => ({
              code: String(it?.code ?? "").trim(),
              name: String(it?.name ?? "").trim(),
              quantity: it?.quantity != null ? String(it.quantity) : "",
              unit: String(it?.unit ?? "").trim(),
              image: String(it?.image ?? "").trim(),
              disposal: String(it?.disposal ?? "").trim(),
              tradeInValue: it?.tradeInValue != null ? String(it.tradeInValue) : "",
              repairForm: String(it?.repairForm ?? "").trim(),
            }))
            .filter((it: OldAssetItem) => it.code || it.name || it.image);
        }
      } catch {}
    } else if (s) {
      if (s.includes("|")) {
        const [c, n] = s.split("|");
        items = [{ code: (c ?? "").trim(), name: (n ?? "").trim(), quantity: "", unit: "", image: "", disposal: "", tradeInValue: "", repairForm: "" }];
      } else {
        items = [{ code: "", name: s, quantity: "", unit: "", image: "", disposal: "", tradeInValue: "", repairForm: "" }];
      }
    }
  }

  // Merge legacy single-record fallbacks into the first item if missing.
  if (items.length > 0) {
    const first = items[0];
    if (!first.image && fallbackImage) first.image = fallbackImage;
    if (!first.disposal && fallbackDisposal) first.disposal = fallbackDisposal;
    if (!first.tradeInValue && fallbackTrade) first.tradeInValue = fallbackTrade;
    if (!first.repairForm && fallbackRepair) first.repairForm = fallbackRepair;
  } else if (fallbackImage || fallbackDisposal || fallbackTrade || fallbackRepair) {
    items = [{ code: "", name: "", quantity: "", unit: "", image: fallbackImage, disposal: fallbackDisposal, tradeInValue: fallbackTrade, repairForm: fallbackRepair }];
  }

  return items;
}

export function serializeOldAssetItems(items: OldAssetItem[]): string | null {
  const filtered = items
    .map((it) => ({
      code: it.code.trim(),
      name: it.name.trim(),
      quantity: (it.quantity ?? "").toString().trim(),
      unit: (it.unit ?? "").trim(),
      image: (it.image ?? "").trim(),
      disposal: (it.disposal ?? "").trim(),
      tradeInValue: (it.tradeInValue ?? "").toString().trim(),
      repairForm: (it.repairForm ?? "").trim(),
    }))
    .filter((it) => it.code || it.name || it.image || it.disposal || it.repairForm);
  if (!filtered.length) return null;
  return JSON.stringify(filtered);
}


/** Multi-line text for read-only display, e.g. "1. CODE NAME\n2. CODE NAME". */
export function formatOldAssetItemsText(raw: any): string {
  const items = parseOldAssetItems(raw);
  if (!items.length) return "";
  return items
    .map((it, i) => {
      const parts = [it.code, it.name].filter((p) => p && p.length > 0);
      return `${i + 1}. ${parts.join(" ")}`.trim();
    })
    .join("\n");
}

// ---- Optional multi-row "หมายเหตุ" notes for Steps 4/5/6 ----
// Stored as JSON array of strings in a single text column. Backward compatible
// with plain-text legacy values.

export function parseNotes(raw: any): string[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    } catch {}
  }
  return [s];
}

export function serializeNotes(items: string[]): string | null {
  const filtered = items.map((x) => (x ?? "").trim()).filter(Boolean);
  if (!filtered.length) return null;
  return JSON.stringify(filtered);
}

// ---- Asset users (ผู้รับผิดชอบทรัพย์สิน) ----
// Stored in asset_user column. New format: JSON array of {name, department}.
// Backward compatible:
//   - plain string  "สมชาย"                  → [{name:"สมชาย", department:""}]
//   - JSON strings  ["สมชาย","สมหญิง"]       → [{name,...department:""}]
//   - JSON objects  [{name,department}, ...] → parsed directly
export type AssetUser = { name: string; department: string };

export function parseAssetUsers(raw: any): AssetUser[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr
          .map((x) => {
            if (typeof x === "string") {
              return { name: x.trim(), department: "" };
            }
            if (x && typeof x === "object") {
              return {
                name: String((x as any).name ?? "").trim(),
                department: String((x as any).department ?? "").trim(),
              };
            }
            return { name: "", department: "" };
          })
          .filter((u) => u.name.length > 0);
      }
    } catch {}
  }
  return [{ name: s, department: "" }];
}

export function serializeAssetUsers(users: AssetUser[]): string {
  const filtered = (users ?? [])
    .map((u) => ({
      name: (u?.name ?? "").trim(),
      department: (u?.department ?? "").trim(),
    }))
    .filter((u) => u.name.length > 0);
  return JSON.stringify(filtered);
}

/** Multi-line read-only text — ห้ามใช้วงเล็บ แยกแผนกเป็นบรรทัดใหม่เสมอ
 *  คนเดียว มีแผนก  → "ชื่อ\nแผนก: แผนก"
 *  คนเดียว ไม่มีแผนก → "ชื่อ"
 *  หลายคน         → "1. ชื่อ\n   แผนก: แผนก\n2. ชื่อ\n   แผนก: แผนก"
 *                    (ถ้าไม่มีแผนก ข้ามบรรทัด "แผนก:" ของคนนั้น)
 */
export function formatAssetUsersText(raw: any): string {
  const users = parseAssetUsers(raw);
  if (!users.length) return "";
  if (users.length === 1) {
    const u = users[0];
    return u.department ? `${u.name}\nแผนก: ${u.department}` : u.name;
  }
  return users
    .map((u, i) => {
      const head = `${i + 1}. ${u.name}`;
      return u.department ? `${head}\n   แผนก: ${u.department}` : head;
    })
    .join("\n");
}

/** Multi-line read-only text: single item returns as-is, multiple as "1. xxx\n2. yyy". */
export function formatNotesText(raw: any): string {
  const items = parseNotes(raw);
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  return items.map((t, i) => `${i + 1}. ${t}`).join("\n");
}
