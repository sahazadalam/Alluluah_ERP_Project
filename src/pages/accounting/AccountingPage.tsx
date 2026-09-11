import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Account, JournalEntry } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { statusBadge } from '../../components/common/Badge';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2 } from 'lucide-react';

const typeColors: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity: 'bg-green-100 text-green-700',
  revenue: 'bg-amber-100 text-amber-700',
  expense: 'bg-slate-100 text-slate-700',
};

interface Props {
  branchFilter: string | null;
}

export default function AccountingPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'accounts' | 'journal'>('accounts');
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalForm, setJournalForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '', reference: '',
  });
  const [lines, setLines] = useState([
    { account_id: '', description: '', debit: 0, credit: 0 },
    { account_id: '', description: '', debit: 0, credit: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [branchFilter]);

  const loadData = async () => {
    setLoading(true);
    let entryQuery = supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }).limit(50);
    if (branchFilter) entryQuery = entryQuery.eq('branch_id', branchFilter);
    const [{ data: accs }, { data: ents }] = await Promise.all([
      supabase.from('accounts').select('*').order('account_code'),
      entryQuery,
    ]);
    setAccounts(accs ?? []);
    setEntries(ents ?? []);
    setLoading(false);
  };

  const updateLine = (idx: number, field: string, value: string | number) => {
    setLines(lines.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const saveJournalEntry = async () => {
    if (!journalForm.description.trim()) { setError('Description is required'); return; }
    if (!isBalanced) { setError('Debit and Credit must be equal'); return; }
    const validLines = lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) { setError('At least 2 lines required'); return; }

    setSaving(true);
    setError('');
    const ts = Date.now().toString().slice(-6);
    const branchId = branchFilter || profile?.branch_id;
    const { data: entry, error: err } = await supabase.from('journal_entries').insert({
      entry_number: `JE-${ts}`,
      ...journalForm,
      total_debit: totalDebit,
      total_credit: totalCredit,
      branch_id: branchId,
      status: 'posted',
      created_by: profile?.id,
    }).select().maybeSingle();

    if (err) { setError(err.message); setSaving(false); return; }
    if (entry) {
      const { error: linesErr } = await supabase.from('journal_entry_lines').insert(
        validLines.map(l => ({ ...l, journal_entry_id: entry.id }))
      );
      if (linesErr) { setError('Journal entry created but lines failed: ' + linesErr.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowJournalModal(false);
    setJournalForm({ entry_date: new Date().toISOString().split('T')[0], description: '', reference: '' });
    setLines([{ account_id: '', description: '', debit: 0, credit: 0 }, { account_id: '', description: '', debit: 0, credit: 0 }]);
    loadData();
  };

  const byType = (type: Account['account_type']) => accounts.filter(a => a.account_type === type);

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('accounts')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'accounts' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Chart of Accounts
        </button>
        <button onClick={() => setTab('journal')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'journal' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Journal Entries
        </button>
      </div>

      {tab === 'accounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(['asset', 'liability', 'equity', 'revenue', 'expense'] as Account['account_type'][]).map(type => (
            <div key={type} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${typeColors[type]}`}>{type}</span>
                <span className="text-xs text-slate-400">{byType(type).length} accounts</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Code</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Account Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byType(type).map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs font-mono text-slate-500">{a.account_code}</td>
                      <td className="px-4 py-2 text-sm text-slate-800">{a.account_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === 'journal' && (
        <>
          <div className="flex justify-end mb-6">
            <button onClick={() => setShowJournalModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={15} /> New Journal Entry
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Entry #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Debit</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Credit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-slate-400">No journal entries</td></tr>
                  ) : entries.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{e.entry_number}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(e.entry_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{e.description}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{e.reference || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">{formatCurrency(e.total_debit)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">{formatCurrency(e.total_credit)}</td>
                      <td className="px-4 py-3">{statusBadge(e.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={showJournalModal} onClose={() => setShowJournalModal(false)} title="New Journal Entry" size="2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={journalForm.entry_date}
                onChange={e => setJournalForm(f => ({ ...f, entry_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
              <input value={journalForm.reference}
                onChange={e => setJournalForm(f => ({ ...f, reference: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
              <input value={journalForm.description}
                onChange={e => setJournalForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Account</th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Description</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-28">Debit (AED)</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-28">Credit (AED)</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <select value={line.account_id} onChange={e => updateLine(idx, 'account_id', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1">
                        <option value="">-- Account --</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={line.debit}
                        onChange={e => updateLine(idx, 'debit', Number(e.target.value))}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={line.credit}
                        onChange={e => updateLine(idx, 'credit', Number(e.target.value))}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      {lines.length > 2 && (
                        <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={2} className="px-3 py-2">
                    <button onClick={() => setLines([...lines, { account_id: '', description: '', debit: 0, credit: 0 }])}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      <Plus size={12} /> Add Line
                    </button>
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalDebit)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!isBalanced && <p className="text-amber-600 text-xs">Debit and Credit totals must be equal. Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={saveJournalEntry} disabled={saving || !isBalanced}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : 'Post Journal Entry'}
            </button>
            <button onClick={() => setShowJournalModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
