// Deterministic roster-import helpers — no AI. Parses CSV / Excel / pasted
// tabular text, auto-guesses column mappings from header names, and splits
// name fields heuristically. Used by RosterImportModal.

import Papa from 'papaparse';
// NOTE: `xlsx` (SheetJS) is ~380KB, so it's dynamically imported inside
// parseWorkbook — it only loads when someone actually drops an Excel file,
// keeping it out of the main bundle.

// Target fields the importer can fill. `key` matches the bulk-import payload.
export const TARGET_FIELDS = [
  { key: 'full_name', label: 'Full Name', hint: 'one column with the whole name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'grade', label: 'Grade' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'notes', label: 'Notes' },
];

// Header synonyms → target key. Compared against normalized headers.
const SYNONYMS = {
  full_name: ['name', 'student', 'student name', 'studentname', 'child', 'child name', 'full name', 'fullname', 'participant', 'attendee'],
  first_name: ['first', 'first name', 'firstname', 'fname', 'given', 'given name', 'student first', 'first(student)'],
  last_name: ['last', 'last name', 'lastname', 'lname', 'surname', 'family', 'family name', 'student last'],
  grade: ['grade', 'grade level', 'gradelevel', 'gr', 'grd', 'level'],
  age: ['age', 'student age', 'yrs', 'years'],
  gender: ['gender', 'sex', 'm/f'],
  notes: ['notes', 'note', 'comments', 'comment', 'allergies', 'allergy', 'special', 'info'],
};

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
function normalizeSynonym(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Given parsed headers, return { targetKey: headerName | null } best guesses.
export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  // Build a normalized lookup of headers
  const normHeaders = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));

  for (const field of TARGET_FIELDS) {
    const syns = (SYNONYMS[field.key] || []).map(normalizeSynonym);
    // 1) exact normalized match
    let hit = normHeaders.find(h => !used.has(h.raw) && syns.includes(h.norm));
    // 2) contains match (header contains a synonym or vice-versa)
    if (!hit) {
      hit = normHeaders.find(h => !used.has(h.raw) && syns.some(s => h.norm === s || h.norm.includes(s) || s.includes(h.norm)));
    }
    if (hit) { mapping[field.key] = hit.raw; used.add(hit.raw); }
    else mapping[field.key] = null;
  }

  // If we matched a single "full_name" but also first/last, prefer the split
  // columns and drop full_name (avoids double-mapping the same data).
  if (mapping.first_name && mapping.last_name) mapping.full_name = null;

  return mapping;
}

// ── Parsing ──────────────────────────────────────────────────────

// Parse CSV or pasted text (PapaParse auto-detects delimiter, incl. tabs from
// copy-paste). Returns { headers: string[], rows: object[] }.
export function parseDelimited(text) {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => String(h).trim(),
  });
  const headers = result.meta?.fields || [];
  const rows = (result.data || []).filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''));
  return { headers, rows };
}

// Parse an Excel workbook (ArrayBuffer) — first sheet only.
// Returns { headers, rows } shaped like parseDelimited.
// Async because SheetJS is loaded on demand.
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };
  const ws = wb.Sheets[firstSheet];
  // defval keeps empty cells as '' so columns stay aligned; raw:false stringifies dates/numbers.
  const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  const rows = json.filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// ── Name heuristics ──────────────────────────────────────────────

// Modes for interpreting a single full-name column.
export const NAME_MODES = [
  { value: 'last_comma_first', label: '"Last, First"' },
  { value: 'first_last', label: '"First Last"' },
];

// Auto-detect the likely mode by sampling values. If most contain a comma,
// it's "Last, First"; otherwise "First Last".
export function detectNameMode(values) {
  const sample = values.filter(Boolean).slice(0, 20);
  if (sample.length === 0) return 'first_last';
  const commaCount = sample.filter(v => String(v).includes(',')).length;
  return commaCount >= sample.length / 2 ? 'last_comma_first' : 'first_last';
}

// Split a full-name string into { first, last } per the chosen mode.
export function splitName(value, mode) {
  const v = String(value || '').trim().replace(/\s+/g, ' ');
  if (!v) return { first: '', last: '' };

  if (mode === 'last_comma_first' && v.includes(',')) {
    const [last, ...rest] = v.split(',');
    return { first: rest.join(',').trim(), last: last.trim() };
  }
  // first_last (or comma mode with no comma present): split on the LAST space,
  // so multi-word first names ("Mary Jane Watson" → first "Mary Jane").
  const parts = v.split(' ');
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}

// ── Grade normalization ──────────────────────────────────────────

// Map a freeform grade string to the canonical grade_name values used by the
// `grade` lookup ("K", "1".."12", "PK/TK"). Returns the canonical string or
// null if it can't be confidently mapped (caller can leave grade unset).
export function normalizeGrade(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  if (/^(k|kinder|kindergarten)$/.test(raw)) return 'K';
  if (/^(pk|tk|pre-?k|transitional)/.test(raw)) return 'PK/TK';

  // pull the first number out of e.g. "3", "3rd", "grade 3", "gr3", "g-3"
  const m = raw.match(/(\d{1,2})/);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 12) return String(n);
  }

  // word forms
  const words = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8' };
  for (const [w, n] of Object.entries(words)) if (raw.includes(w)) return n;

  return null;
}

// ── Row → payload ────────────────────────────────────────────────

// Build the normalized student rows from parsed rows + the column mapping +
// the chosen name mode. Returns an array of
// { first_name, last_name, grade, age, gender, notes, _raw }.
export function buildStudents(rows, mapping, nameMode) {
  return rows.map(row => {
    let first = '';
    let last = '';
    if (mapping.first_name || mapping.last_name) {
      first = String(row[mapping.first_name] || '').trim();
      last = String(row[mapping.last_name] || '').trim();
      // If only a first-name col was mapped but it actually holds "Last, First"
      // or "First Last", still try to split it.
      if (mapping.first_name && !mapping.last_name && (first.includes(',') || first.includes(' '))) {
        const split = splitName(first, nameMode);
        first = split.first; last = split.last;
      }
    } else if (mapping.full_name) {
      const split = splitName(row[mapping.full_name], nameMode);
      first = split.first; last = split.last;
    }

    const gradeRaw = mapping.grade ? String(row[mapping.grade] || '').trim() : '';
    const ageRaw = mapping.age ? String(row[mapping.age] || '').trim() : '';

    return {
      first_name: first,
      last_name: last,
      grade: gradeRaw ? (normalizeGrade(gradeRaw) || gradeRaw) : null,
      age: ageRaw && /^\d+$/.test(ageRaw) ? parseInt(ageRaw) : null,
      gender: mapping.gender ? String(row[mapping.gender] || '').trim().charAt(0).toUpperCase() || null : null,
      notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
      _raw: row,
    };
  });
}
