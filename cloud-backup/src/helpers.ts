import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

// ── Serialization ─────────────────────────────────────────────────────────────
export function serializeValue(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, serializeValue(x)]),
    );
  }
  return v;
}

// ── Flatten (one level, nested → JSON string) ─────────────────────────────────
export function flattenDoc(doc: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue; }
    out[k] = JSON.stringify(v);
  }
  return out;
}

// ── CSV (RFC-4180) ────────────────────────────────────────────────────────────
export function buildCsv(rows: Record<string, unknown>[]): Buffer {
  if (!rows.length) return Buffer.from('_id,_path,_status\n,,empty\n', 'utf-8');
  const flat = rows.map(r => flattenDoc(r as Record<string, unknown>));
  const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...flat.map(r => headers.map(h => escape(r[h])).join(','))];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ── XLSX sheet ────────────────────────────────────────────────────────────────
export function buildSheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  if (!rows.length) {
    const ws = XLSX.utils.aoa_to_sheet([['_id', '_path', '_status'], ['', '', 'empty']]);
    styleHeader(ws, ['_id', '_path', '_status']);
    return ws;
  }
  const flat = rows.map(r => flattenDoc(r as Record<string, unknown>));
  const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
  const aoa = [headers, ...flat.map(r => headers.map(h => r[h] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  styleHeader(ws, headers);
  ws['!cols'] = headers.map(h => {
    const maxData = flat.reduce((m, r) => Math.max(m, String(r[h] ?? '').length), 0);
    return { wch: Math.min(Math.max(h.length, maxData, 8), 60) };
  });
  return ws;
}

function styleHeader(ws: XLSX.WorkSheet, headers: string[]) {
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } } };
  }
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
}

export function sheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31);
}
