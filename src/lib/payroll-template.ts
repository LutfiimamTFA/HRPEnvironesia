/**
 * Payroll Excel template support — reads a Super-Admin-uploaded .xlsx
 * template's sheet names, and fills employee payroll rows into the sheet a
 * brand/payroll group is mapped to, preserving the template's own styling
 * (merges, borders, fonts, fills, column widths, row heights) rather than
 * writing into a blank sheet.
 *
 * Deliberately does NOT guess a brand's template from its name — mapping is
 * always explicit (brands/{id}.payrollTemplateId/payrollSheetName, or via a
 * Payroll Group), set by Super Admin in the Template Payroll admin page.
 *
 * Uses ExcelJS (not the plain `xlsx`/SheetJS package) specifically because
 * SheetJS's community build cannot read+rewrite cell styles reliably —
 * that was the root cause of previous exports coming out as a plain white
 * sheet with no template styling at all.
 */

import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type { PayrollRecapRow, CalendarAttendanceDetail } from './payroll-recap';
import { formatWorkMinutes } from './payroll-recap';
import { format } from 'date-fns';

/** Reads just the sheet names out of an uploaded file, without loading full cell data. */
export async function readWorkbookSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { bookSheets: true });
  return workbook.SheetNames;
}

// ─── Canonical column keys the daily-detail block can be mapped to.
// Detection is by header-cell TEXT, not by fixed row/column position, so
// this survives the template having its own title rows/merged cells above
// the header row. ────────────────────────────────────────────────────────
type ColumnKey = 'dayNumber' | 'employeeName' | 'date' | 'tapIn' | 'tapOut' | 'workHours' | 'lateness' | 'manual' | 'remark';

const HEADER_SYNONYMS: Record<ColumnKey, string[]> = {
  dayNumber: ['jumlah hari'],
  employeeName: ['nama karyawan', 'name of employee', 'nama pegawai'],
  date: ['tanggal', 'date'],
  tapIn: ['jam kehadiran', 'jam masuk'],
  tapOut: ['jam pulang', 'jam selesai'],
  workHours: ['jam kerja', 'at hour'],
  lateness: ['keterlambatan'],
  manual: ['manual'],
  remark: ['keterangan', 'noted'],
};

// ─── Rekap F&A (summary) block synonyms — a second cluster of columns to the
// right of the daily block, one row per employee instead of one row per day.
// The 4 "core" columns (no/summaryName/totalLateMinutes/totalFixLate) are the
// ones the Rekap F&A section of the template is expected to have; the rest
// are opportunistic — filled only if the template actually has that column,
// per Tahap 3's broader per-employee total list. Optional overall: if a
// template has no summary block at all, the daily fill still proceeds fine.
type SummaryColumnKey =
  | 'no' | 'summaryName' | 'totalLateMinutes' | 'totalFixLate'
  | 'totalPeriodDays' | 'totalWorkingDays' | 'totalHadir' | 'totalTerlambatCount'
  | 'totalAlpha' | 'totalIzin' | 'totalCuti' | 'totalDinas' | 'totalBelumTapOut'
  | 'totalJamAktual' | 'totalJamDiakui';

const SUMMARY_HEADER_SYNONYMS: Record<SummaryColumnKey, string[]> = {
  no: ['no'],
  summaryName: ['nama karyawan', 'name of employee', 'nama pegawai'],
  totalLateMinutes: ['total jam keterlambatan', 'jam keterlambatan'],
  totalFixLate: ['total fix keterlambatan', 'fix keterlambatan'],
  totalPeriodDays: ['total hari periode'],
  totalWorkingDays: ['total hari kerja'],
  totalHadir: ['total hadir', 'jumlah hadir', 'total hari hadir'],
  totalTerlambatCount: ['total terlambat', 'jumlah terlambat'],
  totalAlpha: ['total alpha', 'jumlah alpha'],
  totalIzin: ['total izin'],
  totalCuti: ['total cuti'],
  totalDinas: ['total dinas'],
  totalBelumTapOut: ['total belum tap out', 'belum tap out'],
  totalJamAktual: ['total jam kerja aktual', 'jam kerja aktual'],
  totalJamDiakui: ['total jam diakui payroll', 'jam diakui payroll'],
};

function normalizeHeaderText(v: any): string {
  return String(v ?? '').trim().toLowerCase();
}

function countMatches(sheet: ExcelJS.Worksheet, r: number, lastCol: number, synonyms: Record<string, string[]>): number {
  const row = sheet.getRow(r);
  const found = new Set<string>();
  for (let c = 1; c <= lastCol; c++) {
    const text = normalizeHeaderText(row.getCell(c).value);
    if (!text) continue;
    for (const [key, syns] of Object.entries(synonyms)) {
      if (found.has(key)) continue;
      if (syns.some((s) => text === s || text.includes(s))) found.add(key);
    }
  }
  return found.size;
}

export interface DetectedHeader {
  headerRow: number; // 1-indexed (ExcelJS convention) — the daily-block header row
  dataStartRow: number; // 1-indexed — first row daily data may be written into (never overwrites header rows)
  columns: Partial<Record<ColumnKey, number>>; // 1-indexed column per key
  summaryColumns: Partial<Record<SummaryColumnKey, number>>; // 1-indexed column per key, may be empty
  summaryDataStartRow: number; // 1-indexed — first row the Rekap F&A block may be written into
  maxDailyColumn: number;
}

/**
 * Scans the first N rows of a sheet for a row whose cells match >= 3 known
 * daily-block headers, then independently scans the whole sheet for the
 * Rekap F&A header row — it may sit on a different row than the daily
 * header (e.g. its own title row shifts it down by one), so it is never
 * assumed to be "the same row, further right".
 */
export function detectHeaderRow(sheet: ExcelJS.Worksheet, maxScanRows = 20): DetectedHeader | null {
  const lastRow = Math.min(sheet.rowCount || maxScanRows, maxScanRows);
  const lastCol = Math.max(sheet.columnCount || 1, 1);

  let headerRow: number | null = null;
  let columns: Partial<Record<ColumnKey, number>> = {};
  let maxDailyColumn = 0;

  for (let r = 1; r <= lastRow && headerRow == null; r++) {
    const rowColumns: Partial<Record<ColumnKey, number>> = {};
    const row = sheet.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const text = normalizeHeaderText(row.getCell(c).value);
      if (!text) continue;
      for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS) as [ColumnKey, string[]][]) {
        if (rowColumns[key] != null) continue;
        if (synonyms.some((s) => text === s || text.includes(s))) rowColumns[key] = c;
      }
    }
    if (Object.keys(rowColumns).length >= 3) {
      headerRow = r;
      columns = rowColumns;
      maxDailyColumn = Math.max(...Object.values(rowColumns).filter((v): v is number => v != null));
    }
  }

  if (headerRow == null) return null;

  // Some templates spread the header across 2 physical rows (e.g. a merged
  // "JUMLAH HARI" spanning rows 4-5 with sub-labels on row 5) — if the row
  // right after the detected header still reads like a header, data must
  // start one row further down so it never overwrites it.
  let dataStartRow = headerRow + 1;
  while (dataStartRow <= lastRow && countMatches(sheet, dataStartRow, lastCol, HEADER_SYNONYMS) >= 2) {
    dataStartRow++;
  }

  // Rekap F&A header — each column is found independently, anywhere to the
  // right of the daily block (never inside it, so the daily block's own
  // "Nama Karyawan" is never mistaken for the summary one). This does NOT
  // require all 4 core columns to live on the same physical row: some
  // templates spread a wrapped/merged header ("Total" on one line, "Jam
  // Keterlambatan" on the next) across 2 rows, which a single-row scan would
  // only ever find half of — independent per-column search fixes that.
  let summaryColumns: Partial<Record<SummaryColumnKey, number>> = {};
  let summaryHeaderRow: number | null = null;
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = maxDailyColumn + 1; c <= lastCol; c++) {
      const text = normalizeHeaderText(row.getCell(c).value);
      if (!text) continue;
      for (const [key, synonyms] of Object.entries(SUMMARY_HEADER_SYNONYMS) as [SummaryColumnKey, string[]][]) {
        if (summaryColumns[key] != null) continue;
        if (synonyms.some((s) => text === s || text.includes(s))) {
          summaryColumns[key] = c;
          summaryHeaderRow = summaryHeaderRow == null ? r : Math.max(summaryHeaderRow, r);
        }
      }
    }
  }
  // Require at least the keterlambatan-specific signal — otherwise a stray
  // "No" column somewhere unrelated could be mistaken for this block.
  if (summaryColumns.totalLateMinutes == null && summaryColumns.totalFixLate == null) {
    summaryColumns = {};
    summaryHeaderRow = null;
  }

  let summaryDataStartRow = summaryHeaderRow != null ? summaryHeaderRow + 1 : dataStartRow;
  while (
    summaryHeaderRow != null &&
    summaryDataStartRow <= lastRow &&
    countMatches(sheet, summaryDataStartRow, lastCol, SUMMARY_HEADER_SYNONYMS) >= 2
  ) {
    summaryDataStartRow++;
  }

  return { headerRow, dataStartRow, columns, summaryColumns, summaryDataStartRow, maxDailyColumn };
}

// ─── "REKAP FOR FINANCE" / "FIX REKAP" — an entirely different single-brand
// template family (distinct from the multi-brand "Rekap F&A" block above).
// Detection here is fully independent of detectHeaderRow's daily/summary
// logic so it can never interfere with the Payroll Group flow that already
// works — if a sheet has no "REKAP FOR FINANCE"/"FIX REKAP" title anywhere
// (e.g. the Environesia Group template), this whole block simply finds
// nothing and fillPayrollTemplateSheet skips it, unchanged behavior. ───────
type FinanceColumnKey = 'no' | 'name' | 'totalJam' | 'selisih';

const FINANCE_HEADER_SYNONYMS: Record<FinanceColumnKey, string[]> = {
  no: ['no'],
  name: ['nama karyawan', 'name of employee', 'nama pegawai'],
  totalJam: ['total jam'],
  selisih: ['selisih', 'kurang jam'],
};

export interface FinanceSection {
  columns: Partial<Record<FinanceColumnKey, number>>;
  dataStartRow: number;
  sheet: ExcelJS.Worksheet;
  titleRow: number;
  headerRow: number;
  usedFallbackColumns: boolean;
}

export type FinanceDetectionResult =
  | { status: 'found'; section: FinanceSection }
  | { status: 'not-found' };

function findSectionTitleCell(sheet: ExcelJS.Worksheet, needle: string, lastRow: number, lastCol: number): { row: number; col: number } | null {
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      if (normalizeHeaderText(row.getCell(c).value).includes(needle)) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Finds one "REKAP FOR FINANCE"/"FIX REKAP"-style small table within a
 * single sheet. The section TITLE ("REKAP FOR FINANCE" / "FIX REKAP") is
 * the only thing that must exist as real text — that's the anchor proving
 * this sheet is meant to have the section at all. The NO/Nama
 * Karyawan/Total Jam sub-header is looked for by text too, but if the
 * template has it blank, merged, or worded differently, this falls back to
 * a fixed offset from the title's own column instead of failing the whole
 * export — Payroll GIG-style templates in particular are known to leave
 * this sub-header empty.
 */
function detectFinanceSectionInSheet(sheet: ExcelJS.Worksheet, titleNeedle: string, fallbackHeaderFillArgb: string): FinanceDetectionResult {
  const lastCol = Math.max(sheet.columnCount || 1, 1);
  const lastRow = Math.max(sheet.rowCount || 1, 1);
  const title = findSectionTitleCell(sheet, titleNeedle, lastRow, lastCol);
  if (title == null) return { status: 'not-found' };

  let headerRow: number | null = null;
  let columns: Partial<Record<FinanceColumnKey, number>> = {};
  // The header can be a fair way below the title (spacer/description rows in
  // between are common), so the search window is generous rather than
  // assuming it's immediately below.
  for (let r = title.row; r <= Math.min(title.row + 15, lastRow); r++) {
    const rowColumns: Partial<Record<FinanceColumnKey, number>> = {};
    const row = sheet.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const text = normalizeHeaderText(row.getCell(c).value);
      if (!text) continue;
      for (const [key, synonyms] of Object.entries(FINANCE_HEADER_SYNONYMS) as [FinanceColumnKey, string[]][]) {
        if (rowColumns[key] != null) continue;
        if (synonyms.some((s) => text === s || text.includes(s))) rowColumns[key] = c;
      }
    }
    // Require both name and totalJam so an unrelated "No" column elsewhere is never mistaken for this section.
    if (rowColumns.name != null && rowColumns.totalJam != null) {
      headerRow = r;
      columns = rowColumns;
      break;
    }
  }

  let usedFallbackColumns = false;
  if (headerRow == null) {
    // Fallback: the sub-header couldn't be read as text (blank/merged/
    // different wording) — anchor purely off the title's own column instead
    // of failing. NO right at the title's column, Nama Karyawan next, Total
    // Jam after that; a synthetic label row is written 1 row below the
    // title so the sheet still reads correctly even though the template
    // itself didn't label these columns.
    usedFallbackColumns = true;
    headerRow = title.row + 1;
    columns = { no: title.col, name: title.col + 1, totalJam: title.col + 2 };
    const labelRow = sheet.getRow(headerRow);
    const noCell = labelRow.getCell(columns.no!);
    const nameCell = labelRow.getCell(columns.name!);
    const jamCell = labelRow.getCell(columns.totalJam!);
    if (!noCell.value) noCell.value = 'NO';
    if (!nameCell.value) nameCell.value = 'Nama Karyawan';
    if (!jamCell.value) jamCell.value = 'Total Jam';
    for (const cell of [noCell, nameCell, jamCell]) {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fallbackHeaderFillArgb } };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    }
    labelRow.commit();
    // Widen columns so "Nama Karyawan" and the header labels never render
    // clipped — only ever grows a column, never shrinks one the template
    // already sized deliberately.
    const noCol = sheet.getColumn(columns.no!);
    const nameCol = sheet.getColumn(columns.name!);
    const jamCol = sheet.getColumn(columns.totalJam!);
    noCol.width = Math.max(noCol.width || 0, 8);
    nameCol.width = Math.max(nameCol.width || 0, 32);
    jamCol.width = Math.max(jamCol.width || 0, 16);
  }

  let dataStartRow = headerRow + 1;
  if (!usedFallbackColumns) {
    while (dataStartRow <= lastRow + 50 && countMatches(sheet, dataStartRow, lastCol, FINANCE_HEADER_SYNONYMS) >= 2) {
      dataStartRow++;
    }
  }

  return { status: 'found', section: { columns, dataStartRow, sheet, titleRow: title.row, headerRow, usedFallbackColumns } };
}

/**
 * Looks for a "REKAP FOR FINANCE"/"FIX REKAP" section first on `primarySheet`
 * (the sheet the brand is actually mapped to), then falls back to every
 * other sheet in the workbook — some single-company templates keep these
 * sections on a separate tab from the daily detail sheet.
 */
function detectFinanceSection(workbook: ExcelJS.Workbook, primarySheet: ExcelJS.Worksheet, titleNeedle: string, fallbackHeaderFillArgb: string): FinanceDetectionResult {
  const primaryResult = detectFinanceSectionInSheet(primarySheet, titleNeedle, fallbackHeaderFillArgb);
  if (primaryResult.status !== 'not-found') return primaryResult;
  for (const ws of workbook.worksheets) {
    if (ws === primarySheet) continue;
    const result = detectFinanceSectionInSheet(ws, titleNeedle, fallbackHeaderFillArgb);
    if (result.status !== 'not-found') return result;
  }
  return { status: 'not-found' };
}

/** "176:00:00" / "-005:00:00" style — signed hours:minutes:seconds, hours zero-padded to `padHours` digits when given. */
function formatHms(totalMinutesSigned: number, padHours?: number): string {
  const negative = totalMinutesSigned < 0;
  const abs = Math.round(Math.abs(totalMinutesSigned));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const hoursStr = padHours ? String(hours).padStart(padHours, '0') : String(hours);
  return `${negative ? '-' : ''}${hoursStr}:${String(minutes).padStart(2, '0')}:00`;
}

/** Decimal hours, e.g. 175.833333 — for FIX REKAP's numeric Total Jam column. Written as a real number so Excel renders it per the user's own locale (comma or dot). */
function toDecimalHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 1e6) / 1e6;
}

/** Finds the title cell (containing the word "payroll") above the header row, along with its row number. */
function findTitleCell(sheet: ExcelJS.Worksheet, headerRow: number): { cell: ExcelJS.Cell; row: number; col: number } | null {
  for (let r = 1; r < headerRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= (sheet.columnCount || 20); c++) {
      const cell = row.getCell(c);
      const text = normalizeHeaderText(cell.value);
      if (text.includes('payroll')) return { cell, row: r, col: c };
    }
  }
  return null;
}

/**
 * Shifts every merged range whose top row is at/after `fromRow` down by
 * `count` rows. Must run BEFORE the destination rows receive new content
 * (see insertBlankRowsBefore) — exceljs refuses plain cell writes on a cell
 * that's already part of a merge, so merges are only re-established at the
 * new position after the row content copy is done.
 */
function shiftMergesDown(sheet: ExcelJS.Worksheet, fromRow: number, count: number): string[] {
  const merges = [...(((sheet as any).model?.merges as string[] | undefined) ?? [])];
  const toReapply: string[] = [];
  for (const rangeStr of merges) {
    const m = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const [, c1, r1s, c2, r2s] = m;
    const r1 = parseInt(r1s, 10);
    const r2 = parseInt(r2s, 10);
    if (r1 >= fromRow) {
      try { sheet.unMergeCells(rangeStr); } catch { /* already unmerged */ }
      toReapply.push(`${c1}${r1 + count}:${c2}${r2 + count}`);
    }
  }
  return toReapply;
}

/**
 * Inserts `count` blank rows directly above `beforeRow` WITHOUT using
 * ExcelJS's built-in spliceRows — that corrupted merged cells in an earlier
 * version of this fill (causing the table/Rekap F&A header to visually
 * duplicate). This manually copies every row at/after `beforeRow` down by
 * `count` (bottom-to-top, so nothing is overwritten before it's read),
 * re-establishes merges at their shifted position, then clears the now
 * vacated rows so they're ready for metadata.
 */
function insertBlankRowsBefore(sheet: ExcelJS.Worksheet, beforeRow: number, count: number) {
  if (count <= 0) return;
  const lastRow = Math.max(sheet.rowCount, beforeRow);
  const lastCol = Math.max(sheet.columnCount, 1);

  for (let r = lastRow; r >= beforeRow; r--) {
    const src = sheet.getRow(r);
    const dest = sheet.getRow(r + count);
    dest.height = src.height;
    for (let c = 1; c <= lastCol; c++) {
      const srcCell = src.getCell(c);
      const destCell = dest.getCell(c);
      destCell.value = srcCell.value;
      destCell.style = JSON.parse(JSON.stringify(srcCell.style));
    }
    dest.commit();
  }

  const shiftedMerges = shiftMergesDown(sheet, beforeRow, count);
  for (const range of shiftedMerges) {
    try { sheet.mergeCells(range); } catch { /* range already merged as part of the copy above */ }
  }

  for (let r = beforeRow; r < beforeRow + count; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.style = {};
    }
    row.commit();
  }
}

/** "105 menit" style — for the raw lateness minutes column. */
function formatLateMinutesPlain(minutes: number): string {
  return `${minutes || 0} menit`;
}

/** "1 jam 45 menit" / "0 jam" style — verbose hour+minute breakdown for Total Fix Keterlambatan. */
function formatFixLate(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 jam';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}

/** One employee-day row shaped for the template, keyed the same way as detectHeaderRow's ColumnKey. */
export interface PayrollTemplateDayRow {
  dayNumber: number;
  employeeName: string;
  date: string; // formatted display date
  tapIn: string;
  tapOut: string;
  workHours: string; // formatted, e.g. "5j 16m" or "-"
  lateness: string; // e.g. "104" or "-"
  manual: string; // manual correction note, if any
  remark: string; // short KETERANGAN label — see shortenRemark()
}

/**
 * Collapses the long, multi-clause payroll remark (meant for the website's
 * detail view) down to a short, single label fit for one Excel cell — full
 * detail stays available on the website, never stacked into the sheet.
 */
function shortenRemark(day: CalendarAttendanceDetail, lateMinutes: number | null): string {
  const status = day.status;

  if (status === 'Belum Berjalan') return 'Belum Berjalan';
  if (status === 'Akhir Pekan') return 'Akhir Pekan';
  if (status.includes('Libur Nasional')) return 'Libur Nasional';
  if (status.includes('Cuti Bersama')) return 'Cuti Bersama';
  if (status.includes('Libur Perusahaan')) return 'Libur Perusahaan';
  if (status === 'Cuti') return 'Cuti';
  if (status === 'Izin') return 'Izin';
  if (status.startsWith('Dinas')) return status.includes('Terlambat') ? 'Dinas + Terlambat' : 'Dinas';
  if (status === 'Alpha') return 'Alpha';
  if (status === 'Belum Tap In') return 'Belum Tap In';

  // Attendance-based days (Terlambat / Tepat Waktu) — build from the same
  // structured signals Monitoring Absensi uses, just kept to short tags.
  const parts: string[] = [];
  if (lateMinutes) parts.push(`Terlambat ${lateMinutes}m`);
  if (!day.tapOutTime) parts.push('Belum Tap Out');
  const locationFlag = day.locationValidationStatus
    && !['Valid Otomatis', 'Radius Sesuai', 'Jalan Cocok'].includes(day.locationValidationStatus);
  if (locationFlag) parts.push('Lokasi Review');
  if (day.conditionCategory) parts.push('Ada Kondisi');
  if (day.hrdReviewStatus === 'needs_review' && day.tapOutTime) parts.push('Perlu Catatan HRD');

  if (parts.length === 0) return 'Hadir';
  if (parts.length === 1) return parts[0];
  if (parts.some((p) => p.startsWith('Terlambat')) && parts.includes('Ada Kondisi')) return 'Terlambat + Kondisi';
  if (parts.includes('Belum Tap Out') && parts.includes('Lokasi Review')) return 'Tap Out + Review';
  return parts.slice(0, 2).join(' + ');
}

/** Builds the per-day rows for one employee from their PayrollRecapRow, in the shape the template filler expects. */
export function buildPayrollTemplateDayRows(row: PayrollRecapRow): PayrollTemplateDayRow[] {
  return row.calendarDetails.map((d, i) => {
    const lateMinutes = row.lateDetails.find((l) => l.date === d.date)?.lateMinutes ?? null;
    return {
      dayNumber: i + 1,
      employeeName: row.fullName,
      date: format(new Date(d.date), 'dd/MM/yyyy'),
      tapIn: d.tapInTime || '-',
      tapOut: d.tapOutTime || '-',
      workHours: d.workMinutes != null ? formatWorkMinutes(d.workMinutes) : '-',
      lateness: lateMinutes != null ? String(lateMinutes) : '-',
      manual: d.payrollIsFinal ? '' : 'Belum final — perlu catatan HRD',
      remark: shortenRemark(d, lateMinutes),
    };
  });
}

// Color is reserved for the KETERANGAN cell of conditions that actually need
// HRD/Finance's attention — never applied to the rest of the row (name, tap
// in/out, day number, etc.), and a normal/complete day gets NO fill at all
// (stays whatever plain white the sheet already is). Order matters: more
// specific/urgent conditions are checked first so a combo like
// "Terlambat + Kondisi" gets the late color, not a generic one.
const REMARK_COLOR: Array<{ test: (remark: string) => boolean; argb: string }> = [
  { test: (r) => r.startsWith('Terlambat'), argb: 'FFFFEDD5' }, // soft orange
  { test: (r) => r.startsWith('Belum Tap Out') || r === 'Lokasi Review' || r === 'Tap Out + Review', argb: 'FFFEF9C3' }, // soft yellow
  { test: (r) => r === 'Izin' || r === 'Cuti' || r.startsWith('Dinas'), argb: 'FFE0E7FF' }, // soft blue/purple
  { test: (r) => r === 'Alpha', argb: 'FFFEE2E2' }, // soft red
  { test: (r) => r === 'Libur Nasional' || r === 'Cuti Bersama', argb: 'FFFCE7F3' }, // soft pink
  { test: (r) => r === 'Akhir Pekan' || r === 'Belum Berjalan', argb: 'FFF8FAFC' }, // near-invisible soft gray
];

function remarkFillColor(remark: string): string | null {
  const hit = REMARK_COLOR.find((r) => r.test(remark));
  return hit?.argb ?? null;
}

const NO_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'none' };

/**
 * Copies border/font/alignment/numberFormat/protection from one cell to
 * another — deliberately NEVER copies fill (background color). Body/data
 * columns must default to plain white regardless of what the template's
 * sample row happens to have, so only the KETERANGAN cell (and the TOTAL
 * row) ever gets an explicit color, set separately by the caller.
 */
function copyCellStyle(from: ExcelJS.Cell, to: ExcelJS.Cell) {
  to.font = from.font ? { ...from.font } : to.font;
  to.border = from.border ? { ...from.border } : to.border;
  to.alignment = from.alignment ? { ...from.alignment } : to.alignment;
  to.numFmt = from.numFmt;
  if (from.protection) to.protection = { ...from.protection };
  to.fill = NO_FILL;
}

export interface PayrollTemplateEmployee {
  row: PayrollRecapRow;
  days: PayrollTemplateDayRow[];
}

/**
 * Fills a brand/payroll-group's employees into the sheet named `sheetName`
 * inside `workbook`:
 *  - the title cell (any cell above the header containing "payroll") is
 *    rewritten with `periodTitle` + period range + export timestamp (one
 *    cell, multiple lines), keeping its original style;
 *  - each employee's daily rows are written starting at the template's own
 *    detected data-start row (never inside the header, even for multi-row
 *    headers) — every column copies border/font/alignment/numFmt from the
 *    template's sample row but NEVER its fill, so the default is always
 *    plain white; only the KETERANGAN cell gets an explicit soft color, and
 *    only for statuses that actually need attention;
 *  - a bold "TOTAL <NAME>" row (soft green) follows each employee's block
 *    with their accumulated stats, then one blank spacer row before the
 *    next employee — this is the separator, not a border;
 *  - if the template has a Rekap F&A column cluster (detected independently,
 *    anywhere in the sheet — its header may not share the daily block's
 *    row), one row per employee is written there with NO/Nama/Total Jam
 *    Keterlambatan/Total Fix Keterlambatan (+ any other recognized totals),
 *    followed by a grand-total block below it — skipped gracefully if the
 *    template has no such columns.
 * Other sheets and every row/cell not part of this fill are left untouched.
 */
export interface PayrollTemplateMeta {
  /** e.g. "PAYROLL JULI 2026" — dynamic, never hardcoded. */
  periodTitle: string;
  /** e.g. "19 Juni 2026 - 20 Juli 2026". */
  periodRangeLabel?: string;
  /** e.g. "Juli 2026". */
  monthPayrollLabel?: string;
  /** Real Asia/Jakarta timestamp at export time, e.g. "10 Juli 2026, 08:35 WIB". */
  exportedAtLabel?: string;
  /**
   * Full list of brand/PT names being exported on this sheet — e.g.
   * ["PT Environesia Global Saraya"] or ["GreenSkill ID", "LSP Praktisi
   * Lingkungan Indonesia", "PT Bikin Indonesia Berdaya", "PT Environesia
   * Global Saraya"]. Never pre-joined/shortened by the caller — the layout
   * (single "Perusahaan: <name>" line vs. a count line + wrapped list row)
   * is decided here based on how many there are.
   */
  companyNames?: string[];
  /** Set only when the brands being filled belong to one Payroll Group. */
  payrollGroupLabel?: string;
}

/**
 * Keeps every line if there's room; otherwise merges the lowest-priority
 * (last) lines into the previous one with " | " until it fits — used so the
 * NUMBER of metadata lines never exceeds the blank rows the template
 * actually left between the title and the table header (no row is ever
 * inserted). Never shortens the text of a line itself — long lines are
 * handled by wrapping + growing that row's height instead.
 */
function condenseToFit(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0) return [];
  const result = lines.slice();
  while (result.length > maxLines) {
    const dropped = result.pop()!;
    result[result.length - 1] = `${result[result.length - 1]}  |  ${dropped}`;
  }
  return result;
}

/** Rough estimate of how many wrapped lines `text` needs across `spanCols` columns of the sheet's actual width, so the row can be grown to fit instead of clipping or spilling over. */
function estimateWrappedRowHeight(sheet: ExcelJS.Worksheet, col: number, text: string, spanCols = 1): number {
  let totalWidthChars = 0;
  for (let c = col; c < col + spanCols; c++) totalWidthChars += sheet.getColumn(c).width || 12;
  const charsPerLine = Math.max(20, Math.round(totalWidthChars * 1.3));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.max(15, lines * 14);
}

function numberToColLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function colLetterToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * If (rowNum, colNum) falls inside an existing multi-cell merge, unmerges
 * it. Writing per-employee values into consecutive rows that are secretly
 * part of one vertical merge is what makes Excel display only the first
 * employee and hide the rest — this guards every finance-section cell write
 * against that.
 */
function unmergeIfNeeded(sheet: ExcelJS.Worksheet, rowNum: number, colNum: number) {
  const merges = [...(((sheet as any).model?.merges as string[] | undefined) ?? [])];
  for (const rangeStr of merges) {
    const m = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const [, c1, r1s, c2, r2s] = m;
    const col1 = colLetterToNumber(c1);
    const col2 = colLetterToNumber(c2);
    const row1 = parseInt(r1s, 10);
    const row2 = parseInt(r2s, 10);
    const isMultiCell = row1 !== row2 || col1 !== col2;
    if (isMultiCell && rowNum >= row1 && rowNum <= row2 && colNum >= col1 && colNum <= col2) {
      try { sheet.unMergeCells(rangeStr); } catch { /* already unmerged */ }
      return;
    }
  }
}

/**
 * Picks the most meaningful "actual worked minutes" figure available for an
 * employee, so Total Jam never shows a bare 0 just because the payroll-
 * approved figure happens to still be pending — same underlying data as the
 * Rekap Absensi Payroll website, just tried in priority order.
 */
function pickActualMinutes(row: PayrollRecapRow): number {
  if (row.jamDiakuiPayrollMinutes > 0) return row.jamDiakuiPayrollMinutes;
  if (row.jamAktualMinutes > 0) return row.jamAktualMinutes;
  if (row.totalJamKerja > 0) return row.totalJamKerja;
  return 0;
}

export function fillPayrollTemplateSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  employees: PayrollTemplateEmployee[],
  meta: PayrollTemplateMeta,
): { ok: true } | { ok: false; error: string } {
  if (employees.length === 0) {
    return { ok: false, error: 'Data rekap payroll untuk perusahaan ini belum tersedia.' };
  }

  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return { ok: false, error: `Sheet "${sheetName}" tidak ditemukan di template.` };

  const detected = detectHeaderRow(sheet);
  if (!detected) return { ok: false, error: `Header kolom tidak dikenali di sheet "${sheetName}".` };

  const { headerRow, columns, summaryColumns } = detected;

  // The title row gets ONLY the dynamic "PAYROLL <BULAN> <TAHUN>" line, kept
  // bold/large/centered exactly as the template had it. Everything else
  // (Payroll Group / Perusahaan / Periode Payroll / Data diambil pada) is
  // laid out as its own label+value row directly below — a clean block,
  // not one narrow cell stacking every line. Rows are inserted (via
  // insertBlankRowsBefore, which preserves merges — see that function's
  // comment for why plain spliceRows isn't used) only when the template
  // doesn't already leave enough blank space here, and only the rows
  // between the title and the table header ever move; the table header,
  // its data, and Rekap F&A are never touched by this block.
  const titleInfo = findTitleCell(sheet, headerRow);
  let dataStartRow = detected.dataStartRow;
  let summaryDataStartRow = detected.summaryDataStartRow;
  let headerRowFinal = headerRow;

  if (titleInfo) {
    type MetaRow = { label: string; value: string; isList?: boolean };
    const rows: MetaRow[] = [];
    if (meta.payrollGroupLabel) rows.push({ label: 'Payroll Group', value: meta.payrollGroupLabel });
    const companyNames = meta.companyNames ?? [];
    if (companyNames.length === 1) {
      rows.push({ label: 'Perusahaan', value: companyNames[0] });
    } else if (companyNames.length > 1) {
      rows.push({ label: 'Perusahaan', value: `${companyNames.length} perusahaan` });
      rows.push({ label: '', value: companyNames.join(', '), isList: true });
    }
    if (meta.periodRangeLabel) rows.push({ label: 'Periode Payroll', value: meta.periodRangeLabel });
    if (meta.exportedAtLabel) rows.push({ label: 'Data Diambil', value: meta.exportedAtLabel });

    // +1 for the blank spacer row required right before the table header.
    const neededRows = rows.length > 0 ? rows.length + 1 : 0;
    const availableRows = Math.max(0, headerRowFinal - titleInfo.row - 1);
    const missingRows = Math.max(0, neededRows - availableRows);
    if (missingRows > 0) {
      insertBlankRowsBefore(sheet, headerRowFinal, missingRows);
      headerRowFinal += missingRows;
      dataStartRow += missingRows;
      summaryDataStartRow += missingRows;
    }

    titleInfo.cell.value = meta.periodTitle;
    const labelCol = titleInfo.col;
    const valueCol = titleInfo.col + 1;
    const listEndCol = Math.max(valueCol, detected.maxDailyColumn);

    rows.forEach((line, i) => {
      const metaRow = sheet.getRow(titleInfo.row + 1 + i);
      if (line.isList) {
        // Merge across the value→daily-table width so the wrapped company
        // list has room to breathe instead of overflowing a single narrow
        // cell — scoped to just this one row, never touching other merges.
        const rangeStr = `${numberToColLetter(valueCol)}${metaRow.number}:${numberToColLetter(listEndCol)}${metaRow.number}`;
        try { sheet.mergeCells(rangeStr); } catch { /* already merged */ }
        const cell = metaRow.getCell(valueCol);
        cell.value = line.value;
        cell.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        metaRow.height = estimateWrappedRowHeight(sheet, valueCol, line.value, listEndCol - valueCol + 1);
      } else {
        const labelCell = metaRow.getCell(labelCol);
        labelCell.value = `${line.label} :`;
        labelCell.font = { size: 9, bold: true, color: { argb: 'FF334155' } };
        labelCell.alignment = { horizontal: 'left' };
        const valueCell = metaRow.getCell(valueCol);
        valueCell.value = line.value;
        valueCell.font = { size: 9, color: { argb: 'FF475569' } };
        valueCell.alignment = { horizontal: 'left' };
      }
      metaRow.commit();
    });
  }

  // `dataStartRow` is the template's own "sample" data row style source (it
  // is guaranteed to be below every header row, never inside them — see
  // detectHeaderRow's multi-row-header guard).
  const templateDataRow = sheet.getRow(dataStartRow);
  const dailyColumnIndexes = Object.values(columns).filter((v): v is number => v != null);

  let r = dataStartRow;
  let summaryRow = summaryDataStartRow;
  let summaryIndex = 0;

  for (const employee of employees) {
    const rowsWritten: number[] = [];

    for (const day of employee.days) {
      const targetRow = sheet.getRow(r);
      const rowData: Array<[ColumnKey, any]> = [
        ['dayNumber', day.dayNumber],
        ['employeeName', day.employeeName],
        ['date', day.date],
        ['tapIn', day.tapIn],
        ['tapOut', day.tapOut],
        ['workHours', day.workHours],
        ['lateness', day.lateness],
        ['manual', day.manual],
        ['remark', day.remark],
      ];

      for (const colIndex of dailyColumnIndexes) {
        copyCellStyle(templateDataRow.getCell(colIndex), targetRow.getCell(colIndex));
      }
      targetRow.height = templateDataRow.height;

      for (const [key, value] of rowData) {
        const col = columns[key];
        if (col == null) continue;
        const cell = targetRow.getCell(col);
        cell.value = value;
        // Color is applied ONLY to the KETERANGAN cell — every other daily
        // column stays whatever plain style copyCellStyle just set (no fill).
        if (key === 'remark') {
          const fill = remarkFillColor(String(value));
          if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
      targetRow.commit();
      rowsWritten.push(r);
      r++;
    }

    // TOTAL <NAME> row — one single row per employee, laid out per exact
    // column mapping (Tahap 5): JUMLAH HARI="TOTAL", NAMA KARYAWAN="TOTAL
    // <NAME>", TANGGAL/JAM KEHADIRAN/JAM PULANG blank, JAM KERJA=total jam
    // kerja, KETERLAMBATAN=total menit terlambat, KETERANGAN=compact summary.
    // Soft blue, bold — never the alpha/red family, so it never reads as a
    // problem row. This is the separator between employees, not a border.
    if (rowsWritten.length > 0) {
      const row = employee.row;
      const totalRow = sheet.getRow(r);
      const totalLeave = row.izin + row.cuti + row.dinas;
      const summaryParts = [
        `Hadir: ${row.hadir}`,
        `Alpha: ${row.alpha}`,
        `Telat: ${row.menitTerlambat}m`,
        `Belum Tap Out: ${row.lupaHapOut}`,
        ...(totalLeave > 0 ? [`Izin/Cuti/Dinas: ${totalLeave}`] : []),
      ];
      for (const colIndex of dailyColumnIndexes) {
        const cell = totalRow.getCell(colIndex);
        copyCellStyle(templateDataRow.getCell(colIndex), cell);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // soft blue
        cell.font = { ...(cell.font || {}), bold: true };
        cell.value = null;
      }
      if (columns.dayNumber != null) totalRow.getCell(columns.dayNumber).value = 'TOTAL';
      if (columns.employeeName != null) totalRow.getCell(columns.employeeName).value = `TOTAL ${row.fullName.toUpperCase()}`;
      if (columns.workHours != null) totalRow.getCell(columns.workHours).value = formatWorkMinutes(row.jamDiakuiPayrollMinutes);
      if (columns.lateness != null) totalRow.getCell(columns.lateness).value = row.menitTerlambat;
      if (columns.remark != null) totalRow.getCell(columns.remark).value = summaryParts.join(' | ');
      totalRow.commit();
      r++;

      // One thin, unstyled spacer row before the next employee's block.
      r++;
    }

    // Rekap F&A block — one row per employee, independent row counter from
    // the daily block above (Tahap E).
    if (Object.keys(summaryColumns).length > 0) {
      const summaryTargetRow = sheet.getRow(summaryRow);
      const summaryColIndexes = Object.values(summaryColumns).filter((v): v is number => v != null);
      for (const colIndex of summaryColIndexes) {
        copyCellStyle(templateDataRow.getCell(colIndex), summaryTargetRow.getCell(colIndex));
      }

      const row = employee.row;
      summaryIndex++;
      const summaryData: Array<[SummaryColumnKey, any]> = [
        ['no', summaryIndex],
        ['summaryName', row.fullName],
        ['totalLateMinutes', formatLateMinutesPlain(row.menitTerlambat)],
        ['totalFixLate', formatFixLate(row.menitTerlambat)],
        ['totalPeriodDays', row.calendarDetails.length],
        ['totalWorkingDays', row.hariKerja],
        ['totalHadir', row.hadir],
        ['totalTerlambatCount', row.terlambat],
        ['totalAlpha', row.alpha],
        ['totalIzin', row.izin],
        ['totalCuti', row.cuti],
        ['totalDinas', row.dinas],
        ['totalBelumTapOut', row.lupaHapOut],
        ['totalJamAktual', formatWorkMinutes(row.jamAktualMinutes)],
        ['totalJamDiakui', formatWorkMinutes(row.jamDiakuiPayrollMinutes)],
      ];
      for (const [key, value] of summaryData) {
        const col = summaryColumns[key];
        if (col == null) continue;
        summaryTargetRow.getCell(col).value = value;
      }
      summaryTargetRow.commit();
      summaryRow++;
    }
  }

  // Small explanatory note + grand total block, right below the Rekap F&A
  // rows (Tahap 7/8). There's no template row to copy a style from here
  // (this block doesn't exist in the uploaded file), so it's kept
  // deliberately plain: small italic note, then bold grand totals with a
  // thin top border to mark it off from the per-employee rows above.
  if (Object.keys(summaryColumns).length > 0 && employees.length > 0) {
    const labelCol = summaryColumns.summaryName ?? summaryColumns.no ?? Object.values(summaryColumns)[0]!;
    const valueCol = labelCol + 1;

    summaryRow += 1; // blank spacer before the note
    const noteRow1 = sheet.getRow(summaryRow);
    noteRow1.getCell(labelCol).value = 'Rekap F&A berisi akumulasi keterlambatan per karyawan dalam periode payroll.';
    noteRow1.getCell(labelCol).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    noteRow1.commit();
    summaryRow++;
    const noteRow2 = sheet.getRow(summaryRow);
    noteRow2.getCell(labelCol).value = 'Total Fix Keterlambatan adalah konversi menit keterlambatan ke format jam dan menit.';
    noteRow2.getCell(labelCol).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    noteRow2.commit();
    summaryRow++;
    const totals = {
      totalKaryawan: employees.length,
      totalHadir: employees.reduce((s, e) => s + e.row.hadir, 0),
      totalAlpha: employees.reduce((s, e) => s + e.row.alpha, 0),
      totalTerlambat: employees.reduce((s, e) => s + e.row.terlambat, 0),
      totalMenitTerlambat: employees.reduce((s, e) => s + e.row.menitTerlambat, 0),
      totalBelumTapOut: employees.reduce((s, e) => s + e.row.lupaHapOut, 0),
    };
    const grandTotalRows: Array<[string, string | number]> = [
      ['TOTAL KARYAWAN', totals.totalKaryawan],
      ['TOTAL TERLAMBAT', totals.totalTerlambat],
      ['TOTAL MENIT TERLAMBAT', `${totals.totalMenitTerlambat} menit`],
      ['TOTAL ALPHA', totals.totalAlpha],
      ['TOTAL HADIR', totals.totalHadir],
      ['TOTAL BELUM TAP OUT', totals.totalBelumTapOut],
    ];

    summaryRow += 1; // blank spacer row before the grand-total block
    let isFirstGrandTotalRow = true;
    for (const [label, value] of grandTotalRows) {
      const row = sheet.getRow(summaryRow);
      const labelCell = row.getCell(labelCol);
      const valueCell = row.getCell(valueCol);
      labelCell.value = label;
      valueCell.value = value;
      labelCell.font = { bold: true, size: 10 };
      valueCell.font = { bold: true, size: 10 };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // soft blue
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      if (isFirstGrandTotalRow) {
        labelCell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
        valueCell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
        isFirstGrandTotalRow = false;
      }
      row.commit();
      summaryRow++;
    }
  }

  // "REKAP FOR FINANCE" / "FIX REKAP" — a different, single-brand template
  // family (e.g. the 1-perusahaan HRD's template), entirely independent of
  // the Rekap F&A block above. The section TITLE is the only required
  // anchor — if it's missing entirely (e.g. the Environesia Group template),
  // this silently does nothing, unchanged from before. If the title IS
  // found but its NO/Nama Karyawan/Total Jam sub-header can't be read as
  // text (blank, merged, or worded differently — seen on Payroll GIG),
  // detectFinanceSectionInSheet falls back to a fixed column offset from
  // the title instead of failing the export.
  const rekapForFinance = detectFinanceSection(workbook, sheet, 'rekap for finance', 'FFFEF08A'); // soft yellow
  const fixRekap = detectFinanceSection(workbook, sheet, 'fix rekap', 'FFBBF7D0'); // soft green

  // Tahap 7: REKAP FOR FINANCE and FIX REKAP must start data on the SAME
  // row for the same employee — if both sections were found independently
  // and ended up with different data-start rows, align FIX REKAP to
  // REKAP FOR FINANCE's (the left/primary section) rather than trusting
  // its own possibly-mismatched detection.
  if (rekapForFinance.status === 'found' && fixRekap.status === 'found') {
    fixRekap.section.dataStartRow = rekapForFinance.section.dataStartRow;
  }

  console.log('[SINGLE_COMPANY_TEMPLATE_ANCHOR_DEBUG]', {
    sheetName,
    financeAnchor: rekapForFinance.status === 'found' ? rekapForFinance.section.titleRow : null,
    fixAnchor: fixRekap.status === 'found' ? fixRekap.section.titleRow : null,
    financeHeaderFound: rekapForFinance.status === 'found' && !rekapForFinance.section.usedFallbackColumns,
    fixHeaderFound: fixRekap.status === 'found' && !fixRekap.section.usedFallbackColumns,
    usingFallbackColumns: (rekapForFinance.status === 'found' && rekapForFinance.section.usedFallbackColumns)
      || (fixRekap.status === 'found' && fixRekap.section.usedFallbackColumns),
    financeColumns: rekapForFinance.status === 'found' ? rekapForFinance.section.columns : null,
    fixColumns: fixRekap.status === 'found' ? fixRekap.section.columns : null,
    financeDataStartRow: rekapForFinance.status === 'found' ? rekapForFinance.section.dataStartRow : null,
    fixDataStartRow: fixRekap.status === 'found' ? fixRekap.section.dataStartRow : null,
    employeeCount: employees.length,
    firstEmployeeSummary: employees[0]?.row.fullName,
  });

  if (rekapForFinance.status === 'found') {
    const { columns, dataStartRow: financeDataStartRow, sheet: financeSheet } = rekapForFinance.section;
    let row = financeDataStartRow;
    employees.forEach((employee, i) => {
      const { row: r2 } = employee;
      const actual = pickActualMinutes(r2);
      const target = r2.targetPeriodeMinutes;
      if (columns.no != null) { unmergeIfNeeded(financeSheet, row, columns.no); financeSheet.getRow(row).getCell(columns.no).value = i + 1; }
      if (columns.name != null) { unmergeIfNeeded(financeSheet, row, columns.name); financeSheet.getRow(row).getCell(columns.name).value = r2.fullName; }
      if (columns.totalJam != null) { unmergeIfNeeded(financeSheet, row, columns.totalJam); financeSheet.getRow(row).getCell(columns.totalJam).value = formatHms(actual); }
      if (columns.selisih != null) { unmergeIfNeeded(financeSheet, row, columns.selisih); financeSheet.getRow(row).getCell(columns.selisih).value = formatHms(target - actual, 3); }
      financeSheet.getRow(row).commit();
      row++;
    });
  }

  if (fixRekap.status === 'found') {
    const { columns, dataStartRow: fixDataStartRow, sheet: fixSheet } = fixRekap.section;
    let row = fixDataStartRow;
    employees.forEach((employee, i) => {
      const { row: r2 } = employee;
      const actual = pickActualMinutes(r2);
      const target = r2.targetPeriodeMinutes;
      if (columns.no != null) { unmergeIfNeeded(fixSheet, row, columns.no); fixSheet.getRow(row).getCell(columns.no).value = i + 1; }
      if (columns.name != null) { unmergeIfNeeded(fixSheet, row, columns.name); fixSheet.getRow(row).getCell(columns.name).value = r2.fullName; }
      if (columns.totalJam != null) { unmergeIfNeeded(fixSheet, row, columns.totalJam); fixSheet.getRow(row).getCell(columns.totalJam).value = toDecimalHours(actual); }
      if (columns.selisih != null) { unmergeIfNeeded(fixSheet, row, columns.selisih); fixSheet.getRow(row).getCell(columns.selisih).value = toDecimalHours(target - actual); }
      fixSheet.getRow(row).commit();
      row++;
    });
  }

  return { ok: true };
}

/** Loads an uploaded template's ArrayBuffer into a mutable ExcelJS workbook — preserves styles, merges, column widths and row heights. */
export async function loadTemplateWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

export async function writeWorkbookToBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
