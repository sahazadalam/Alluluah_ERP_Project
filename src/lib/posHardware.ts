/**
 * POS hardware integration for thermal printers and cash drawers.
 * Supports three modes: Browser Print, QZ Tray, and WebUSB.
 */

export type PrinterMode = 'browser' | 'qz_tray' | 'webusb';

export interface PosHardwareSettings {
  id: string;
  branch_id: string;
  printer_mode: PrinterMode;
  printer_name: string;
  receipt_width: '58mm' | '80mm';
  cash_drawer_enabled: boolean;
  cash_drawer_command: string;
  auto_open_drawer: boolean;
  test_printed_at: string | null;
  test_drawer_at: string | null;
}

// ESC/POS cash drawer kick command: ESC p m t1 t2
// Standard pulse for most drawers: \x1B\x70\x00\x19\xFA
export const DEFAULT_DRAWER_COMMAND = '\x1B\x70\x00\x19\xFA';

// QZ Tray WebSocket URL
const QZ_DEFAULT_URL = 'ws://localhost:8181';

let qzSocket: WebSocket | null = null;

export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface QzPrinterInfo {
  name: string;
  driver: string | null;
}

/**
 * Detect whether QZ Tray is running by attempting a WebSocket connection.
 */
export function detectQzTray(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(QZ_DEFAULT_URL);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Connect to QZ Tray via WebSocket and keep the connection open.
 */
export function connectQzTray(): Promise<boolean> {
  return new Promise((resolve) => {
    if (qzSocket && qzSocket.readyState === WebSocket.OPEN) {
      resolve(true);
      return;
    }
    try {
      qzSocket = new WebSocket(QZ_DEFAULT_URL);
      const timeout = setTimeout(() => {
        if (qzSocket && qzSocket.readyState !== WebSocket.OPEN) {
          qzSocket.close();
          qzSocket = null;
          resolve(false);
        }
      }, 5000);

      qzSocket.onopen = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      qzSocket.onerror = () => {
        clearTimeout(timeout);
        qzSocket = null;
        resolve(false);
      };

      qzSocket.onclose = () => {
        qzSocket = null;
      };
    } catch {
      qzSocket = null;
      resolve(false);
    }
  });
}

export function disconnectQzTray() {
  if (qzSocket) {
    qzSocket.close();
    qzSocket = null;
  }
}

export function isQzConnected(): boolean {
  return qzSocket !== null && qzSocket.readyState === WebSocket.OPEN;
}

/**
 * Send a raw ESC/POS byte array to the specified printer via QZ Tray.
 * Returns a promise that resolves when the data is sent.
 */
export function sendEscPosViaQz(printerName: string, data: Uint8Array): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!qzSocket || qzSocket.readyState !== WebSocket.OPEN) {
      reject(new Error('QZ Tray is not connected. Start QZ Tray and try again.'));
      return;
    }

    const message = {
      type: 'print',
      printer: printerName,
      data: Array.from(data),
    };

    const handler = (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data);
        if (response.type === 'print_result') {
          qzSocket?.removeEventListener('message', handler);
          if (response.success) {
            resolve(true);
          } else {
            reject(new Error(response.error || 'Print failed'));
          }
        }
      } catch {
        qzSocket?.removeEventListener('message', handler);
        reject(new Error('Invalid response from QZ Tray'));
      }
    };

    qzSocket.addEventListener('message', handler);
    qzSocket.send(JSON.stringify(message));

    setTimeout(() => {
      qzSocket?.removeEventListener('message', handler);
      reject(new Error('QZ Tray print timeout'));
    }, 10000);
  });
}

/**
 * Open the cash drawer via QZ Tray by sending the ESC/POS kick command.
 */
export function openCashDrawerViaQz(printerName: string, command: string = DEFAULT_DRAWER_COMMAND): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(command);
  return sendEscPosViaQz(printerName, data);
}

/**
 * Browser print mode: open a new window with the receipt HTML and call print.
 * The user selects the thermal printer from the system print dialog.
 */
export function browserPrintReceipt(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) {
      resolve(false);
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();

    setTimeout(() => {
      try {
        win.print();
        resolve(true);
      } catch {
        resolve(false);
      }
    }, 500);
  });
}

/**
 * Convert a receipt HTML string to ESC/POS byte array (simplified).
 * For a full implementation, use a library like escpos.js.
 * This sends a basic text representation with ESC/POS formatting commands.
 */
export function htmlToEscPos(html: string): Uint8Array {
  // Strip HTML tags and convert to plain text lines
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const encoder = new TextEncoder();
  const lines = text.split('\n');
  const chunks: Uint8Array[] = [];

  // ESC @ — initialize printer
  chunks.push(encoder.encode('\x1B\x40'));

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      chunks.push(encoder.encode('\n'));
      continue;
    }
    chunks.push(encoder.encode(trimmed + '\n'));
  }

  // Feed and cut
  chunks.push(encoder.encode('\n\n\n\x1D\x56\x00'));

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Test print — sends a small test receipt.
 */
export async function testPrint(settings: PosHardwareSettings, receiptHtml: string): Promise<{ success: boolean; message: string }> {
  if (settings.printer_mode === 'browser') {
    const ok = await browserPrintReceipt(receiptHtml);
    return { success: ok, message: ok ? 'Print dialog opened. Select your thermal printer.' : 'Could not open print window. Check popup blocker.' };
  }

  if (settings.printer_mode === 'qz_tray') {
    const connected = await connectQzTray();
    if (!connected) {
      return { success: false, message: 'QZ Tray is not running. Download from https://qz.io and start it.' };
    }
    try {
      const data = htmlToEscPos(receiptHtml);
      await sendEscPosViaQz(settings.printer_name || 'POSTECH PT-88IV', data);
      return { success: true, message: 'Test print sent to ' + (settings.printer_name || 'POSTECH PT-88IV') };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Print failed' };
    }
  }

  return { success: false, message: 'WebUSB mode is not yet supported. Use Browser Print or QZ Tray.' };
}

/**
 * Test cash drawer — sends the kick command.
 */
export async function testCashDrawer(settings: PosHardwareSettings): Promise<{ success: boolean; message: string }> {
  if (!settings.cash_drawer_enabled) {
    return { success: false, message: 'Cash drawer is disabled in settings.' };
  }

  if (settings.printer_mode === 'browser') {
    // Browser print mode cannot directly send ESC/POS commands.
    // Open a minimal print window that triggers the drawer via the printer driver.
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{margin:0;size:80mm auto;}body{font-family:monospace;font-size:10px;}</style></head><body><pre>\x1B\x70\x00\x19\xFA</pre></body></html>`;
    const ok = await browserPrintReceipt(html);
    return { success: ok, message: ok ? 'Cash drawer command sent via browser print. Select your thermal printer.' : 'Could not open print window.' };
  }

  if (settings.printer_mode === 'qz_tray') {
    const connected = await connectQzTray();
    if (!connected) {
      return { success: false, message: 'QZ Tray is not running. Download from https://qz.io and start it.' };
    }
    try {
      await openCashDrawerViaQz(settings.printer_name || 'POSTECH PT-88IV', settings.cash_drawer_command || DEFAULT_DRAWER_COMMAND);
      return { success: true, message: 'Cash drawer kick command sent.' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Drawer command failed' };
    }
  }

  return { success: false, message: 'WebUSB mode is not yet supported.' };
}
