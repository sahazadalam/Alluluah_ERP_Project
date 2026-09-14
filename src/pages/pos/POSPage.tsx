import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Customer, CashDrawer, Company, Branch, Profile, PosHardwareSettings, formatCurrency } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, Search, CheckCircle,
  DollarSign, Lock, Unlock, AlertTriangle, Settings, Clock,
  User, Usb, Wifi, Printer as PrinterIcon, ScanLine, Volume2, VolumeX
} from 'lucide-react';
import {
  detectQzTray, testPrint, testCashDrawer,
  browserPrintReceipt,
  DEFAULT_DRAWER_COMMAND, type PrinterMode
} from '../../lib/posHardware';
import { checkStock, deductStockForSale, restoreStockForReturn } from '../../lib/stockManager';
import { RotateCcw } from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  vat_amount: number;
  total: number;
}

const calcCartItem = (product: Product, quantity: number): CartItem => {
  const line_total = product.selling_price * quantity;
  const vat = line_total * 0.05;
  return { product, quantity, unit_price: product.selling_price, vat_amount: vat, total: line_total + vat };
};

interface Props {
  branchFilter: string | null;
}

export default function POSPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Shift state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftOpeningCash, setShiftOpeningCash] = useState(0);
  const [shiftExpectedCash, setShiftExpectedCash] = useState(0);
  const [shiftCashSales, setShiftCashSales] = useState(0);
  const [shiftCardSales, setShiftCardSales] = useState(0);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [shiftError, setShiftError] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);

  // Reconcile form
  const [reconcileForm, setReconcileForm] = useState({
    actual_cash: 0,
    actual_card: 0,
    notes: ''
  });

  // Cashier state
  const [cashiers, setCashiers] = useState<Profile[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState<string>('');
  const activeCashier = profile?.role === 'admin' && selectedCashierId
    ? cashiers.find(c => c.id === selectedCashierId) ?? profile
    : profile;
  const activeCashierId = activeCashier?.id ?? profile?.id ?? '';
  const activeCashierName = activeCashier?.full_name ?? profile?.full_name ?? '';

  // Hardware state
  const [hwSettings, setHwSettings] = useState<PosHardwareSettings | null>(null);
  const [showHardwareModal, setShowHardwareModal] = useState(false);
  const [qzConnected, setQzConnected] = useState(false);
  const [qzDetecting, setQzDetecting] = useState(false);
  const [hardwareMessage, setHardwareMessage] = useState('');
  const [printerStatus, setPrinterStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  // Receipt state
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [lastReceiptHtml, setLastReceiptHtml] = useState('');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Cash drawer state
  const [cashDrawer, setCashDrawer] = useState<CashDrawer | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<'open' | 'closed'>('closed');

  // Sales history
  const [showHistory, setShowHistory] = useState(false);
  const [recentSales, setRecentSales] = useState<Array<{ id: string; transaction_number: string; total: number; payment_method: string; created_at: string; cashier_name: string; receipt_html?: string }>>([]);

  // Branch inventory stock map
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Barcode scanner state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannerActive, setScannerActive] = useState(true);
  const [beepEnabled, setBeepEnabled] = useState(true);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Return/refund state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTarget, setReturnTarget] = useState<{ transaction_id: string; transaction_number: string; items: Array<{ product_id: string; product_name: string; quantity: number; unit_price: number }> } | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnProcessing, setReturnProcessing] = useState(false);

  // Company/branch
  const [company, setCompany] = useState<Company | null>(null);
  const [currentBranchData, setCurrentBranchData] = useState<Branch | null>(null);
  const [receiptTemplate, setReceiptTemplate] = useState<{ language: string; paper_size: string; footer_text: string; footer_ar: string; header_ar: string; show_logo: boolean; show_trn: boolean; show_branch: boolean; show_cashier: boolean; show_vat_breakdown: boolean } | null>(null);

  const branchId = branchFilter ?? profile?.branch_id ?? null;
  const hasActiveShift = !!sessionId && !!shiftId;

  const loadProducts = useCallback(async () => {
    let query = supabase.from('products').select('*, category:categories(*)').eq('is_active', true).order('name');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) { console.error('Product load error:', error); return; }
    setProducts(data ?? []);

    // Load branch inventory stock
    if (branchId) {
      const { data: inv } = await supabase.from('branch_inventory').select('product_id, quantity').eq('branch_id', branchId);
      const map: Record<string, number> = {};
      for (const row of inv ?? []) {
        map[row.product_id] = Number(row.quantity);
      }
      // Fall back to product.stock_quantity for products without branch_inventory row
      for (const p of data ?? []) {
        if (!(p.id in map)) {
          map[p.id] = Number(p.stock_quantity ?? 0);
        }
      }
      setStockMap(map);
    } else {
      const map: Record<string, number> = {};
      for (const p of data ?? []) {
        map[p.id] = Number(p.stock_quantity ?? 0);
      }
      setStockMap(map);
    }
  }, [branchId]);

  const loadCustomers = useCallback(async () => {
    let query = supabase.from('customers').select('*').eq('is_active', true).order('name');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) { console.error('Customer load error:', error); return; }
    setCustomers(data ?? []);
  }, [branchId]);

  const loadCashiers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'manager', 'sales', 'cashier'])
      .eq('is_active', true)
      .order('full_name');
    if (error) { console.error('Cashier load error:', error); return; }
    setCashiers(data ?? []);
  }, []);

  const loadCashDrawer = useCallback(async () => {
    if (!branchId) return;
    const { data, error } = await supabase.from('cash_drawers').select('*').eq('branch_id', branchId).eq('is_active', true).limit(1).maybeSingle();
    if (error) { console.error('Drawer load error:', error); return; }
    if (data) {
      setCashDrawer(data);
      setDrawerStatus(data.status as 'open' | 'closed');
    }
  }, [branchId]);

  const loadReceiptTemplate = useCallback(async () => {
    const { data, error } = await supabase.from('receipt_templates').select('*').eq('is_default', true).eq('is_active', true).maybeSingle();
    if (error) { console.error('Template load error:', error); return; }
    if (data) {
      setReceiptTemplate({
        language: data.language,
        paper_size: data.paper_size,
        footer_text: data.footer_text,
        footer_ar: data.footer_ar,
        header_ar: data.header_ar,
        show_logo: data.show_logo,
        show_trn: data.show_trn,
        show_branch: data.show_branch,
        show_cashier: data.show_cashier,
        show_vat_breakdown: data.show_vat_breakdown,
      });
    }
  }, []);

  const loadCompanyAndBranch = useCallback(async () => {
    const [{ data: co, error: coErr }, { data: br, error: brErr }] = await Promise.all([
      supabase.from('companies').select('*').eq('is_active', true).order('name').limit(1).maybeSingle(),
      branchId ? supabase.from('branches').select('*').eq('id', branchId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (coErr) console.error('Company load error:', coErr);
    if (brErr) console.error('Branch load error:', brErr);
    setCompany(co ?? null);
    setCurrentBranchData(br ?? null);
  }, [branchId]);

  const loadHardwareSettings = useCallback(async () => {
    if (!branchId) return;
    const { data, error } = await supabase.from('pos_hardware_settings').select('*').eq('branch_id', branchId).maybeSingle();
    if (error) { console.error('Hardware settings load error:', error); return; }
    if (data) {
      setHwSettings(data as PosHardwareSettings);
      if (data.printer_mode === 'qz_tray') {
        setQzDetecting(true);
        const ok = await detectQzTray();
        setQzConnected(ok);
        setPrinterStatus(ok ? 'connected' : 'disconnected');
        setQzDetecting(false);
      } else if (data.printer_mode === 'browser') {
        setPrinterStatus('connected');
      }
    } else {
      // Create default settings
      const { data: created } = await supabase.from('pos_hardware_settings').insert({
        branch_id: branchId,
        printer_mode: 'browser',
        receipt_width: '80mm',
        cash_drawer_enabled: true,
        auto_open_drawer: true,
      }).select().maybeSingle();
      if (created) {
        setHwSettings(created as PosHardwareSettings);
        setPrinterStatus('connected');
      }
    }
  }, [branchId]);

  const loadActiveShift = useCallback(async () => {
    if (!branchId || !activeCashierId) return;
    setShiftError('');
    const { data: session, error } = await supabase.from('pos_sessions')
      .select('*')
      .eq('cashier_id', activeCashierId)
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setShiftError('Could not load shift: ' + error.message);
      return;
    }

    if (session) {
      setSessionId(session.id);
      setShiftOpeningCash(Number(session.opening_balance ?? 0));

      const { data: shift, error: shiftErr } = await supabase.from('shift_reconciliation')
        .select('*')
        .eq('shift_id', session.id)
        .eq('status', 'open')
        .maybeSingle();

      if (shiftErr) {
        setShiftError('Could not load shift reconciliation: ' + shiftErr.message);
        return;
      }

      if (shift) {
        setShiftId(shift.id);
        setShiftExpectedCash(Number(shift.expected_cash ?? 0));
      } else {
        setShiftId(null);
      }
    } else {
      setSessionId(null);
      setShiftId(null);
    }
  }, [branchId, activeCashierId]);

  const loadShiftTotals = useCallback(async () => {
    if (!sessionId || !shiftId) { setShiftCashSales(0); setShiftCardSales(0); return; }
    const { data, error } = await supabase.from('pos_transactions')
      .select('total, payment_method')
      .eq('session_id', sessionId)
      .eq('status', 'completed');
    if (error) { console.error('Shift totals error:', error); return; }
    let cash = 0, card = 0;
    for (const tx of data ?? []) {
      if (tx.payment_method === 'cash') cash += Number(tx.total);
      else card += Number(tx.total);
    }
    setShiftCashSales(cash);
    setShiftCardSales(card);
  }, [sessionId, shiftId]);

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadCashiers();
    loadCashDrawer();
    loadReceiptTemplate();
    loadCompanyAndBranch();
    loadHardwareSettings();
  }, [loadProducts, loadCustomers, loadCashiers, loadCashDrawer, loadReceiptTemplate, loadCompanyAndBranch, loadHardwareSettings]);

  useEffect(() => {
    loadActiveShift();
  }, [loadActiveShift]);

  useEffect(() => {
    loadShiftTotals();
  }, [loadShiftTotals]);

  // Set default cashier for admin
  useEffect(() => {
    if (profile && profile.role === 'admin' && !selectedCashierId) {
      setSelectedCashierId(profile.id);
    }
  }, [profile, selectedCashierId]);

  // Cart calculations
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const vatTotal = cart.reduce((s, i) => s + i.vat_amount, 0);
  const total = subtotal + vatTotal;
  const change = paymentMethod === 'cash' ? Math.max(0, Number(amountTendered) - total) : 0;

  const addToCart = (product: Product) => {
    const existing = cart.find(c => c.product.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.product.id === product.id ? calcCartItem(product, c.quantity + 1) : c));
    } else {
      setCart([...cart, calcCartItem(product, 1)]);
    }
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart(cart.filter(c => c.product.id !== productId));
    } else {
      setCart(cart.map(c => c.product.id === productId ? calcCartItem(c.product, qty) : c));
    }
  };

  const clearCart = () => setCart([]);

  // Start shift
  const startShift = async () => {
    setShiftError('');
    setShiftLoading(true);
    const openingCash = Number(openingCashInput) || 0;

    if (!activeCashierId) {
      setShiftError('No cashier selected.');
      setShiftLoading(false);
      return;
    }
    if (!branchId) {
      setShiftError('No branch assigned. Contact your administrator.');
      setShiftLoading(false);
      return;
    }

    // Check for existing active session
    const { data: existing } = await supabase.from('pos_sessions')
      .select('id')
      .eq('cashier_id', activeCashierId)
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle();

    if (existing) {
      setShiftError('An active shift already exists for this cashier.');
      setShiftLoading(false);
      return;
    }

    const ts = Date.now().toString().slice(-6);
    const { data: session, error: sessionErr } = await supabase.from('pos_sessions').insert({
      session_number: `SES-${ts}`,
      cashier_id: activeCashierId,
      cashier_name: activeCashierName,
      branch_id: branchId,
      opening_balance: openingCash,
      status: 'open',
    }).select().maybeSingle();

    if (sessionErr || !session) {
      setShiftError('Could not start shift: ' + (sessionErr?.message ?? 'Unknown error'));
      setShiftLoading(false);
      return;
    }

    setSessionId(session.id);
    setShiftOpeningCash(openingCash);

    const { data: shift, error: shiftErr } = await supabase.from('shift_reconciliation').insert({
      shift_id: session.id,
      branch_id: branchId,
      drawer_id: cashDrawer?.id ?? null,
      opening_date: new Date().toISOString().split('T')[0],
      opening_time: new Date().toISOString(),
      cashier_id: activeCashierId,
      opening_cash: openingCash,
      expected_cash: openingCash,
      expected_card: 0,
      expected_other: 0,
      total_expected: openingCash,
      actual_cash: 0,
      actual_card: 0,
      actual_other: 0,
      total_actual: 0,
      cash_variance: 0,
      card_variance: 0,
      total_variance: 0,
      variance_reason: '',
      cash_breakdown: {},
      status: 'open',
      notes: '',
    }).select().maybeSingle();

    if (shiftErr || !shift) {
      setShiftError('Shift started but reconciliation record failed: ' + (shiftErr?.message ?? 'Unknown error'));
      setShiftLoading(false);
      return;
    }

    setShiftId(shift.id);
    setShiftExpectedCash(openingCash);
    setShowShiftModal(false);
    setShiftLoading(false);
    showToast('success', 'Shift started successfully.');
  };

  // Close shift
  const closeShift = async () => {
    if (!shiftId || !sessionId) return;
    setShiftLoading(true);
    setShiftError('');

    const expectedCash = shiftOpeningCash + shiftCashSales;
    const cashVar = reconcileForm.actual_cash - expectedCash;

    const { error: shiftErr } = await supabase.from('shift_reconciliation').update({
      actual_cash: reconcileForm.actual_cash,
      actual_card: reconcileForm.actual_card,
      total_actual: reconcileForm.actual_cash + reconcileForm.actual_card,
      cash_variance: cashVar,
      card_variance: reconcileForm.actual_card - shiftCardSales,
      total_variance: cashVar + (reconcileForm.actual_card - shiftCardSales),
      variance_reason: cashVar !== 0 ? 'Cash variance' : '',
      notes: reconcileForm.notes,
      status: 'closed',
      closing_time: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    }).eq('id', shiftId);

    if (shiftErr) {
      setShiftError('Could not close shift: ' + shiftErr.message);
      setShiftLoading(false);
      return;
    }

    const { error: sessionErr } = await supabase.from('pos_sessions').update({
      status: 'closed',
      closing_balance: reconcileForm.actual_cash,
      closed_at: new Date().toISOString(),
    }).eq('id', sessionId);

    if (sessionErr) {
      setShiftError('Shift closed but session update failed: ' + sessionErr.message);
      setShiftLoading(false);
      return;
    }

    setSessionId(null);
    setShiftId(null);
    setShiftCashSales(0);
    setShiftCardSales(0);
    setShowReconcileModal(false);
    setReconcileForm({ actual_cash: 0, actual_card: 0, notes: '' });
    setShiftLoading(false);
    showToast('success', 'Shift closed successfully.');
  };

  // Generate receipt HTML
  const generateReceipt = (tx: { number: string; items: CartItem[]; subtotal: number; vat: number; total: number; paid: number; change: number; method: string }) => {
    const tpl = receiptTemplate;
    const isBilingual = !tpl || tpl.language === 'bilingual';
    const isArabicOnly = tpl?.language === 'arabic';
    const paperWidth = (tpl?.paper_size ?? hwSettings?.receipt_width ?? '80mm') === '58mm' ? '200px' : '280px';
    const showLogo = tpl?.show_logo !== false;
    const showTrn = tpl?.show_trn !== false;
    const showBranch = tpl?.show_branch !== false;
    const showCashier = tpl?.show_cashier !== false;
    const showVatBreakdown = tpl?.show_vat_breakdown !== false;

    const companyName = company?.name || 'Al Luluah Tents & Sheds TR.';
    const companyNameAr = tpl?.header_ar || 'خيمة ومظلات اللؤلؤة';
    const trn = company?.trn || '';
    const companyAddress = company?.address || '';
    const branchName = currentBranchData?.name || '';
    const logoUrl = company?.logo_url || '';
    const footerEn = tpl?.footer_text || 'Thank you for your business!';
    const footerAr = tpl?.footer_ar || 'شكراً لتعاملكم معنا';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateStrAr = now.toLocaleDateString('ar-AE');

    const methodLabel: Record<string, string> = { cash: 'Cash / نقداً', card: 'Card / بطاقة', bank_transfer: 'Transfer / تحويل' };

    const row = (enLabel: string, arLabel: string, value: string, bold = false) => `
      <tr>
        <td style="padding: 2px 0; ${bold ? 'font-weight:bold;' : ''}">
          ${isBilingual ? `<span style="display:block">${enLabel}</span><span style="display:block;text-align:right;direction:rtl;font-size:10px;">${arLabel}</span>` : isArabicOnly ? arLabel : enLabel}
        </td>
        <td style="text-align:right; padding: 2px 4px; ${bold ? 'font-weight:bold;' : ''} white-space:nowrap">${value}</td>
      </tr>`;

    const itemRows = tx.items.map(item => {
      const nameEn = item.product.name;
      const nameAr = item.product.name_ar || item.product.name;
      return `
        <tr>
          <td style="padding: 3px 0; vertical-align: top;">
            <div style="font-size: 11px;">${isArabicOnly ? '' : nameEn}</div>
            ${(isBilingual || isArabicOnly) && nameAr ? `<div style="font-size: 10px; text-align: right; direction: rtl; color: #333;">${nameAr}</div>` : ''}
            <div style="font-size: 10px; color: #555;">${item.quantity} × ${formatCurrency(item.unit_price)}</div>
          </td>
          <td style="text-align: right; vertical-align: top; padding: 3px 0; font-size: 11px; white-space:nowrap;">${formatCurrency(item.total)}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', 'Noto Sans Arabic', monospace; font-size: 12px; background: white; }
  .receipt { width: ${paperWidth}; margin: 0 auto; padding: 8px 10px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .rtl { direction: rtl; unicode-bidi: bidi-override; }
  .dashed { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  @media print {
    body { margin: 0; }
    .receipt { width: 100%; padding: 4mm; }
    @page { margin: 0; size: ${tpl?.paper_size ?? hwSettings?.receipt_width ?? '80mm'} auto; }
  }
</style>
</head>
<body>
<div class="receipt">
  ${showLogo && logoUrl ? `<div class="center" style="margin-bottom: 6px;"><img src="${logoUrl}" alt="${companyName}" style="max-height: 48px; max-width: ${paperWidth}; object-fit: contain;" /></div>` : ''}
  <div class="center bold" style="font-size: 14px; letter-spacing: 0.5px;">${isArabicOnly ? companyNameAr : companyName}</div>
  ${isBilingual ? `<div class="center rtl" style="font-size: 12px; font-family: 'Noto Sans Arabic', sans-serif;">${companyNameAr}</div>` : ''}
  ${showBranch && branchName ? `<div class="center" style="font-size: 10px; color: #555;">${branchName}</div>` : ''}
  ${companyAddress ? `<div class="center" style="font-size: 10px; color: #555;">${companyAddress}</div>` : ''}
  ${showTrn && trn ? `<div class="center" style="font-size: 10px;">TRN: ${trn}${isBilingual ? ' | الرقم الضريبي: ' + trn : ''}</div>` : ''}
  <div class="dashed"></div>
  <table>
    ${row('Receipt #', 'رقم الإيصال', tx.number)}
    ${row(`Date: ${dateStr}`, `التاريخ: ${dateStrAr}`, timeStr)}
    ${showCashier && activeCashierName ? row('Cashier', 'الكاشير', activeCashierName) : ''}
    ${row('Payment', 'طريقة الدفع', isBilingual ? (methodLabel[tx.method] ?? tx.method) : tx.method)}
  </table>
  <div class="dashed"></div>
  <table>
    <tr style="border-bottom: 1px solid #000;">
      <th style="text-align: left; padding: 2px 0; font-size: 11px;">${isArabicOnly ? 'الصنف' : 'Item'}${isBilingual ? ' / الصنف' : ''}</th>
      <th style="text-align: right; padding: 2px 4px; font-size: 11px;">${isArabicOnly ? 'الإجمالي' : 'Total'}${isBilingual ? ' / الإجمالي' : ''}</th>
    </tr>
    ${itemRows}
  </table>
  <div class="dashed"></div>
  <table>
    ${row('Subtotal (excl. VAT)', 'المجموع (بدون ضريبة)', formatCurrency(tx.subtotal))}
    ${showVatBreakdown ? row('VAT @ 5%', 'ضريبة القيمة المضافة 5%', formatCurrency(tx.vat)) : ''}
    ${row('TOTAL (AED)', 'الإجمالي (درهم)', formatCurrency(tx.total), true)}
  </table>
  ${tx.method === 'cash' ? `
  <div class="dashed"></div>
  <table>
    ${row('Cash Paid', 'المبلغ المدفوع', formatCurrency(tx.paid))}
    ${row('Change', 'الباقي', formatCurrency(tx.change), true)}
  </table>` : ''}
  <div class="dashed"></div>
  <div class="center" style="margin-top: 6px; font-size: 10px;">${isArabicOnly ? footerAr : footerEn}</div>
  ${isBilingual ? `<div class="center rtl" style="font-size: 11px; font-family: 'Noto Sans Arabic', sans-serif; margin-top: 2px;">${footerAr}</div>` : ''}
  <div style="margin-top: 8px; text-align: center; font-size: 9px; color: #aaa;">${tx.number} · ${dateStr} ${timeStr}</div>
</div>
</body>
</html>`;
  };

  // Print receipt
  const doPrintReceipt = async (receiptHtml: string) => {
    if (!hwSettings) {
      const ok = await browserPrintReceipt(receiptHtml);
      if (!ok) showToast('error', 'Could not open print window. Check popup blocker.');
      return;
    }

    const result = await testPrint(hwSettings, receiptHtml);
    if (result.success) {
      showToast('success', result.message);
    } else {
      showToast('error', result.message);
    }
  };

  // Open cash drawer
  const doOpenCashDrawer = async (reason: string = 'Transaction') => {
    if (!hwSettings) {
      showToast('error', 'Hardware settings not loaded.');
      return;
    }

    // Log the event
    if (cashDrawer) {
      await supabase.from('cash_drawer_events').insert({
        drawer_id: cashDrawer.id,
        event_type: 'open',
        opened_by: profile?.id,
        cashier_id: activeCashierId,
        shift_id: shiftId,
        branch_id: branchId,
        reason,
      });
      const { error: drawerUpdErr } = await supabase.from('cash_drawers').update({
        status: 'open',
        opened_at: new Date().toISOString(),
        opened_by: profile?.id,
      }).eq('id', cashDrawer.id);
      if (drawerUpdErr) { showToast('error', 'Drawer update failed: ' + drawerUpdErr.message); }
      setDrawerStatus('open');
      setCashDrawer({ ...cashDrawer, status: 'open' });
    }

    const result = await testCashDrawer(hwSettings);
    if (result.success) {
      showToast('success', result.message);
    } else {
      showToast('error', result.message);
    }
  };

  // Process payment
  const processPayment = async () => {
    if (cart.length === 0) {
      showToast('error', 'Cart is empty.');
      return;
    }
    if (!hasActiveShift) {
      showToast('error', 'Start a shift first to process payments.');
      setShowShiftModal(true);
      return;
    }
    if (paymentMethod === 'cash' && Number(amountTendered) < total) {
      showToast('error', 'Amount tendered is less than total.');
      return;
    }

    // Check stock availability before proceeding
    const preventNegative = hwSettings?.prevent_negative_stock ?? true;
    const stockCheck = await checkStock(
      cart.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
      branchId,
      preventNegative
    );
    if (!stockCheck.sufficient) {
      showToast('error', stockCheck.message ?? 'Insufficient stock.');
      return;
    }

    // Warn if negative stock will result but is allowed
    if (!preventNegative) {
      for (const item of cart) {
        const available = stockMap[item.product.id] ?? 0;
        if (item.quantity > available) {
          showToast('info', `Warning: ${item.product.name} will go negative (${available} available, selling ${item.quantity}).`);
        }
      }
    }

    setProcessing(true);

    const ts = Date.now().toString().slice(-6);
    const txNum = `TXN-${ts}`;
    const customer = customers.find(c => c.id === selectedCustomer);

    const { data: tx, error: txErr } = await supabase.from('pos_transactions').insert({
      transaction_number: txNum,
      session_id: sessionId,
      shift_id: sessionId,
      cashier_id: activeCashierId,
      cashier_name: activeCashierName,
      branch_id: branchId,
      customer_id: selectedCustomer || null,
      customer_name: customer?.name ?? 'Walk-in Customer',
      subtotal,
      vat_amount: vatTotal,
      total,
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === 'cash' ? Number(amountTendered) : total,
      change_due: paymentMethod === 'cash' ? Math.max(0, change) : 0,
      status: 'completed',
      created_by: profile?.id,
    }).select().maybeSingle();

    if (txErr || !tx) {
      showToast('error', 'Sale failed: ' + (txErr?.message ?? 'Could not create transaction.'));
      setProcessing(false);
      return;
    }

    const { error: itemsErr } = await supabase.from('pos_transaction_items').insert(
      cart.map(item => ({
        transaction_id: tx.id,
        product_id: item.product.id,
        description: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: 5,
        vat_amount: item.vat_amount,
        total: item.total,
      }))
    );

    if (itemsErr) {
      showToast('error', 'Items save failed: ' + itemsErr.message);
      setProcessing(false);
      return;
    }

    // Deduct stock from inventory
    const deduction = await deductStockForSale(
      cart.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
      branchId,
      tx.id,
      activeCashierId,
      activeCashierName,
      sessionId,
      txNum
    );
    if (!deduction.success) {
      showToast('error', 'Stock deduction failed: ' + deduction.message);
      // Transaction is saved but stock not deducted — show error but don't rollback
      // In production, this should trigger a manual reconciliation
    } else {
      // Update local stock map
      for (const m of deduction.movements ?? []) {
        setStockMap(prev => ({ ...prev, [m.product_id]: m.new_stock }));
      }
    }

    // Update shift expected cash
    if (shiftId && paymentMethod === 'cash') {
      const newExpected = shiftExpectedCash + total;
      await supabase.from('shift_reconciliation').update({
        expected_cash: newExpected,
        total_expected: newExpected + shiftCardSales,
      }).eq('id', shiftId);
      setShiftExpectedCash(newExpected);
    } else if (shiftId && paymentMethod !== 'cash') {
      const newCard = shiftCardSales + total;
      await supabase.from('shift_reconciliation').update({
        expected_card: newCard,
        total_expected: shiftExpectedCash + newCard,
      }).eq('id', shiftId);
      setShiftCardSales(newCard);
    }

    // Generate and show receipt
    const receiptHtml = generateReceipt({ number: txNum, items: cart, subtotal, vat: vatTotal, total, paid: paymentMethod === 'cash' ? Number(amountTendered) : total, change, method: paymentMethod });
    setLastReceiptHtml(receiptHtml);
    setShowReceiptPreview(true);

    // Auto open cash drawer for cash sales
    if (paymentMethod === 'cash' && hwSettings?.auto_open_drawer && hwSettings?.cash_drawer_enabled) {
      await doOpenCashDrawer('Cash sale: ' + txNum);
    }

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      clearCart();
      setAmountTendered('');
      setSelectedCustomer('');
    }, 2000);

    setProcessing(false);
    loadShiftTotals();
    loadProducts(); // Refresh stock levels
  };

  // Load sale items for return
  const loadSaleForReturn = async (transactionId: string, transactionNumber: string) => {
    const { data: items, error } = await supabase
      .from('pos_transaction_items')
      .select('product_id, description, quantity, unit_price')
      .eq('transaction_id', transactionId);
    if (error) { showToast('error', 'Could not load sale items: ' + error.message); return; }

    setReturnTarget({
      transaction_id: transactionId,
      transaction_number: transactionNumber,
      items: (items ?? []).map((i: { product_id: string; description: string; quantity: number; unit_price: number }) => ({
        product_id: i.product_id,
        product_name: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
    });
    const initReturn: Record<string, number> = {};
    for (const i of items ?? []) {
      initReturn[i.product_id] = 0;
    }
    setReturnItems(initReturn);
    setReturnReason('');
    setShowReturnModal(true);
  };

  // Process return/refund
  const processReturn = async () => {
    if (!returnTarget) return;
    const itemsToReturn = returnTarget.items
      .filter(i => (returnItems[i.product_id] ?? 0) > 0)
      .map(i => ({ product_id: i.product_id, quantity: returnItems[i.product_id] ?? 0 }));

    if (itemsToReturn.length === 0) {
      showToast('error', 'Select at least one item to return.');
      return;
    }

    setReturnProcessing(true);
    const returnNum = `RET-${Date.now().toString().slice(-6)}`;

    // Create a return transaction record
    const { data: retTx, error: retErr } = await supabase.from('pos_transactions').insert({
      transaction_number: returnNum,
      session_id: sessionId,
      shift_id: sessionId,
      cashier_id: activeCashierId,
      cashier_name: activeCashierName,
      branch_id: branchId,
      customer_id: null,
      customer_name: 'Return',
      subtotal: 0,
      vat_amount: 0,
      total: 0,
      payment_method: 'cash',
      amount_tendered: 0,
      change_due: 0,
      status: 'returned',
      created_by: profile?.id,
    }).select().maybeSingle();

    if (retErr || !retTx) {
      showToast('error', 'Return failed: ' + (retErr?.message ?? 'Could not create return.'));
      setReturnProcessing(false);
      return;
    }

    // Restore stock
    const restore = await restoreStockForReturn(
      itemsToReturn,
      branchId,
      retTx.id,
      returnTarget.transaction_id,
      activeCashierId,
      activeCashierName,
      sessionId,
      returnNum
    );

    if (!restore.success) {
      showToast('error', 'Stock restore failed: ' + restore.message);
      setReturnProcessing(false);
      return;
    }

    // Update local stock map
    for (const m of restore.movements ?? []) {
      setStockMap(prev => ({ ...prev, [m.product_id]: m.new_stock }));
    }

    // Save return items
    const returnItemRecords = returnTarget.items
      .filter(i => (returnItems[i.product_id] ?? 0) > 0)
      .map(i => ({
        transaction_id: retTx.id,
        product_id: i.product_id,
        description: i.product_name + ' (RETURN)',
        quantity: returnItems[i.product_id] ?? 0,
        unit_price: i.unit_price,
        vat_rate: 5,
        vat_amount: 0,
        total: -(i.unit_price * (returnItems[i.product_id] ?? 0)),
      }));

    const { error: retItemsErr } = await supabase.from('pos_transaction_items').insert(returnItemRecords);
    if (retItemsErr) {
      showToast('error', 'Return items save failed: ' + retItemsErr.message);
      setReturnProcessing(false);
      return;
    }

    setShowReturnModal(false);
    setReturnTarget(null);
    setReturnProcessing(false);
    showToast('success', `Return processed: ${returnNum}. Stock restored.`);
    loadProducts();
  };

  // Reprint receipt
  const reprintReceipt = (sale: { transaction_number: string; total: number; payment_method: string; receipt_html?: string }) => {
    if (!sale.receipt_html) {
      // Generate a simple receipt for reprint
      const html = generateReceipt({ number: sale.transaction_number, items: [], subtotal: 0, vat: 0, total: sale.total, paid: sale.total, change: 0, method: sale.payment_method });
      setLastReceiptHtml(html);
    } else {
      setLastReceiptHtml(sale.receipt_html);
    }
    setShowReceiptPreview(true);
  };

  // Load recent sales
  const loadRecentSales = async () => {
    let query = supabase.from('pos_transactions')
      .select('id, transaction_number, total, payment_method, created_at, cashier_name')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) { console.error('Sales history error:', error); return; }
    setRecentSales(data ?? []);
  };

  // Save hardware settings
  const saveHardwareSettings = async (settings: Partial<PosHardwareSettings>) => {
    if (!branchId || !hwSettings) return;
    const { error } = await supabase.from('pos_hardware_settings').update({
      ...settings,
      updated_at: new Date().toISOString(),
    }).eq('id', hwSettings.id);
    if (error) {
      showToast('error', 'Could not save settings: ' + error.message);
      return;
    }
    setHwSettings({ ...hwSettings, ...settings });
    showToast('success', 'Hardware settings saved.');
  };

  // Test print handler
  const handleTestPrint = async () => {
    if (!hwSettings) return;
    const testHtml = generateReceipt({ number: 'TEST-001', items: [{ product: { id: '', code: '', name: 'Test Item', name_ar: 'عنصر تجريبي', description: '', category_id: null, unit: 'pcs', cost_price: 0, selling_price: 10, stock_quantity: 0, reorder_level: 0, is_active: true, branch_id: null, barcode: null, created_at: '', updated_at: '' }, quantity: 1, unit_price: 10, vat_amount: 0.5, total: 10.5 }], subtotal: 10, vat: 0.5, total: 10.5, paid: 10.5, change: 0, method: 'cash' });
    const result = await testPrint(hwSettings, testHtml);
    setHardwareMessage(result.message);
    if (result.success) {
      await supabase.from('pos_hardware_settings').update({ test_printed_at: new Date().toISOString() }).eq('id', hwSettings.id);
    }
  };

  // Test drawer handler
  const handleTestDrawer = async () => {
    if (!hwSettings) return;
    const result = await testCashDrawer(hwSettings);
    setHardwareMessage(result.message);
    if (result.success) {
      await supabase.from('pos_hardware_settings').update({ test_drawer_at: new Date().toISOString() }).eq('id', hwSettings.id);
    }
  };

  // Detect QZ Tray
  const handleDetectQz = async () => {
    setQzDetecting(true);
    const ok = await detectQzTray();
    setQzConnected(ok);
    setPrinterStatus(ok ? 'connected' : 'disconnected');
    setQzDetecting(false);
    setHardwareMessage(ok ? 'QZ Tray detected and running.' : 'QZ Tray not found. Download from https://qz.io and start it.');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode ?? '').includes(search)
  );

  // Beep sound for scanner feedback
  const playBeep = (success: boolean) => {
    if (!beepEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 880 : 220;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      setTimeout(() => ctx.close(), 200);
    } catch { /* audio not available */ }
  };

  // Handle barcode scan: search by barcode, then SKU, add to cart
  const handleBarcodeScan = (scanned: string) => {
    const code = scanned.trim();
    if (!code) return;

    const product = products.find(p => p.barcode === code) ??
                    products.find(p => p.code === code) ??
                    products.find(p => p.barcode === code.toUpperCase()) ??
                    products.find(p => p.code === code.toUpperCase());

    if (!product) {
      playBeep(false);
      showToast('error', `Product not found: ${code}`);
      setBarcodeInput('');
      barcodeRef.current?.focus();
      return;
    }

    const stock = stockMap[product.id] ?? 0;
    const existing = cart.find(c => c.product.id === product.id);
    const requestedQty = existing ? existing.quantity + 1 : 1;

    if (stock <= 0 || requestedQty > stock) {
      playBeep(false);
      showToast('error', `Insufficient stock: ${product.name} (${stock} available)`);
      setBarcodeInput('');
      barcodeRef.current?.focus();
      return;
    }

    addToCart(product);
    playBeep(true);
    showToast('success', `${product.name} added to cart`);
    setBarcodeInput('');
    barcodeRef.current?.focus();
  };

  // Keep barcode input focused when scanner is active
  useEffect(() => {
    if (scannerActive && !showShiftModal && !showReconcileModal && !showHardwareModal && !showReceiptPreview && !showHistory && !showReturnModal) {
      barcodeRef.current?.focus();
    }
  }, [scannerActive, showShiftModal, showReconcileModal, showHardwareModal, showReceiptPreview, showHistory, showReturnModal, cart.length]);

  const expectedCashForClose = shiftOpeningCash + shiftCashSales;
  const cashVariance = reconcileForm.actual_cash - expectedCashForClose;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          'bg-blue-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Products Section */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Search & Controls */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          {/* Barcode Scanner Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${scannerActive ? 'text-blue-500' : 'text-slate-400'}`} />
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeScan(barcodeInput); } }}
                disabled={!scannerActive}
                placeholder={scannerActive ? 'Scan barcode or type code + Enter...' : 'Scanner disabled'}
                className={`w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${scannerActive ? 'border-blue-300 focus:ring-blue-500 bg-blue-50/30' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
              />
            </div>
            <button onClick={() => setScannerActive(!scannerActive)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${scannerActive ? 'bg-green-50 border-green-300 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
              title="Toggle scanner mode">
              {scannerActive ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {scannerActive ? 'Scanner ON' : 'Scanner OFF'}
            </button>
            <button onClick={() => setBeepEnabled(!beepEnabled)}
              className={`p-2 rounded-lg border ${beepEnabled ? 'border-green-300 text-green-600' : 'border-slate-200 text-slate-400'}`}
              title="Toggle beep sound">
              {beepEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => { loadRecentSales(); setShowHistory(true); }} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" title="Sales History">
              <Clock size={18} className="text-slate-500" />
            </button>
            <button onClick={() => setShowHardwareModal(true)} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50" title="Hardware Settings">
              <Settings size={18} className="text-slate-500" />
            </button>
          </div>

          {/* Shift & Cashier Status Bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-4">
              {hasActiveShift ? (
                <>
                  <span className="flex items-center gap-2 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Shift Active
                  </span>
                  <span className="text-slate-500">Opening: {formatCurrency(shiftOpeningCash)}</span>
                  <span className="text-slate-500">Cash Sales: {formatCurrency(shiftCashSales)}</span>
                  <button onClick={() => setShowReconcileModal(true)} className="text-blue-600 hover:underline font-medium">
                    Close Shift
                  </button>
                </>
              ) : (
                <button onClick={() => { setOpeningCashInput('0'); setShiftError(''); setShowShiftModal(true); }} className="flex items-center gap-2 text-blue-600 font-medium">
                  <Clock size={14} /> Start Shift
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Cashier selector */}
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-400" />
                {profile?.role === 'admin' ? (
                  <select value={selectedCashierId} onChange={e => setSelectedCashierId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs">
                    {cashiers.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.role})</option>)}
                  </select>
                ) : (
                  <span className="text-xs text-slate-600">{activeCashierName}</span>
                )}
              </div>

              {/* Printer status */}
              <div className="flex items-center gap-1">
                <PrinterIcon size={14} className={printerStatus === 'connected' ? 'text-green-500' : printerStatus === 'disconnected' ? 'text-red-500' : 'text-slate-400'} />
                <span className={`text-xs ${printerStatus === 'connected' ? 'text-green-600' : printerStatus === 'disconnected' ? 'text-red-600' : 'text-slate-400'}`}>
                  {printerStatus === 'connected' ? 'Printer Ready' : printerStatus === 'disconnected' ? 'Printer Off' : 'Printer?'}
                </span>
              </div>

              {/* Cash drawer */}
              {cashDrawer && (
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 ${drawerStatus === 'open' ? 'text-green-600' : 'text-slate-500'}`}>
                    {drawerStatus === 'open' ? <Unlock size={14} /> : <Lock size={14} />}
                    Drawer: {drawerStatus}
                  </span>
                  <button onClick={() => doOpenCashDrawer('Manual open')} className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50">
                    Open Drawer
                  </button>
                </div>
              )}
            </div>
          </div>

          {shiftError && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
              <AlertTriangle size={14} /> {shiftError}
            </div>
          )}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map(p => {
              const stock = stockMap[p.id] ?? 0;
              const outOfStock = stock <= 0;
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={!hasActiveShift || outOfStock}
                  className={`border rounded-lg p-3 text-left transition-colors disabled:cursor-not-allowed ${
                    outOfStock
                      ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                      : 'bg-slate-50 hover:bg-blue-50 border-slate-200 hover:border-blue-300 disabled:opacity-50'
                  }`}>
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                    <span className="text-lg font-medium text-blue-600">{p.name.charAt(0)}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.code}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold text-blue-600">{formatCurrency(p.selling_price)}</span>
                    <span className={`text-xs font-medium ${outOfStock ? 'text-red-500' : stock <= p.reorder_level ? 'text-amber-500' : 'text-slate-500'}`}>
                      {outOfStock ? 'Out of stock' : `${stock} ${p.unit}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {products.length === 0 && (
            <div className="text-center text-slate-400 py-10">No products found.</div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-96 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <ShoppingCart size={18} /> Current Sale
            </h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-600">Clear All</button>
            )}
          </div>
        </div>

        {/* Customer Selection */}
        <div className="p-3 border-b border-slate-200">
          <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Walk-in Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
              <ShoppingCart size={40} className="mb-2 opacity-30" />
              <p className="text-sm">No items in cart</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{item.product.name}</div>
                <div className="text-xs text-slate-400">{formatCurrency(item.unit_price)} x {item.quantity}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300">
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300">
                  <Plus size={12} />
                </button>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800">{formatCurrency(item.total)}</div>
                <button onClick={() => updateQuantity(item.product.id, 0)} className="text-xs text-red-400 hover:text-red-600">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-slate-200 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-800">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">VAT (5%)</span>
            <span className="text-slate-800">{formatCurrency(vatTotal)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
            <span>Total</span>
            <span className="text-blue-600">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex gap-2">
            {(['cash', 'card', 'bank_transfer'] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === m
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {m === 'cash' ? <Banknote size={14} /> : m === 'card' ? <CreditCard size={14} /> : <DollarSign size={14} />}
                <span className="capitalize">{m === 'bank_transfer' ? 'Transfer' : m}</span>
              </button>
            ))}
          </div>

          {paymentMethod === 'cash' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Amount Tendered</label>
              <input type="number" value={amountTendered} onChange={e => setAmountTendered(e.target.value)}
                placeholder="0.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-lg font-medium" />
              {Number(amountTendered) >= total && (
                <div className="mt-2 text-sm text-slate-600">
                  Change: <span className="font-bold text-green-600">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          )}

          <button onClick={processPayment} disabled={processing || cart.length === 0 || (paymentMethod === 'cash' && Number(amountTendered) < total) || !hasActiveShift}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
            {processing ? 'Processing...' : showSuccess ? <><CheckCircle size={18} /> Completed!</> : `Pay ${formatCurrency(total)}`}
          </button>

          {!hasActiveShift && (
            <p className="text-xs text-amber-600 text-center">Start a shift to process payments</p>
          )}
        </div>
      </div>

      {/* Start Shift Modal */}
      <Modal isOpen={showShiftModal} onClose={() => setShowShiftModal(false)} title="Start Shift" size="sm">
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-slate-600">
            <div className="flex items-center gap-2 mb-1">
              <User size={14} /> Cashier: <span className="font-medium">{activeCashierName}</span>
            </div>
            <div className="flex items-center gap-2">
              {currentBranchData ? `Branch: ${currentBranchData.name}` : 'No branch assigned'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Opening Cash Amount</label>
            <input type="number" value={openingCashInput} onChange={e => setOpeningCashInput(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-lg font-medium" placeholder="0.00" />
          </div>
          {shiftError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertTriangle size={16} /> {shiftError}
            </div>
          )}
          <button onClick={startShift} disabled={shiftLoading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2 rounded-lg font-medium">
            {shiftLoading ? 'Starting...' : 'Start Shift'}
          </button>
        </div>
      </Modal>

      {/* Close Shift / Reconciliation Modal */}
      <Modal isOpen={showReconcileModal} onClose={() => setShowReconcileModal(false)} title="Close Shift & Reconcile" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-slate-500">Opening Cash</div>
              <div className="font-semibold">{formatCurrency(shiftOpeningCash)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Cash Sales</div>
              <div className="font-semibold">{formatCurrency(shiftCashSales)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Card Sales</div>
              <div className="font-semibold">{formatCurrency(shiftCardSales)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Expected Cash</div>
              <div className="font-semibold">{formatCurrency(expectedCashForClose)}</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Actual Cash Counted *</label>
            <input type="number" value={reconcileForm.actual_cash}
              onChange={e => setReconcileForm(f => ({ ...f, actual_cash: Number(e.target.value) }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-lg font-medium" />
            <div className="mt-1 text-sm">
              Variance: <span className={`font-bold ${cashVariance !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(cashVariance)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Actual Card Sales</label>
            <input type="number" value={reconcileForm.actual_card}
              onChange={e => setReconcileForm(f => ({ ...f, actual_card: Number(e.target.value) }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={reconcileForm.notes}
              onChange={e => setReconcileForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {Math.abs(cashVariance) > 50 && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertTriangle size={16} />
              <span className="text-sm">Large variance detected. Please provide an explanation in notes.</span>
            </div>
          )}

          {shiftError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertTriangle size={16} /> {shiftError}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={closeShift} disabled={shiftLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg font-medium">
              {shiftLoading ? 'Closing...' : 'Close Shift'}
            </button>
            <button onClick={() => setShowReconcileModal(false)}
              className="px-6 py-2 border border-slate-200 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Hardware Settings Modal */}
      <Modal isOpen={showHardwareModal} onClose={() => setShowHardwareModal(false)} title="POS Hardware Settings" size="lg">
        <div className="space-y-5">
          {/* Printer Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Printer Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { mode: 'browser', label: 'Browser Print', icon: <PrinterIcon size={16} /> },
                { mode: 'qz_tray', label: 'QZ Tray', icon: <Usb size={16} /> },
                { mode: 'webusb', label: 'WebUSB', icon: <Wifi size={16} /> },
              ] as const).map(opt => (
                <button key={opt.mode} onClick={() => saveHardwareSettings({ printer_mode: opt.mode as PrinterMode })}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    hwSettings?.printer_mode === opt.mode
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {opt.icon}
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* QZ Tray Status */}
          {hwSettings?.printer_mode === 'qz_tray' && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">QZ Tray Status</span>
                <span className={`flex items-center gap-1 text-sm ${qzConnected ? 'text-green-600' : 'text-red-600'}`}>
                  <div className={`w-2 h-2 rounded-full ${qzConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {qzDetecting ? 'Detecting...' : qzConnected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <button onClick={handleDetectQz} disabled={qzDetecting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                {qzDetecting ? 'Detecting...' : 'Detect QZ Tray'}
              </button>
              {!qzConnected && (
                <p className="text-xs text-slate-500">
                  QZ Tray is not running. Download it from https://qz.io, install it, and start the QZ Tray app.
                </p>
              )}
            </div>
          )}

          {/* Printer Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Printer Name (for QZ Tray)</label>
            <input type="text" value={hwSettings?.printer_name ?? ''} placeholder="POSTECH PT-88IV"
              onChange={e => saveHardwareSettings({ printer_name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-slate-400 mt-1">Enter the exact printer name as shown in your OS. For Browser Print mode, select the printer from the system dialog.</p>
          </div>

          {/* Receipt Width */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Receipt Width</label>
            <div className="flex gap-2">
              {(['58mm', '80mm'] as const).map(w => (
                <button key={w} onClick={() => saveHardwareSettings({ receipt_width: w })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                    hwSettings?.receipt_width === w
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Cash Drawer */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Enable Cash Drawer</span>
              <button onClick={() => saveHardwareSettings({ cash_drawer_enabled: !hwSettings?.cash_drawer_enabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${hwSettings?.cash_drawer_enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${hwSettings?.cash_drawer_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Auto-open after cash sale</span>
              <button onClick={() => saveHardwareSettings({ auto_open_drawer: !hwSettings?.auto_open_drawer })}
                className={`relative w-12 h-6 rounded-full transition-colors ${hwSettings?.auto_open_drawer ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${hwSettings?.auto_open_drawer ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cash Drawer Command (ESC/POS)</label>
              <input type="text" value={hwSettings?.cash_drawer_command ?? DEFAULT_DRAWER_COMMAND}
                onChange={e => saveHardwareSettings({ cash_drawer_command: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
              <p className="text-xs text-slate-400 mt-1">Default: ESC p 0 25 250 (standard pulse for NOGTEK drawers connected via printer)</p>
            </div>
          </div>

          {/* Test buttons */}
          <div className="border-t border-slate-200 pt-4 flex gap-3">
            <button onClick={handleTestPrint}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium text-sm">
              <PrinterIcon size={14} /> Test Print
            </button>
            <button onClick={handleTestDrawer}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg font-medium text-sm">
              <Unlock size={14} /> Test Cash Drawer
            </button>
          </div>

          {hardwareMessage && (
            <div className={`p-3 rounded-lg text-sm ${hardwareMessage.includes('not') || hardwareMessage.includes('failed') || hardwareMessage.includes('error') || hardwareMessage.includes('Could') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {hardwareMessage}
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">Hardware Info</p>
            <p>Printer: POSTECH PT-88IV (USB) | Paper: 80mm | Drawer: NOGTEK (via printer RJ11)</p>
          </div>
        </div>
      </Modal>

      {/* Receipt Preview Modal */}
      <Modal isOpen={showReceiptPreview} onClose={() => setShowReceiptPreview(false)} title="Receipt Preview" size="sm">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
          <iframe srcDoc={lastReceiptHtml} title="Receipt Preview" className="w-full border-0" style={{ minHeight: '400px' }} />
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={() => doPrintReceipt(lastReceiptHtml)}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2">
            <PrinterIcon size={14} /> Print Receipt
          </button>
          {hwSettings?.cash_drawer_enabled && (
            <button onClick={() => doOpenCashDrawer('Manual from receipt')}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2">
              <Unlock size={14} /> Open Drawer
            </button>
          )}
          <button onClick={() => setShowReceiptPreview(false)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </Modal>

      {/* Sales History Modal */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Recent POS Sales" size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {recentSales.length === 0 ? (
            <div className="text-center text-slate-400 py-8">No sales found.</div>
          ) : recentSales.map(sale => (
            <div key={sale.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <div className="font-medium text-sm">{sale.transaction_number}</div>
                <div className="text-xs text-slate-500">
                  {new Date(sale.created_at).toLocaleString('en-GB')} | {sale.cashier_name || 'Unknown'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold text-sm">{formatCurrency(Number(sale.total))}</div>
                  <div className="text-xs text-slate-400 capitalize">{sale.payment_method}</div>
                </div>
                <button onClick={() => reprintReceipt(sale)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100" title="Reprint Receipt">
                  <PrinterIcon size={14} className="text-slate-500" />
                </button>
                <button onClick={() => loadSaleForReturn(sale.id, sale.transaction_number)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-red-50" title="Return/Refund">
                  <RotateCcw size={14} className="text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Return / Refund Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title={`Return / Refund — ${returnTarget?.transaction_number ?? ''}`} size="lg">
        {returnTarget && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <RotateCcw size={16} />
              Select items to return. Stock will be restored to inventory automatically.
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {returnTarget.items.map(item => (
                <div key={item.product_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{item.product_name}</div>
                    <div className="text-xs text-slate-400">Sold: {item.quantity} @ {formatCurrency(item.unit_price)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={item.quantity}
                      value={returnItems[item.product_id] ?? 0}
                      onChange={e => setReturnItems(prev => ({ ...prev, [item.product_id]: Math.min(item.quantity, Math.max(0, Number(e.target.value))) }))}
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-slate-400">/ {item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Return Reason</label>
              <input type="text" value={returnReason} onChange={e => setReturnReason(e.target.value)}
                placeholder="Damaged, customer changed mind, etc."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={processReturn} disabled={returnProcessing}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2">
                <RotateCcw size={14} /> {returnProcessing ? 'Processing...' : 'Process Return'}
              </button>
              <button onClick={() => setShowReturnModal(false)}
                className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
