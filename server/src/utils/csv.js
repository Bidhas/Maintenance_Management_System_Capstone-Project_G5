function cell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) v = v.toISOString();
  let s = String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ header, value: (row) => any }] */
function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n');
}

module.exports = { toCsv };
