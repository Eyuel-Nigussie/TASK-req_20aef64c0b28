'use strict';

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const rows = [];
  const src = String(text || '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  for (const line of lines) {
    if (line === '') continue;
    rows.push(parseLine(line));
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows.shift().map((h) => h.trim());
  const out = rows.map((r) => {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) obj[headers[i]] = (r[i] || '').trim();
    return obj;
  });
  return { headers, rows: out };
}

// CSV-injection (aka "formula injection") hardening: spreadsheet clients treat
// cells that begin with =, +, -, @, or a tab/CR character as formulas and will
// eagerly execute them. Prefix with a single quote so the data is rendered as
// text instead.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeFormula(s) {
  if (FORMULA_PREFIX.test(s)) return `'${s}`;
  return s;
}

function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  const raw = typeof v === 'object' ? JSON.stringify(v) : String(v);
  const s = escapeFormula(raw);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(headers, rows) {
  const lines = [headers.map(toCsvValue).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => toCsvValue(row[h])).join(','));
  }
  return lines.join('\n');
}

module.exports = { parseCsv, buildCsv, parseLine, toCsvValue, escapeFormula };
