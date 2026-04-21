/**
 * PDF coordinate conversions.
 *
 * PDF (pdf-lib): origin BOTTOM-LEFT, units are points (1pt = 1/72 inch).
 * Canvas (browser): origin TOP-LEFT, units are CSS pixels at the rendered scale.
 *
 * scale = react-pdf render scale (e.g. 1.5 means 1pt = 1.5px on screen).
 */

export function canvasToPdf({ x, y, width, height }, pdfPageHeight, scale) {
  return {
    x: x / scale,
    y: pdfPageHeight - (y + height) / scale,
    width: width / scale,
    height: height / scale,
  };
}

export function pdfToCanvas({ x, y, width, height }, pdfPageHeight, scale) {
  return {
    x: x * scale,
    y: (pdfPageHeight - y - height) * scale,
    width: width * scale,
    height: height * scale,
  };
}
