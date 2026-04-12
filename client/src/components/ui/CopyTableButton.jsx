import { useState } from 'react';

/**
 * Copy a table element's content as rich text (HTML) that pastes nicely into email.
 * Wraps the table in minimal inline styles for email compatibility.
 */
export function CopyTableButton({ tableRef, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const el = tableRef?.current;
    const table = el?.tagName === 'TABLE' ? el : el?.querySelector('table');
    if (!table) return;

    // Clone and add inline styles for email
    const clone = table.cloneNode(true);
    clone.style.borderCollapse = 'collapse';
    clone.style.fontFamily = 'Arial, sans-serif';
    clone.style.fontSize = '12px';
    clone.querySelectorAll('th, td').forEach(cell => {
      cell.style.border = '1px solid #ddd';
      cell.style.padding = '6px 10px';
      cell.style.textAlign = cell.tagName === 'TH' ? 'left' : cell.style.textAlign || 'left';
    });
    clone.querySelectorAll('th').forEach(th => {
      th.style.backgroundColor = '#f5f5f5';
      th.style.fontWeight = 'bold';
    });

    const html = clone.outerHTML;
    const text = table.innerText;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback to plain text
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }
  };

  return (
    <button onClick={handleCopy} title="Copy table as formatted text"
      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
        copied ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
      } ${className}`}>
      {copied ? 'Copied!' : 'Copy Table'}
    </button>
  );
}

/**
 * Copy a text string to clipboard with visual feedback.
 */
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  return (
    <button onClick={handleCopy} title={`Copy: ${text}`}
      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
        copied ? 'text-green-600' : 'text-gray-400 hover:text-[#1e3a5f]'
      } ${className}`}>
      {copied ? 'Copied!' : label}
    </button>
  );
}
