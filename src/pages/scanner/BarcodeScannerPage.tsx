import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, StockMovement, Category, formatCurrency, formatDate, formatDateTime } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../context/PermissionsContext';
import {
  Barcode as BarcodeIcon, Camera, CameraOff, Search, Package, TrendingUp,
  TrendingDown, Sliders, History, AlertCircle, CheckCircle,
  ScanLine, ArrowLeft, RefreshCw
} from 'lucide-react';

type ScanMode = 'scan' | 'stock_update' | 'history';
type MovementType = 'stock_in' | 'stock_out' | 'adjustment';

export default function BarcodeScannerPage() {
  const { profile } = useAuth();
  const { can } = usePermissions();

  // Scanner state
  const [scanMode, setScanMode] = useState<ScanMode>('scan');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');

  // Found product
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [productCategory, setProductCategory] = useState<Category | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Stock update form
  const [movementType, setMovementType] = useState<MovementType>('stock_in');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // History
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ZXing scanner
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<import('@zxing/browser').BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<Promise<import('@zxing/browser').IScannerControls> | null>(null);

  const canModifyStock = can('inventory', 'edit') || can('inventory', 'create') || profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'inventory';

  const findProductByBarcode = useCallback(async (barcode: string) => {
    setScanStatus('searching');
    setFoundProduct(null);
    setProductCategory(null);

    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('barcode', barcode.trim())
      .maybeSingle();

    if (error || !data) {
      setScanStatus('not_found');
      return;
    }

    const product = data as Product;
    setFoundProduct(product);
    setProductCategory((product as Product & { category?: Category }).category ?? null);
    setScanStatus('found');

    // Fetch last updated timestamp from stock movements
    const { data: lastMovement } = await supabase
      .from('stock_movements')
      .select('created_at')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastUpdated(lastMovement?.created_at ?? product.updated_at);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      const constraints = {
        video: { facingMode: 'environment' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const controls = codeReader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) {
          const text = result.getText();
          stopCamera();
          findProductByBarcode(text);
        }
      });
      controlsRef.current = controls;
      setScanning(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (msg.includes('NotFound') || msg.includes('NotFoundError') || msg.includes('Devices')) {
        setCameraError('No camera found on this device. Use manual barcode entry instead.');
      } else {
        setCameraError(`Camera error: ${msg}. You can use manual entry instead.`);
      }
      setScanning(false);
    }
  }, [findProductByBarcode]);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.then(controls => controls.stop()).catch(() => {});
      controlsRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleManualSearch = () => {
    if (!manualBarcode.trim()) return;
    findProductByBarcode(manualBarcode);
  };

  const handleReset = () => {
    setScanMode('scan');
    setFoundProduct(null);
    setProductCategory(null);
    setScanStatus('idle');
    setManualBarcode('');
    setQuantity(1);
    setNotes('');
    setReferenceNumber('');
    setSaveMessage(null);
    setMovements([]);
  };

  const loadHistory = async (productId: string) => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('stock_movements')
      .select('*, product:products(*)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50);
    setMovements(data ?? []);
    setLoadingHistory(false);
  };

  const handleSaveStock = async () => {
    if (!foundProduct || !canModifyStock) return;
    if (quantity <= 0) { setSaveMessage({ type: 'error', text: 'Quantity must be greater than zero' }); return; }

    setSaving(true);
    setSaveMessage(null);

    const currentStock = foundProduct.stock_quantity ?? 0;
    let newStock = currentStock;

    if (movementType === 'stock_in') {
      newStock = currentStock + quantity;
    } else if (movementType === 'stock_out') {
      newStock = currentStock - quantity;
      if (newStock < 0) {
        setSaveMessage({ type: 'error', text: `Insufficient stock. Current: ${currentStock}, trying to remove: ${quantity}` });
        setSaving(false);
        return;
      }
    } else if (movementType === 'adjustment') {
      newStock = quantity;
    }

    const { error: movementError } = await supabase.rpc('apply_stock_movement', {
      p_product_id: foundProduct.id,
      p_movement_type: movementType,
      p_quantity: quantity,
      p_notes: notes,
      p_reference_number: referenceNumber,
    });

    if (movementError) {
      const message = movementError.message.includes('Not authorized')
        ? 'You are not authorized to update stock.'
        : movementError.message.includes('Insufficient stock')
          ? 'Insufficient stock for this removal.'
          : movementError.message.includes('Quantity')
            ? 'Enter a valid quantity.'
            : 'Could not update stock. Please try again.';
      setSaveMessage({ type: 'error', text: message });
      setSaving(false);
      return;
    }

    setSaveMessage({ type: 'success', text: `Stock updated successfully. ${currentStock} → ${newStock} ${foundProduct.unit}` });
    setFoundProduct(p => p ? { ...p, stock_quantity: newStock } : p);
    setQuantity(1);
    setNotes('');
    setReferenceNumber('');
    setSaving(false);
  };

  const movementTypeConfig: Record<MovementType, { label: string; icon: React.ReactNode; color: string }> = {
    stock_in: { label: 'Add Stock', icon: <TrendingUp size={15} />, color: 'bg-green-600 hover:bg-green-700' },
    stock_out: { label: 'Remove Stock', icon: <TrendingDown size={15} />, color: 'bg-red-600 hover:bg-red-700' },
    adjustment: { label: 'Set Stock Count', icon: <Sliders size={15} />, color: 'bg-blue-600 hover:bg-blue-700' },
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <ScanLine size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Barcode Scanner</h2>
          <p className="text-sm text-slate-500">Scan product barcodes to look up and update inventory</p>
        </div>
      </div>

      {/* Scanner Section */}
      {scanStatus !== 'found' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Camera View */}
          <div className="relative bg-slate-900 aspect-video flex items-center justify-center">
            <video ref={videoRef} className={`w-full h-full object-cover ${scanning ? 'block' : 'hidden'}`} playsInline muted />
            {!scanning && (
              <div className="text-center text-slate-400 p-8">
                <Camera size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">{cameraError || 'Click "Start Camera" to begin scanning'}</p>
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-3/4 max-w-md h-32 border-2 border-blue-500 rounded-lg relative">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-500 animate-pulse" style={{ animation: 'scanline 2s linear infinite', top: '50%' }} />
                  </div>
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-white text-xs">Scanning...</span>
                </div>
              </>
            )}
          </div>

          {/* Camera Controls */}
          <div className="p-4 space-y-4">
            {cameraError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <AlertCircle size={16} /> {cameraError}
              </div>
            )}

            <div className="flex gap-3">
              {!scanning ? (
                <button onClick={startCamera} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  <Camera size={16} /> Start Camera
                </button>
              ) : (
                <button onClick={stopCamera} className="flex-1 flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  <CameraOff size={16} /> Stop Camera
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">or enter manually</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Manual Entry */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <BarcodeIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                  placeholder="Type or paste barcode..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button onClick={handleManualSearch} disabled={!manualBarcode.trim()}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                <Search size={15} /> Search
              </button>
            </div>

            {scanStatus === 'searching' && (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500 ml-2">Searching for product...</span>
              </div>
            )}

            {scanStatus === 'not_found' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-center">
                <AlertCircle size={28} className="mx-auto text-amber-500 mb-2" />
                <p className="text-sm font-medium text-amber-800">Product not found</p>
                <p className="text-xs text-amber-600 mt-1">No product matches barcode: <span className="font-mono">{manualBarcode}</span></p>
                <div className="flex gap-2 justify-center mt-4">
                  <button onClick={handleReset} className="text-xs text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg">
                    Scan Another
                  </button>
                  <a href="/inventory" className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-4 py-2 rounded-lg">
                    Add New Product
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Found */}
      {scanStatus === 'found' && foundProduct && (
        <div className="space-y-4">
          {/* Product Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-green-50 border-b border-green-100">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-600" />
                <span className="text-sm font-semibold text-green-800">Product Found</span>
              </div>
              <button onClick={handleReset} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800">
                <RefreshCw size={13} /> Scan Next
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package size={26} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-slate-900">{foundProduct.name}</h3>
                  {foundProduct.name_ar && <p className="text-sm text-slate-500" dir="rtl">{foundProduct.name_ar}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="font-mono">{foundProduct.code}</span>
                    {foundProduct.barcode && <span className="font-mono">· {foundProduct.barcode}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Selling Price</div>
                  <div className="text-lg font-bold text-blue-600">{formatCurrency(foundProduct.selling_price)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Current Stock', value: `${foundProduct.stock_quantity ?? 0} ${foundProduct.unit}`, highlight: true },
                  { label: 'Unit', value: foundProduct.unit },
                  { label: 'Category', value: productCategory?.name ?? '—' },
                  { label: 'Last Updated', value: lastUpdated ? formatDate(lastUpdated) : '—' },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className={`rounded-lg p-3 ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}`}>
                    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                    <div className={`text-sm font-bold ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {scanMode === 'scan' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {canModifyStock && (
                <>
                  <button onClick={() => { setScanMode('stock_update'); setMovementType('stock_in'); }}
                    className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><TrendingUp size={18} className="text-green-600" /></div>
                    <span className="text-sm font-medium text-slate-700">Add Stock</span>
                  </button>
                  <button onClick={() => { setScanMode('stock_update'); setMovementType('stock_out'); }}
                    className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-all">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><TrendingDown size={18} className="text-red-600" /></div>
                    <span className="text-sm font-medium text-slate-700">Remove Stock</span>
                  </button>
                  <button onClick={() => { setScanMode('stock_update'); setMovementType('adjustment'); }}
                    className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Sliders size={18} className="text-blue-600" /></div>
                    <span className="text-sm font-medium text-slate-700">Set Stock Count</span>
                  </button>
                </>
              )}
              <button onClick={() => { setScanMode('history'); loadHistory(foundProduct.id); }}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><History size={18} className="text-slate-600" /></div>
                <span className="text-sm font-medium text-slate-700">View History</span>
              </button>
            </div>
          )}

          {/* Stock Update Form */}
          {scanMode === 'stock_update' && canModifyStock && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Update Stock</h3>
                <button onClick={() => setScanMode('scan')} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <ArrowLeft size={14} /> Back
                </button>
              </div>

              {/* Movement Type Selector */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(Object.entries(movementTypeConfig) as [MovementType, typeof movementTypeConfig[MovementType]][]).map(([type, cfg]) => (
                  <button key={type} onClick={() => setMovementType(type)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      movementType === type ? `${cfg.color} text-white border-transparent` : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}>
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {movementType === 'adjustment' ? 'New Stock Count' : 'Quantity'}
                  </label>
                  <input type="number" min={movementType === 'adjustment' ? 0 : 1} step="0.01"
                    value={quantity} onChange={e => setQuantity(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {movementType !== 'adjustment' && (
                    <p className="text-xs text-slate-400 mt-1">
                      Current: {foundProduct.stock_quantity ?? 0} → New: {(foundProduct.stock_quantity ?? 0) + (movementType === 'stock_in' ? quantity : -quantity)} {foundProduct.unit}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                  <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                    placeholder="PO #, Invoice #, etc." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    placeholder="Reason for stock change..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {saveMessage && (
                <div className={`mt-3 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                  saveMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {saveMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {saveMessage.text}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveStock} disabled={saving || (movementType !== 'adjustment' && quantity <= 0) || (movementType === 'adjustment' && quantity < 0)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Saving...' : 'Save Stock Update'}
                </button>
                <button onClick={() => setScanMode('scan')} className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!canModifyStock && scanMode === 'scan' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg">
              <AlertCircle size={16} /> You don't have permission to modify stock. Contact an administrator.
            </div>
          )}

          {/* Stock Movement History */}
          {scanMode === 'history' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Stock Movement History</h3>
                <button onClick={() => setScanMode('scan')} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <ArrowLeft size={14} /> Back
                </button>
              </div>

              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No stock movements recorded for this product.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Type</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Qty</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Previous</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">New</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(m.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.movement_type === 'stock_in' ? 'bg-green-100 text-green-700' :
                              m.movement_type === 'stock_out' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {m.movement_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{m.quantity}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{m.previous_quantity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{m.new_quantity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">{m.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes scanline {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
