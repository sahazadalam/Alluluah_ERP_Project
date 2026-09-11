import { useState, useRef, useEffect } from 'react';
import { Product, formatCurrency } from '../../lib/types';
import { renderBarcode, buildLabelHTML, printBarcodeLabel } from '../../lib/barcode';
import Modal from '../../components/common/Modal';
import { Printer } from 'lucide-react';

interface Props {
  products: Product[];
  onClose: () => void;
}

export default function BarcodeLabelModal({ products, onClose }: Props) {
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set(products.map(p => p.id)));
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    products.forEach(p => {
      if (p.barcode && canvasRefs.current[p.id]) {
        renderBarcode(canvasRefs.current[p.id]!, p.barcode);
      }
    });
  }, [products]);

  const getCopies = (id: string) => copies[id] ?? 1;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrintOne = (p: Product) => {
    if (!p.barcode) return;
    const html = buildLabelHTML({
      companyName: 'Al Luluah Tents & Sheds TR.',
      productName: p.name,
      productCode: p.code,
      barcodeValue: p.barcode,
      price: p.selling_price ? formatCurrency(p.selling_price) : undefined,
      copies: getCopies(p.id),
    });
    printBarcodeLabel(html);
  };

  const handlePrintAll = () => {
    const toPrint = products.filter(p => selected.has(p.id) && p.barcode);
    if (toPrint.length === 0) return;

    const allLabels = toPrint.map(p => buildLabelHTML({
      companyName: 'Al Luluah Tents & Sheds TR.',
      productName: p.name,
      productCode: p.code,
      barcodeValue: p.barcode!,
      price: p.selling_price ? formatCurrency(p.selling_price) : undefined,
      copies: getCopies(p.id),
    }));

    const combined = `<!DOCTYPE html>
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
${allLabels.join('\n')}
<script>
  document.querySelectorAll('canvas').forEach((c) => {
    const val = c.id.replace('bc-', '');
    JsBarcode(c, val, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 2 });
  });
</script>
</body>
</html>`;
    printBarcodeLabel(combined);
  };

  return (
    <Modal isOpen onClose={onClose} title="Print Barcode Labels" size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">{selected.size} products selected</p>
          <button onClick={handlePrintAll} disabled={selected.size === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Printer size={14} /> Print All Selected
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-3">
          {products.map(p => (
            <div key={p.id} className={`flex items-center gap-4 p-3 rounded-lg border ${selected.has(p.id) ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                <div className="text-xs text-slate-500">{p.code} · {p.barcode ?? 'No barcode'}</div>
              </div>
              {p.barcode && (
                <canvas ref={el => { canvasRefs.current[p.id] = el; }} className="h-12 w-32" />
              )}
              <div className="flex items-center gap-1">
                <label className="text-xs text-slate-500">Copies:</label>
                <input type="number" min="1" max="100" value={getCopies(p.id)}
                  onChange={e => setCopies(prev => ({ ...prev, [p.id]: Math.max(1, Number(e.target.value)) }))}
                  className="w-14 border border-slate-200 rounded px-2 py-1 text-sm text-center" />
              </div>
              {p.barcode && (
                <button onClick={() => handlePrintOne(p)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                  <Printer size={12} /> Print
                </button>
              )}
            </div>
          ))}
        </div>

        {products.some(p => !p.barcode) && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Some products don't have barcodes yet. Generate barcodes from the product list before printing labels.
          </div>
        )}
      </div>
    </Modal>
  );
}
