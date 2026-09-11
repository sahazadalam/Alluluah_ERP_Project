import JsBarcode from 'jsbarcode';

export function generateBarcodeValue(): string {
  const prefix = 'ALL';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.floor(Math.random() * 10000).toString(36).toUpperCase().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
}

export function renderBarcode(canvas: HTMLCanvasElement, value: string): void {
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 14,
    margin: 10,
    background: '#ffffff',
    lineColor: '#000000',
  });
}

export function downloadBarcodePNG(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function printBarcodeLabel(html: string): void {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}

export function buildLabelHTML(opts: {
  companyName: string;
  productName: string;
  productCode: string;
  barcodeValue: string;
  price?: string;
  copies: number;
}): string {
  const labelHTML = `
    <div style="width: 2in; height: 1.2in; border: 1px solid #ddd; padding: 6px; text-align: center; font-family: Arial, sans-serif; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
      <div style="font-size: 10px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${opts.companyName}</div>
      <div style="font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${opts.productName}</div>
      <canvas id="bc-${opts.barcodeValue}" style="width: 100%;"></canvas>
      <div style="font-size: 8px; color: #555;">${opts.productCode}</div>
      ${opts.price ? `<div style="font-size: 11px; font-weight: bold;">${opts.price}</div>` : ''}
    </div>`;

  const labels = Array(opts.copies).fill(labelHTML).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: auto; margin: 5mm; }
  body { margin: 0; padding: 10px; display: flex; flex-wrap: wrap; gap: 5mm; }
  * { -webkit-print-color-adjust: exact; }
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
</head>
<body>
${labels}
<script>
  document.querySelectorAll('canvas').forEach((c, i) => {
    const val = c.id.replace('bc-', '');
    JsBarcode(c, val, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 2 });
  });
</script>
</body>
</html>`;
}
