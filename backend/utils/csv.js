/**
 * csv.js — tiny CSV writer (no dependency). Output starts with a UTF-8 BOM so Excel opens it correctly.
 * Cells starting with = + - @ are prefixed with ' so a malicious value cannot run as a spreadsheet formula.
 */
const cell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** columns: [{ header, value: (row) => any }] */
const toCsv = (columns, rows) => {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => cell(c.value(r))).join(',')));
  return `\ufeff${lines.join('\r\n')}\r\n`;
};

const sendCsv = (res, filename, columns, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
};

module.exports = { toCsv, sendCsv, cell };
