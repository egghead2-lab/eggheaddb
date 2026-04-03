export function exportToCsv(filename, rows, columns) {
  if (!rows.length) return;
  const headers = columns.map(c => c.label);
  const csvRows = [headers.join(',')];
  rows.forEach(row => {
    const values = columns.map(c => {
      const val = typeof c.key === 'function' ? c.key(row) : row[c.key];
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    });
    csvRows.push(values.join(','));
  });
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
