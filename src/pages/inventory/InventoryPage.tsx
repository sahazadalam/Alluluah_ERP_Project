import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Category, BranchInventory, formatCurrency } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Edit2, AlertTriangle, Package, Barcode, Download, Printer, RefreshCw, Tag, History, Trash2 } from 'lucide-react';
import { generateBarcodeValue, renderBarcode, downloadBarcodePNG, buildLabelHTML, printBarcodeLabel } from '../../lib/barcode';
import BarcodeLabelModal from './BarcodeLabelModal';
import { recordStockAdjustment, getStockHistory } from '../../lib/stockManager';

const emptyProduct = {
  code: '', name: '', name_ar: '', description: '', category_id: null as string | null,
  unit: 'pcs', cost_price: 0, selling_price: 0, stock_quantity: 0, reorder_level: 10, is_active: true,
  barcode: '' as string,
};

interface Props {
  branchFilter: string | null;
}

export default function InventoryPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branchInventory, setBranchInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low_stock'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Stock history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [stockHistory, setStockHistory] = useState<Array<{ id: string; movement_type: string; quantity: number; previous_quantity: number | null; new_quantity: number | null; notes: string; reference_number: string; created_at: string; cashier_name: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { loadData(); }, [branchFilter]);
  useEffect(() => {
    if (showModal && form.barcode && barcodeCanvasRef.current) {
      renderBarcode(barcodeCanvasRef.current, form.barcode);
    }
  }, [showModal, form.barcode]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: prods }, { data: cats }, { data: inv }] = await Promise.all([
      supabase.from('products').select('*, category:categories(*)').order('name'),
      supabase.from('categories').select('*').order('name'),
      branchFilter ? supabase.from('branch_inventory').select('*, product:products(*)').eq('branch_id', branchFilter) : supabase.from('branch_inventory').select('*, product:products(*)'),
    ]);
    setProducts(prods ?? []);
    setCategories(cats ?? []);
    setBranchInventory(inv ?? []);
    setLoading(false);
  };

  const getStockQuantity = (productId: string) => {
    if (!branchFilter) {
      const product = products.find(p => p.id === productId);
      return product?.stock_quantity ?? 0;
    }
    const inv = branchInventory.find(i => i.product_id === productId);
    return inv?.quantity ?? 0;
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyProduct, barcode: generateBarcodeValue() });
    setError('');
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, name_ar: p.name_ar ?? '', description: p.description,
      category_id: p.category_id, unit: p.unit, cost_price: p.cost_price,
      selling_price: p.selling_price, stock_quantity: getStockQuantity(p.id),
      reorder_level: p.reorder_level, is_active: p.is_active,
      barcode: p.barcode ?? '',
    });
    setError('');
    setShowModal(true);
  };

  const handleGenerateBarcode = () => {
    if (form.barcode && !confirm('This product already has a barcode. Generate a new one?')) return;
    setForm(f => ({ ...f, barcode: generateBarcodeValue() }));
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('Code and Name are required'); return; }
    setSaving(true);
    setError('');

    // Check for duplicate barcode
    if (form.barcode.trim()) {
      let dupQuery = supabase.from('products').select('id').eq('barcode', form.barcode.trim());
      if (editing) dupQuery = dupQuery.neq('id', editing.id);
      const { data: dup } = await dupQuery.maybeSingle();
      if (dup) { setError('A product with this barcode already exists. Please use a different barcode.'); setSaving(false); return; }
    }

    const branchId = branchFilter || profile?.branch_id;
    const payload = { ...form, barcode: form.barcode.trim() || null, branch_id: editing?.branch_id ?? branchId };

    if (editing) {
      const editablePayload = {
        code: payload.code,
        name: payload.name,
        name_ar: payload.name_ar,
        description: payload.description,
        category_id: payload.category_id,
        unit: payload.unit,
        cost_price: payload.cost_price,
        selling_price: payload.selling_price,
        reorder_level: payload.reorder_level,
        is_active: payload.is_active,
        branch_id: payload.branch_id,
      };

      const { error } = await supabase.from('products').update({ ...editablePayload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
      if (branchId) {
        const oldStock = getStockQuantity(editing.id);
        const newStock = form.stock_quantity;
        const { data: existing } = await supabase.from('branch_inventory').select('*').eq('branch_id', branchId).eq('product_id', editing.id).maybeSingle();
        if (existing) {
          await supabase.from('branch_inventory').update({ quantity: newStock }).eq('id', existing.id);
        } else {
          await supabase.from('branch_inventory').insert({ branch_id: branchId, product_id: editing.id, quantity: newStock });
        }
        // Record stock movement if stock changed
        if (newStock !== oldStock) {
          const movementResult = await recordStockAdjustment(editing.id, branchId, newStock, oldStock, `Stock edit: ${editing.name}`, profile?.id ?? null);
          if (!movementResult.success) { setError(movementResult.message); setSaving(false); return; }
        }
      }
    } else {
      const { data: newProduct, error } = await supabase.from('products').insert(payload).select().maybeSingle();
      if (error) { setError(error.message); setSaving(false); return; }
      if (newProduct && branchId) {
        await supabase.from('branch_inventory').insert({ branch_id: branchId, product_id: newProduct.id, quantity: form.stock_quantity });
      }
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const handleDownloadBarcode = () => {
    if (!form.barcode || !barcodeCanvasRef.current) return;
    downloadBarcodePNG(barcodeCanvasRef.current, `barcode-${form.code}`);
  };

  const handlePrintSingleLabel = () => {
    if (!form.barcode) return;
    const html = buildLabelHTML({
      companyName: 'Al Luluah Tents & Sheds TR.',
      productName: form.name,
      productCode: form.code,
      barcodeValue: form.barcode,
      price: form.selling_price ? formatCurrency(form.selling_price) : undefined,
      copies: 1,
    });
    printBarcodeLabel(html);
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) { setError(error.message); return; }
    loadData();
  };

  const openStockHistory = async (p: Product) => {
    setHistoryProduct(p);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    const history = await getStockHistory(p.id, branchFilter);
    setStockHistory(history);
    setHistoryLoading(false);
  };

  const filtered = products.filter(p => {
    const stockQty = getStockQuantity(p.id);
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'low_stock' && stockQty <= p.reorder_level);
    return matchesSearch && matchesFilter;
  });

  const lowStockCount = products.filter(p => getStockQuantity(p.id) <= p.reorder_level).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, or barcode..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            <button onClick={() => setFilter('all')} className={`px-3 py-2 text-xs font-medium transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>All</button>
            <button onClick={() => setFilter('low_stock')} className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1 ${filter === 'low_stock' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <AlertTriangle size={11} /> Low Stock {lowStockCount > 0 && `(${lowStockCount})`}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLabelModal(true)} className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Tag size={15} /> Print Labels
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barcode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Selling Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No products found</td></tr>
              ) : filtered.map(p => {
                const stockQty = getStockQuantity(p.id);
                const isLow = stockQty <= p.reorder_level;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{p.code}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Package size={13} className="text-slate-500" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{p.name}</div>
                          {p.description && <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.barcode ? (
                        <div className="flex items-center gap-1.5">
                          <Barcode size={13} className="text-slate-400" />
                          <span className="text-xs font-mono text-slate-600">{p.barcode}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{(p.category as unknown as Category)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.unit}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">{formatCurrency(p.cost_price)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">{formatCurrency(p.selling_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-semibold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>
                        {stockQty} {p.unit}
                      </div>
                      {isLow && <div className="text-xs text-red-500 flex items-center justify-end gap-1"><AlertTriangle size={10} /> Low</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openStockHistory(p)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Stock History">
                          <History size={14} />
                        </button>
                        <button onClick={() => deleteProduct(p)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Product' : 'Add Product'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Code *</label>
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Arabic Name / الاسم بالعربي</label>
            <input value={(form as typeof emptyProduct).name_ar ?? ''} onChange={e => setForm({ ...form, name_ar: e.target.value })}
              dir="rtl"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="اسم المنتج بالعربي" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={form.category_id ?? ''} onChange={e => setForm({ ...form, category_id: e.target.value || null })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Barcode Section */}
          <div className="col-span-2 bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">Barcode</label>
              <button onClick={handleGenerateBarcode} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <RefreshCw size={12} /> {form.barcode ? 'Regenerate' : 'Generate Barcode'}
              </button>
            </div>
            <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
              placeholder="Enter barcode manually or click Generate"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />

            {form.barcode && (
              <div className="flex flex-col items-center gap-3 bg-white rounded-lg p-4 border border-slate-100">
                <canvas ref={barcodeCanvasRef} className="max-w-full" />
                <div className="flex gap-2">
                  <button onClick={handleDownloadBarcode} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    <Download size={12} /> Download PNG
                  </button>
                  <button onClick={handlePrintSingleLabel} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    <Printer size={12} /> Print Label
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['pcs', 'sqm', 'meter', 'roll', 'set', 'kg', 'nos'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (AED)</label>
            <input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (AED)</label>
            <input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: Number(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stock Quantity</label>
            <input type="number" step="0.01" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: Number(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Level</label>
            <input type="number" step="0.01" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: Number(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving...' : editing ? 'Update Product' : 'Add Product'}
          </button>
          <button onClick={() => setShowModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </Modal>

      {showLabelModal && (
        <BarcodeLabelModal products={products} onClose={() => setShowLabelModal(false)} />
      )}

      {/* Stock History Modal */}
      <Modal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} title={`Stock History — ${historyProduct?.name ?? ''}`} size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {historyLoading ? (
            <div className="text-center text-slate-400 py-8">Loading...</div>
          ) : stockHistory.length === 0 ? (
            <div className="text-center text-slate-400 py-8">No stock movements recorded.</div>
          ) : stockHistory.map(m => {
            const typeColors: Record<string, string> = {
              POS_SALE: 'bg-red-50 text-red-700',
              POS_RETURN: 'bg-green-50 text-green-700',
              stock_in: 'bg-blue-50 text-blue-700',
              stock_out: 'bg-amber-50 text-amber-700',
              adjustment: 'bg-slate-50 text-slate-700',
              transfer_in: 'bg-cyan-50 text-cyan-700',
              transfer_out: 'bg-orange-50 text-orange-700',
            };
            const typeLabels: Record<string, string> = {
              POS_SALE: 'POS Sale',
              POS_RETURN: 'POS Return',
              stock_in: 'Stock In',
              stock_out: 'Stock Out',
              adjustment: 'Adjustment',
              transfer_in: 'Transfer In',
              transfer_out: 'Transfer Out',
            };
            return (
              <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[m.movement_type] ?? 'bg-slate-50 text-slate-600'}`}>
                    {typeLabels[m.movement_type] ?? m.movement_type}
                  </span>
                  <div>
                    <div className="text-sm text-slate-700">{m.notes}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(m.created_at).toLocaleString('en-GB')}
                      {m.cashier_name ? ` | ${m.cashier_name}` : ''}
                      {m.reference_number ? ` | Ref: ${m.reference_number}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <span className="text-slate-400">{m.previous_quantity ?? '—'}</span>
                  <span className="mx-1 text-slate-300">→</span>
                  <span className="font-semibold text-slate-800">{m.new_quantity ?? '—'}</span>
                  <div className="text-xs text-slate-400">Qty: {m.quantity}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
