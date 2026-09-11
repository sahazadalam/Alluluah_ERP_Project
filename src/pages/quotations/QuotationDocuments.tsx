import { useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { QuotationDocument } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { Upload, FileText, Image, Download, Trash2, X, Loader2 } from 'lucide-react';

interface Props {
  quotationId: string | null;
  documents: QuotationDocument[];
  onDocumentsChanged: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';

export default function QuotationDocuments({ quotationId, documents, onDocumentsChanged }: Props) {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (!quotationId) {
      showMessage('error', 'Save the quotation first before uploading documents.');
      return;
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        showMessage('error', `Unsupported file type: ${file.name}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showMessage('error', `File too large: ${file.name} (max 10MB)`);
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccess('');

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/\s/g, '_');
        const fileName = `${quotationId}/${Date.now()}_${i}_${safeName}`;
        const filePath = `quotation-documents/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('quotation-documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadErr) {
          showMessage('error', `Upload failed: ${uploadErr.message}`);
          setUploading(false);
          setUploadProgress(0);
          return;
        }

        const { data: urlData } = supabase.storage
          .from('quotation-documents')
          .getPublicUrl(filePath);

        const { error: dbErr } = await supabase.from('quotation_documents').insert({
          quotation_id: quotationId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: filePath,
          file_url: urlData.publicUrl,
          uploaded_by: profile?.id ?? null,
        });

        if (dbErr) {
          showMessage('error', `Failed to save document record: ${dbErr.message}`);
          setUploading(false);
          setUploadProgress(0);
          return;
        }

        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      showMessage('success', 'File uploaded successfully');
      onDocumentsChanged();
    } catch (err) {
      showMessage('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [quotationId, profile?.id, onDocumentsChanged]);

  const handleDelete = async (doc: QuotationDocument) => {
    // Delete from storage
    await supabase.storage.from('quotation-documents').remove([doc.storage_path]);
    // Delete from database
    const { error: delErr } = await supabase.from('quotation_documents').delete().eq('id', doc.id);
    if (delErr) {
      showMessage('error', `Failed to delete document: ${delErr.message}`);
      return;
    }
    showMessage('success', 'Document removed');
    setConfirmDelete(null);
    onDocumentsChanged();
  };

  const handleDownload = async (doc: QuotationDocument) => {
    const { data, error: dlErr } = await supabase.storage
      .from('quotation-documents')
      .createSignedUrl(doc.storage_path, 3600);

    if (dlErr || !data) {
      // Fallback to public URL
      if (doc.file_url) {
        window.open(doc.file_url, '_blank');
      } else {
        showMessage('error', 'Could not download file');
      }
      return;
    }

    window.open(data.signedUrl, '_blank');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={18} className="text-blue-500" />;
    return <FileText size={18} className="text-slate-500" />;
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Supporting Documents</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !quotationId}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading...' : 'Upload Files'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {!quotationId && (
        <p className="text-xs text-amber-600 mb-2">Save the quotation first to enable document uploads.</p>
      )}

      {uploading && (
        <div className="mb-3">
          <div className="w-full bg-slate-200 rounded-full h-1.5">
            <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-1">Uploading... {uploadProgress}%</p>
        </div>
      )}

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg">
          {success}
        </div>
      )}

      {documents.length === 0 && !uploading ? (
        <p className="text-xs text-slate-400 text-center py-4">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-slate-200">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                {getFileIcon(doc.file_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</div>
                <div className="text-xs text-slate-400">{formatFileSize(doc.file_size)} · {new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Download / Open"
                >
                  <Download size={14} />
                </button>
                {confirmDelete === doc.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(doc)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Confirm delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-2">
        Supported: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX · Max 10MB per file
      </p>
    </div>
  );
}
