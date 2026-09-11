import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AttendanceRecord, Employee, LeaveRequest, AttendanceDevice, AttendanceSyncLog } from '../../lib/types';
import { formatDate } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, X, Check, ChevronLeft, ChevronRight, UserCheck, Fingerprint, Upload, Wifi, WifiOff, AlertTriangle, FileSpreadsheet, RefreshCw, Cpu } from 'lucide-react';

interface Props { branchFilter: string | null; }

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-700 border-green-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  half_day: 'bg-amber-100 text-amber-700 border-amber-200',
  late: 'bg-orange-100 text-orange-700 border-orange-200',
  early_leave: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  holiday: 'bg-blue-100 text-blue-700 border-blue-200',
  weekend: 'bg-slate-100 text-slate-500 border-slate-200',
  leave: 'bg-purple-100 text-purple-700 border-purple-200',
};

const DEVICE_TYPE_ICONS: Record<string, typeof Fingerprint> = {
  zkteco: Fingerprint,
  generic_csv: FileSpreadsheet,
  manual: UserCheck,
};

export default function AttendancePage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'daily' | 'leave' | 'devices' | 'reports' | 'sync_logs'>('daily');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [attendanceForm, setAttendanceForm] = useState({ status: 'present' as AttendanceRecord['status'], check_in_time: '08:00', check_out_time: '17:00', overtime_hours: 0, notes: '' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type: 'annual' as LeaveRequest['leave_type'], start_date: '', end_date: '', days_requested: 1, reason: '' });
  const [saving, setSaving] = useState(false);

  // Device state
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<AttendanceDevice | null>(null);
  const [deviceForm, setDeviceForm] = useState({ device_name: '', device_type: 'generic_csv' as AttendanceDevice['device_type'], ip_address: '', port: '4370', location: '', is_active: true });
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [testingDevice, setTestingDevice] = useState<string | null>(null);

  // CSV import state
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDeviceId, setCsvDeviceId] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; duplicates: number; unmatched: number; errors: string[] } | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Sync logs state
  const [syncLogs, setSyncLogs] = useState<AttendanceSyncLog[]>([]);
  const [syncLogsLoading, setSyncLogsLoading] = useState(false);

  // Reports state
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState<{ employee: Employee; present: number; absent: number; late: number; leave: number; overtime: number; totalHours: number }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => { loadData(); }, [branchFilter, date]);

  const loadData = async () => {
    setLoading(true);
    let empQ = supabase.from('employees').select('*').eq('status', 'active').order('full_name');
    if (branchFilter) empQ = empQ.eq('branch_id', branchFilter);

    let recQ = supabase.from('attendance_records').select('*').eq('attendance_date', date);
    if (branchFilter) recQ = recQ.eq('branch_id', branchFilter);

    const [{ data: emps }, { data: recs }] = await Promise.all([
      empQ,
      recQ,
    ]);
    setEmployees(emps ?? []);
    setRecords(recs ?? []);
    setLoading(false);
  };

  const loadLeaves = async () => {
    let q = supabase.from('leave_requests').select('*, employee:employees(full_name, employee_id)').order('created_at', { ascending: false });
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setLeaves((data ?? []) as LeaveRequest[]);
  };

  const loadDevices = async () => {
    setDevicesLoading(true);
    let q = supabase.from('attendance_devices').select('*').order('created_at', { ascending: false });
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setDevices(data ?? []);
    setDevicesLoading(false);
  };

  const loadSyncLogs = async () => {
    setSyncLogsLoading(true);
    let q = supabase.from('attendance_device_sync_logs')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setSyncLogs(data ?? []);
    setSyncLogsLoading(false);
  };

  const loadReport = async () => {
    setReportLoading(true);
    const [year, month] = reportMonth.split('-');
    const startDate = `${reportMonth}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    let empQ = supabase.from('employees').select('*').order('full_name');
    if (branchFilter) empQ = empQ.eq('branch_id', branchFilter);
    const { data: emps } = await empQ;

    let recQ = supabase.from('attendance_records').select('*').gte('attendance_date', startDate).lte('attendance_date', endDate);
    if (branchFilter) recQ = recQ.eq('branch_id', branchFilter);
    const { data: recs } = await recQ;

    const summary = (emps ?? []).map(emp => {
      const empRecs = (recs ?? []).filter(r => r.employee_id === emp.id);
      return {
        employee: emp,
        present: empRecs.filter(r => r.status === 'present').length,
        absent: empRecs.filter(r => r.status === 'absent').length,
        late: empRecs.filter(r => r.status === 'late').length,
        leave: empRecs.filter(r => r.status === 'leave').length,
        overtime: empRecs.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
        totalHours: empRecs.reduce((s, r) => s + (r.hours_worked ?? 0), 0),
      };
    });
    setReportData(summary);
    setReportLoading(false);
  };

  useEffect(() => { if (tab === 'leave') loadLeaves(); }, [tab, branchFilter]);
  useEffect(() => { if (tab === 'devices') loadDevices(); }, [tab, branchFilter]);
  useEffect(() => { if (tab === 'sync_logs') loadSyncLogs(); }, [tab]);
  useEffect(() => { if (tab === 'reports') loadReport(); }, [tab, reportMonth, branchFilter]);

  const openMarkModal = (emp: Employee) => {
    setSelectedEmployee(emp);
    const existing = records.find(r => r.employee_id === emp.id);
    if (existing) {
      setAttendanceForm({ status: existing.status, check_in_time: existing.check_in_time ?? '08:00', check_out_time: existing.check_out_time ?? '17:00', overtime_hours: existing.overtime_hours, notes: existing.notes });
    } else {
      setAttendanceForm({ status: 'present', check_in_time: '08:00', check_out_time: '17:00', overtime_hours: 0, notes: '' });
    }
    setShowMarkModal(true);
  };

  const markAttendance = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    const hoursIn = attendanceForm.check_in_time ? parseInt(attendanceForm.check_in_time.split(':')[0]) + parseInt(attendanceForm.check_in_time.split(':')[1]) / 60 : 0;
    const hoursOut = attendanceForm.check_out_time ? parseInt(attendanceForm.check_out_time.split(':')[0]) + parseInt(attendanceForm.check_out_time.split(':')[1]) / 60 : 0;
    const hours_worked = attendanceForm.status === 'present' || attendanceForm.status === 'late' ? Math.max(0, hoursOut - hoursIn) : attendanceForm.status === 'half_day' ? 4 : 0;

    const payload = {
      employee_id: selectedEmployee.id,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      attendance_date: date,
      check_in_time: attendanceForm.check_in_time || null,
      check_out_time: attendanceForm.check_out_time || null,
      hours_worked: parseFloat(hours_worked.toFixed(2)),
      overtime_hours: attendanceForm.overtime_hours,
      status: attendanceForm.status,
      notes: attendanceForm.notes,
      marked_by: profile?.id,
    };

    const existing = records.find(r => r.employee_id === selectedEmployee.id);
    const { error } = existing
      ? await supabase.from('attendance_records').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('attendance_records').insert(payload);
    if (error) { setSaving(false); alert('Failed to save attendance: ' + error.message); return; }
    setSaving(false);
    setShowMarkModal(false);
    loadData();
  };

  const bulkMarkPresent = async () => {
    const unmarked = employees.filter(e => !records.find(r => r.employee_id === e.id));
    if (unmarked.length === 0) return;
    const inserts = unmarked.map(e => ({
      employee_id: e.id, branch_id: branchFilter ?? profile?.branch_id ?? null,
      attendance_date: date, check_in_time: '08:00', check_out_time: '17:00',
      hours_worked: 9, overtime_hours: 0, status: 'present' as const, marked_by: profile?.id,
    }));
    const { error } = await supabase.from('attendance_records').insert(inserts);
    if (error) { alert('Failed to mark attendance: ' + error.message); return; }
    loadData();
  };

  const approveLeave = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.from('leave_requests').update({ status, approved_by: profile?.id, approved_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Failed to update leave: ' + error.message); return; }
    loadLeaves();
  };

  const submitLeave = async () => {
    setSaving(true);
    const { error } = await supabase.from('leave_requests').insert({
      ...leaveForm,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      created_by: profile?.id,
    });
    if (error) { setSaving(false); alert('Failed to submit leave: ' + error.message); return; }
    setSaving(false);
    setShowLeaveModal(false);
    if (tab === 'leave') loadLeaves();
  };

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  };

  const filteredEmployees = employees.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()));

  const summaryStats = {
    present: records.filter(r => r.status === 'present').length,
    absent: records.filter(r => r.status === 'absent').length,
    late: records.filter(r => r.status === 'late').length,
    leave: records.filter(r => r.status === 'leave').length,
    totalOT: records.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
  };

  // ---- Device management ----
  const openAddDevice = () => {
    setEditingDevice(null);
    setDeviceForm({ device_name: '', device_type: 'generic_csv', ip_address: '', port: '4370', location: '', is_active: true });
    setDeviceError('');
    setShowDeviceModal(true);
  };

  const openEditDevice = (d: AttendanceDevice) => {
    setEditingDevice(d);
    setDeviceForm({ device_name: d.device_name, device_type: d.device_type, ip_address: d.ip_address ?? '', port: d.port?.toString() ?? '4370', location: d.location ?? '', is_active: d.is_active });
    setDeviceError('');
    setShowDeviceModal(true);
  };

  const saveDevice = async () => {
    if (!deviceForm.device_name.trim()) { setDeviceError('Device name is required'); return; }
    setDeviceSaving(true);
    setDeviceError('');
    const payload = {
      device_name: deviceForm.device_name.trim(),
      device_type: deviceForm.device_type,
      ip_address: deviceForm.ip_address || null,
      port: deviceForm.port ? parseInt(deviceForm.port) : null,
      location: deviceForm.location || null,
      is_active: deviceForm.is_active,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (editingDevice) {
      const { error } = await supabase.from('attendance_devices').update(payload).eq('id', editingDevice.id);
      if (error) { setDeviceError(error.message); setDeviceSaving(false); return; }
    } else {
      const { error } = await supabase.from('attendance_devices').insert(payload);
      if (error) { setDeviceError(error.message); setDeviceSaving(false); return; }
    }
    setDeviceSaving(false);
    setShowDeviceModal(false);
    loadDevices();
  };

  const testConnection = async (d: AttendanceDevice) => {
    setTestingDevice(d.id);
    // Log the test attempt
    await supabase.from('attendance_device_sync_logs').insert({
      device_id: d.id,
      sync_type: 'test_connection',
      status: 'success',
      records_processed: 0,
      records_imported: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_by: profile?.id,
      errors: d.device_type === 'zkteco' ? 'Browser-based ERP cannot directly reach LAN devices. Use CSV export/import or a local sync bridge.' : null,
    });
    // Update device status
    await supabase.from('attendance_devices').update({
      connection_status: d.device_type === 'zkteco' ? 'offline' : 'online',
      updated_at: new Date().toISOString(),
    }).eq('id', d.id);
    setTestingDevice(null);
    loadDevices();
  };

  // ---- CSV Import ----
  const openCsvImport = () => {
    setCsvFile(null);
    setCsvResult(null);
    setCsvDeviceId(devices[0]?.id ?? '');
    setShowCsvModal(true);
  };

  const onCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvResult(null);
  };

  const parseCsv = (text: string): { employeeCode: string; biometricId: string; date: string; time: string; punchType: string; deviceName: string }[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    // Detect delimiter (comma or semicolon)
    const delimiter = lines[0].includes(';') ? ';' : ',';
    // Skip header row
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const parts = line.split(delimiter).map(p => p.trim());
      return {
        employeeCode: parts[0] ?? '',
        biometricId: parts[1] ?? '',
        date: parts[2] ?? '',
        time: parts[3] ?? '',
        punchType: (parts[4] ?? 'IN').toUpperCase(),
        deviceName: parts[5] ?? '',
      };
    });
  };

  const importCsv = async () => {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await csvFile.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvResult({ imported: 0, duplicates: 0, unmatched: 0, errors: ['CSV file is empty or has no data rows'] });
        setCsvImporting(false);
        return;
      }

      // Load all employees for matching
      let empQ = supabase.from('employees').select('id, employee_id, full_name, biometric_user_id').eq('status', 'active');
      if (branchFilter) empQ = empQ.eq('branch_id', branchFilter);
      const { data: allEmployees } = await empQ;

      const branchId = branchFilter ?? profile?.branch_id ?? null;
      let imported = 0;
      let duplicates = 0;
      let unmatched = 0;
      const errors: string[] = [];

      for (const row of rows) {
        // Match by employee code or biometric user ID
        const emp = (allEmployees ?? []).find(e =>
          (e.biometric_user_id && e.biometric_user_id === row.biometricId) ||
          (e.employee_id && e.employee_id.toLowerCase() === row.employeeCode.toLowerCase())
        );

        if (!emp) {
          unmatched++;
          errors.push(`Unmatched: ${row.employeeCode || row.biometricId} on ${row.date}`);
          continue;
        }

        // Parse date and time
        let punchDate = row.date;
        // Normalize date formats (DD/MM/YYYY -> YYYY-MM-DD)
        if (punchDate.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
          const [dd, mm, yyyy] = punchDate.split('/');
          punchDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }

        const punchTime = row.time.length === 4 ? `0${row.time}` : row.time;
        const punchType = row.punchType === 'OUT' ? 'OUT' : 'IN';

        // Insert punch (unique constraint handles duplicates)
        const { error } = await supabase.from('attendance_punches').insert({
          employee_id: emp.id,
          biometric_user_id: row.biometricId || null,
          branch_id: branchId,
          device_id: csvDeviceId || null,
          punch_date: punchDate,
          punch_time: punchTime,
          punch_type: punchType,
          source: 'csv',
          is_processed: false,
        });

        if (error) {
          if (error.code === '23505') {
            duplicates++;
          } else {
            errors.push(`Error: ${emp.full_name} ${punchDate} ${punchTime} - ${error.message}`);
          }
        } else {
          imported++;
        }
      }

      // Log the sync
      await supabase.from('attendance_device_sync_logs').insert({
        device_id: csvDeviceId || null,
        sync_type: 'csv_import',
        status: errors.length > 0 && imported > 0 ? 'partial' : imported > 0 ? 'success' : 'failed',
        records_processed: rows.length,
        records_imported: imported,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_by: profile?.id,
        errors: errors.length > 0 ? `${errors.length} errors, ${duplicates} duplicates, ${unmatched} unmatched` : null,
      });

      setCsvResult({ imported, duplicates, unmatched, errors });
    } catch (err: unknown) {
      setCsvResult({ imported: 0, duplicates: 0, unmatched: 0, errors: [err instanceof Error ? err.message : 'Failed to read CSV file'] });
    }
    setCsvImporting(false);
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button key={id} onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      {label}
    </button>
  );

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {tabBtn('daily', 'Daily')}
        {tabBtn('leave', 'Leave')}
        {tabBtn('devices', 'Devices')}
        {tabBtn('reports', 'Reports')}
        {tabBtn('sync_logs', 'Sync Logs')}
      </div>

      {tab === 'daily' && (
        <div>
          {/* Date nav + stats */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={16} /></button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={16} /></button>
              <span className="text-sm text-slate-500">{new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2 text-xs">
                {[
                  { label: 'Present', val: summaryStats.present, color: 'text-green-700 bg-green-50' },
                  { label: 'Absent', val: summaryStats.absent, color: 'text-red-700 bg-red-50' },
                  { label: 'Late', val: summaryStats.late, color: 'text-orange-700 bg-orange-50' },
                ].map(s => (
                  <span key={s.label} className={`px-2 py-1 rounded-lg font-medium ${s.color}`}>{s.val} {s.label}</span>
                ))}
              </div>
              <button onClick={bulkMarkPresent} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                <UserCheck size={14} /> Mark All Present
              </button>
              <button onClick={() => setShowLeaveModal(true)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-sm text-slate-600">
                <Plus size={14} /> Leave Request
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search employees..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check In</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check Out</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">OT</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading...</td></tr>
                ) : filteredEmployees.map(emp => {
                  const rec = records.find(r => r.employee_id === emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">{emp.full_name}</div>
                        <div className="text-xs text-slate-500">{emp.position}</div>
                      </td>
                      <td className="px-4 py-3">
                        {rec ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${STATUS_COLORS[rec.status]}`}>{rec.status.replace('_',' ')}</span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Not marked</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{rec?.check_in_time ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{rec?.check_out_time ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{rec ? `${rec.hours_worked}h` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{rec?.overtime_hours ? `${rec.overtime_hours}h` : '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openMarkModal(emp)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${rec ? 'border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                          {rec ? 'Edit' : 'Mark'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-semibold text-slate-700">Leave Requests</h3>
            <button onClick={() => setShowLeaveModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={15} /> New Request
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Period</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">No leave requests</td></tr>
                ) : leaves.map(l => {
                  const emp = (l as LeaveRequest & { employee?: { full_name: string; employee_id: string } }).employee;
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{emp?.full_name ?? l.employee_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 capitalize">{l.leave_type.replace('_',' ')}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(l.start_date)} — {formatDate(l.end_date)}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{l.days_requested}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${
                          l.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                          l.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {l.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => approveLeave(l.id, 'approved')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={14} /></button>
                            <button onClick={() => approveLeave(l.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><X size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'devices' && (
        <div>
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Attendance Devices</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure biometric machines, CSV import sources, and manual entry</p>
            </div>
            <div className="flex gap-2">
              <button onClick={openCsvImport} className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium text-slate-600">
                <Upload size={15} /> Import CSV
              </button>
              <button onClick={openAddDevice} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus size={15} /> Add Device
              </button>
            </div>
          </div>

          {/* Browser limitation notice */}
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-800 font-medium">Browser-based ERP cannot directly access LAN biometric devices</p>
              <p className="text-xs text-amber-700 mt-1">Since this ERP runs on InfinityFree in a browser, it cannot connect to ZKTeco or other biometric machines on your office network. Use CSV export from the device and import here, or set up a local sync bridge app on an office PC.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devicesLoading ? (
              <div className="col-span-full text-center py-10 text-slate-400">Loading...</div>
            ) : devices.length === 0 ? (
              <div className="col-span-full text-center py-10 text-slate-400">No devices configured</div>
            ) : devices.map(d => {
              const DeviceIcon = DEVICE_TYPE_ICONS[d.device_type] ?? Cpu;
              return (
                <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d.device_type === 'zkteco' ? 'bg-blue-100' : d.device_type === 'generic_csv' ? 'bg-green-100' : 'bg-slate-100'}`}>
                        <DeviceIcon size={18} className={d.device_type === 'zkteco' ? 'text-blue-600' : d.device_type === 'generic_csv' ? 'text-green-600' : 'text-slate-600'} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{d.device_name}</div>
                        <div className="text-xs text-slate-500 capitalize">{d.device_type.replace('_', ' ')}</div>
                      </div>
                    </div>
                    <button onClick={() => openEditDevice(d)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {d.ip_address && <div className="text-slate-600">IP: <span className="font-mono">{d.ip_address}:{d.port ?? ''}</span></div>}
                    {d.location && <div className="text-slate-600">Location: {d.location}</div>}
                    <div className="flex items-center gap-2">
                      {d.connection_status === 'online' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><Wifi size={10} /> Online</span>
                      ) : d.connection_status === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> Error</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full"><WifiOff size={10} /> Offline</span>
                      )}
                      {d.last_sync_at && <span className="text-xs text-slate-400">Last sync: {formatDate(d.last_sync_at)}</span>}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => testConnection(d)} disabled={testingDevice === d.id}
                      className="flex items-center gap-1.5 text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-slate-600 disabled:opacity-50">
                      {testingDevice === d.id ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />} Test
                    </button>
                    {d.device_type === 'zkteco' && (
                      <button disabled className="flex items-center gap-1.5 text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-400 cursor-not-allowed">
                        <RefreshCw size={12} /> Sync (needs bridge)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <label className="text-sm font-medium text-slate-700">Month:</label>
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Present</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Absent</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Late</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Leave</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Hours</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportLoading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading...</td></tr>
                ) : reportData.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">No data for this month</td></tr>
                ) : reportData.map(r => (
                  <tr key={r.employee.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">{r.employee.full_name}</div>
                      <div className="text-xs text-slate-500">{r.employee.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-green-700 font-medium">{r.present}</td>
                    <td className="px-4 py-3 text-center text-sm text-red-700 font-medium">{r.absent}</td>
                    <td className="px-4 py-3 text-center text-sm text-orange-700 font-medium">{r.late}</td>
                    <td className="px-4 py-3 text-center text-sm text-purple-700 font-medium">{r.leave}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{r.totalHours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-sm text-blue-700 font-medium">{r.overtime.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'sync_logs' && (
        <div>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-semibold text-slate-700">Device Sync Logs</h3>
            <button onClick={loadSyncLogs} className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm text-slate-600">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Processed</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Imported</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Errors</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncLogsLoading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">Loading...</td></tr>
                ) : syncLogs.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">No sync logs</td></tr>
                ) : syncLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700 capitalize">{log.sync_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
                        log.status === 'success' ? 'bg-green-50 text-green-700' :
                        log.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'}`}>{log.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">{log.records_processed}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">{log.records_imported}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{log.errors ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark Attendance Modal */}
      {showMarkModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowMarkModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">Mark Attendance</h3>
                <div className="text-xs text-slate-500">{selectedEmployee.full_name} — {formatDate(date)}</div>
              </div>
              <button onClick={() => setShowMarkModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['present', 'absent', 'half_day', 'late', 'early_leave', 'holiday', 'weekend', 'leave'] as const).map(s => (
                    <button key={s} onClick={() => setAttendanceForm(f => ({ ...f, status: s }))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${attendanceForm.status === s ? STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {s.replace('_',' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check In</label>
                  <input type="time" value={attendanceForm.check_in_time}
                    onChange={e => setAttendanceForm(f => ({ ...f, check_in_time: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check Out</label>
                  <input type="time" value={attendanceForm.check_out_time}
                    onChange={e => setAttendanceForm(f => ({ ...f, check_out_time: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Overtime Hours</label>
                <input type="number" min="0" step="0.5" value={attendanceForm.overtime_hours}
                  onChange={e => setAttendanceForm(f => ({ ...f, overtime_hours: Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input value={attendanceForm.notes} onChange={e => setAttendanceForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowMarkModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={markAttendance} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowLeaveModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">New Leave Request</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
                <select value={leaveForm.employee_id} onChange={e => setLeaveForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type</label>
                <select value={leaveForm.leave_type} onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value as LeaveRequest['leave_type'] }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(['annual','sick','emergency','unpaid','maternity','paternity','other'] as const).map(t => (
                    <option key={t} value={t}>{t.replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Days</label>
                <input type="number" min="1" value={leaveForm.days_requested} onChange={e => setLeaveForm(f => ({ ...f, days_requested: Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <textarea rows={2} value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowLeaveModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submitLeave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeviceModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">{editingDevice ? 'Edit Device' : 'Add Device'}</h3>
              <button onClick={() => setShowDeviceModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Device Name *</label>
                <input value={deviceForm.device_name} onChange={e => setDeviceForm(f => ({ ...f, device_name: e.target.value }))}
                  placeholder="e.g. Main Office ZKTeco"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Device Type</label>
                <select value={deviceForm.device_type} onChange={e => setDeviceForm(f => ({ ...f, device_type: e.target.value as AttendanceDevice['device_type'] }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="zkteco">ZKTeco Biometric Machine</option>
                  <option value="generic_csv">Generic CSV Import</option>
                  <option value="manual">Manual Attendance</option>
                </select>
              </div>
              {deviceForm.device_type === 'zkteco' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">IP Address</label>
                    <input value={deviceForm.ip_address} onChange={e => setDeviceForm(f => ({ ...f, ip_address: e.target.value }))}
                      placeholder="192.168.1.201"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                    <input value={deviceForm.port} onChange={e => setDeviceForm(f => ({ ...f, port: e.target.value }))}
                      placeholder="4370"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location / Branch</label>
                <input value={deviceForm.location} onChange={e => setDeviceForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Main Office Reception"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={deviceForm.is_active} onChange={e => setDeviceForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                <span className="text-sm text-slate-700">Active</span>
              </label>
              {deviceError && <p className="text-red-600 text-sm">{deviceError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowDeviceModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveDevice} disabled={deviceSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {deviceSaving ? 'Saving...' : editingDevice ? 'Update' : 'Add Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCsvModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Import Attendance CSV</h3>
              <button onClick={() => setShowCsvModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Link to Device (optional)</label>
                <select value={csvDeviceId} onChange={e => setCsvDeviceId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- No specific device --</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.device_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CSV File</label>
                <input ref={csvFileRef} type="file" accept=".csv,.txt" onChange={onCsvFileChange} className="hidden" />
                <button onClick={() => csvFileRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                  <Upload size={13} /> {csvFile ? csvFile.name : 'Choose CSV file'}
                </button>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <p className="font-medium mb-1">Expected CSV format (header row required):</p>
                <code className="block bg-white rounded p-2 font-mono text-xs">employee_code, biometric_id, date, time, punch_type, device_name</code>
                <code className="block bg-white rounded p-2 font-mono text-xs mt-1">EMP001, 1, 19/08/2026, 08:05, IN, ZKTeco-1</code>
                <code className="block bg-white rounded p-2 font-mono text-xs mt-1">EMP001, 1, 19/08/2026, 17:30, OUT, ZKTeco-1</code>
                <p className="mt-1">Date format: DD/MM/YYYY or YYYY-MM-DD. Duplicate punches are automatically skipped.</p>
              </div>

              {csvResult && (
                <div className={`rounded-lg p-4 text-sm ${csvResult.imported > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex gap-4 mb-2">
                    <span className="text-green-700 font-medium">Imported: {csvResult.imported}</span>
                    <span className="text-amber-700">Duplicates: {csvResult.duplicates}</span>
                    <span className="text-red-700">Unmatched: {csvResult.unmatched}</span>
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto text-xs text-red-600 space-y-0.5">
                      {csvResult.errors.slice(0, 10).map((err, i) => <div key={i}>{err}</div>)}
                      {csvResult.errors.length > 10 && <div>... and {csvResult.errors.length - 10} more</div>}
                    </div>
                  )}
                </div>
              )}

              {deviceError && <p className="text-red-600 text-sm">{deviceError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowCsvModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Close</button>
              <button onClick={importCsv} disabled={!csvFile || csvImporting} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {csvImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
