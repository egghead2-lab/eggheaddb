/**
 * Flyer renderer — takes a template PDF (bytes) + field definitions + a data map
 * and returns the merged PDF bytes.
 *
 * Field positioning convention:
 *   x, y, width, height are all in PDF points, origin BOTTOM-LEFT (pdf-lib native).
 *   The editor on the client converts top-left canvas coords to this on save.
 *
 * Custom fonts: drop TTF files at server/assets/fonts/<family>.ttf (e.g. BebasNeue-Regular.ttf,
 * BebasNeue-Bold.ttf). They'll be embedded automatically when a field's font_family matches.
 * If a TTF isn't found, falls back to Helvetica / Helvetica-Bold.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const QRCode = require('qrcode');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const STANDARD_FONT_MAP = {
  Helvetica: StandardFonts.Helvetica,
  'Helvetica-Bold': StandardFonts.HelveticaBold,
  'Helvetica-Oblique': StandardFonts.HelveticaOblique,
  TimesRoman: StandardFonts.TimesRoman,
  'TimesRoman-Bold': StandardFonts.TimesRomanBold,
  Courier: StandardFonts.Courier,
};

// pdf-lib's standard fonts use WinAnsi encoding which can't render most non-ASCII
// characters. Replace common smart-typography with ASCII equivalents so user-entered
// data doesn't crash the render. Custom TTF/OTF fonts skip this.
const SMART_CHAR_MAP = {
  '\u2014': '-',  // em dash
  '\u2013': '-',  // en dash
  '\u2018': "'",  // left single quote
  '\u2019': "'",  // right single quote
  '\u201C': '"',  // left double quote
  '\u201D': '"',  // right double quote
  '\u2026': '...',// ellipsis
  '\u00A0': ' ',  // nbsp
  '\u2022': '*',  // bullet
};
function sanitizeForStandardFont(text) {
  let out = String(text);
  for (const [k, v] of Object.entries(SMART_CHAR_MAP)) {
    out = out.split(k).join(v);
  }
  // Drop anything still outside basic latin / latin-1 supplement
  out = out.replace(/[^\x00-\xFF]/g, '?');
  return out;
}

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}

function findCustomFontFile(family) {
  if (!family) return null;
  const candidates = [
    `${family}.ttf`,
    `${family}-Regular.ttf`,
    `${family}.otf`,
    `${family}-Regular.otf`,
  ];
  for (const fname of candidates) {
    const full = path.join(FONT_DIR, fname);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function buildFontResolver(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const cache = {};
  return async function resolveFont(family) {
    const key = family || 'Helvetica';
    if (cache[key]) return cache[key];
    // 1. Try custom TTF on disk
    const customPath = findCustomFontFile(key);
    if (customPath) {
      const bytes = fs.readFileSync(customPath);
      const font = await pdfDoc.embedFont(bytes, { subset: true });
      font.__isCustom = true;
      cache[key] = font;
      return font;
    }
    // 2. Fall back to standard pdf-lib font (WinAnsi-only — text needs sanitizing)
    const stdName = STANDARD_FONT_MAP[key] || STANDARD_FONT_MAP.Helvetica;
    const font = await pdfDoc.embedFont(stdName);
    font.__isCustom = false;
    cache[key] = font;
    return font;
  };
}

function fitFontSize(text, font, maxWidth, startSize, minSize = 6) {
  let size = startSize;
  while (size > minSize) {
    const width = font.widthOfTextAtSize(text, size);
    if (width <= maxWidth) return size;
    size -= 0.5;
  }
  return minSize;
}

function alignX(text, font, size, box) {
  // box: { x, y, width, height, alignment } — all numeric (callers must parseFloat first)
  const textWidth = font.widthOfTextAtSize(text, size);
  switch (box.alignment) {
    case 'center':
      return box.x + (box.width - textWidth) / 2;
    case 'right':
      return box.x + box.width - textWidth;
    default:
      return box.x;
  }
}

/**
 * Wrap text into lines that fit within maxWidth at a given font size.
 * Uses simple word-breaking. Returns array of line strings.
 */
function wrapLines(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderFlyer(templatePdfBytes, fields, data) {
  const pdfDoc = await PDFDocument.load(templatePdfBytes);
  const resolveFont = await buildFontResolver(pdfDoc);

  for (const field of fields) {
    const rawValue = data[field.field_key];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;

    const pageIndex = (field.page_number || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIndex);

    const box = {
      x: parseFloat(field.x),
      y: parseFloat(field.y),
      width: parseFloat(field.width),
      height: parseFloat(field.height),
      alignment: field.alignment || 'left',
    };

    if (field.field_type === 'text') {
      let font;
      try {
        font = await resolveFont(field.font_family);
      } catch (fontErr) {
        console.error(`[Flyer render] font load failed for "${field.font_family}", falling back to Helvetica:`, fontErr.message);
        font = await resolveFont('Helvetica');
      }
      const text = font.__isCustom ? String(rawValue) : sanitizeForStandardFont(rawValue);
      const color = hexToRgb(field.font_color || '#000000');
      let size = parseFloat(field.font_size) || 12;

      if (field.auto_shrink) {
        size = fitFontSize(text, font, box.width, size);
      }

      const lines = font.widthOfTextAtSize(text, size) <= box.width
        ? [text]
        : wrapLines(text, font, size, box.width);

      const lineHeight = size * 1.15;
      const startY = box.y + box.height - size;
      lines.forEach((line, i) => {
        if (lineHeight * (i + 1) > box.height) return;
        const lineX = alignX(line, font, size, box);
        page.drawText(line, {
          x: lineX,
          y: startY - lineHeight * i,
          size,
          font,
          color,
        });
      });
    } else if (field.field_type === 'qr_code') {
      const qrPng = await QRCode.toBuffer(String(rawValue), {
        type: 'png',
        width: 600,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      const qrImage = await pdfDoc.embedPng(qrPng);
      page.drawImage(qrImage, { x: box.x, y: box.y, width: box.width, height: box.height });
    }
  }

  return pdfDoc.save();
}

module.exports = { renderFlyer };
