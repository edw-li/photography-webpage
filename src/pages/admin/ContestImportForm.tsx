import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import { Upload, X, Loader2, UserCheck, UserX, Trophy, Info } from 'lucide-react';
import {
  uploadAdminSubmission,
  finalizeContest,
  assignSubmission,
  backfillExif,
  refreshGallery,
  deleteSubmission,
  getContest,
} from '../../api/contests';
import type { SubmissionVoteTally } from '../../api/contests';
import type { Contest, ContestSubmission, VoteCategory } from '../../types/contest';
import { getCategoryLabel } from '../../types/contest';
import { getMembers } from '../../api/members';
import type { Member } from '../../types/members';
import { useToast } from '../../contexts/ToastContext';
import { compressImage, isImageFile, IMAGE_ACCEPT } from '../../utils/compressImage';
import { extractExif } from '../../utils/extractExif';
import { getImageUrl } from '../../utils/imageUrl';
import ConfirmDialog from '../../components/ConfirmDialog';
import './ContestImportForm.css';

interface PendingUpload {
  id: string;
  file: File;
  title: string;
  photographer: string;
  memberId: number | null;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface Props {
  contest: Contest;
  onContestUpdate: (c: Contest) => void;
  readOnly?: boolean;
}

export default function ContestImportForm({ contest, onContestUpdate, readOnly = false }: Props) {
  const { addToast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<ContestSubmission[]>(contest.submissions);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [tallies, setTallies] = useState<Record<number, { theme: number; favorite: number; wildcard: number }>>({});
  const [deleteTarget, setDeleteTarget] = useState<ContestSubmission | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ContestSubmission | null>(null);
  const [assignMemberId, setAssignMemberId] = useState<string>('');
  const [assignPhotographer, setAssignPhotographer] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [refreshingGallery, setRefreshingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(pending) as MutableRefObject<PendingUpload[]>;
  pendingRef.current = pending;

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  // Load members for assignment dropdown
  useEffect(() => {
    getMembers({ pageSize: 100 }).then((res) => setMembers(res.items)).catch(() => {});
  }, []);

  // Initialize tallies from existing category votes
  useEffect(() => {
    const initial: Record<number, { theme: number; favorite: number; wildcard: number }> = {};
    for (const sub of submissions) {
      initial[sub.id] = {
        theme: sub.categoryVotes?.theme ?? 0,
        favorite: sub.categoryVotes?.favorite ?? 0,
        wildcard: sub.categoryVotes?.wildcard ?? 0,
      };
    }
    setTallies(initial);
  }, [submissions]);

  const refreshContest = useCallback(async () => {
    try {
      const updated = await getContest(contest.id);
      setSubmissions(updated.submissions);
      onContestUpdate(updated);
    } catch {
      addToast('error', 'Failed to refresh contest data');
    }
  }, [contest.id, onContestUpdate, addToast]);

  // --- Pending upload management ---

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newPending: PendingUpload[] = [];
    for (const file of Array.from(files)) {
      if (!isImageFile(file)) continue;
      newPending.push({
        id: crypto.randomUUID(),
        file,
        title: '',
        photographer: '',
        memberId: null,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    }
    setPending((prev) => [...prev, ...newPending]);
  };

  const updatePending = (id: string, updates: Partial<PendingUpload>) => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePending = (id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleUploadAll = async () => {
    const toUpload = pending.filter((p) => p.status === 'pending' || p.status === 'error');
    if (toUpload.length === 0) return;
    for (const p of toUpload) {
      const photographerName = p.memberId != null
        ? members.find((m) => m.id === p.memberId)?.name
        : p.photographer.trim();
      if (!p.title.trim() || !photographerName) {
        addToast('error', 'Please fill in title and photographer for all submissions');
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    for (const p of toUpload) {
      updatePending(p.id, { status: 'uploading' });
      try {
        // Extract EXIF from original file BEFORE compression (canvas strips EXIF)
        const exif = await extractExif(p.file);
        const { file: compressed } = await compressImage(p.file);
        const formData = new FormData();
        formData.append('file', compressed);
        formData.append('title', p.title.trim());
        const photographerName = p.memberId != null
          ? (members.find((m) => m.id === p.memberId)?.name ?? p.photographer.trim())
          : p.photographer.trim();
        formData.append('photographer', photographerName);
        if (p.memberId != null) formData.append('member_id', String(p.memberId));
        if (exif.camera) formData.append('exif_camera', exif.camera);
        if (exif.focalLength) formData.append('exif_focal_length', exif.focalLength);
        if (exif.aperture) formData.append('exif_aperture', exif.aperture);
        if (exif.shutterSpeed) formData.append('exif_shutter_speed', exif.shutterSpeed);
        if (exif.iso) formData.append('exif_iso', exif.iso);
        await uploadAdminSubmission(contest.id, formData);
        updatePending(p.id, { status: 'done' });
        successCount++;
      } catch {
        updatePending(p.id, { status: 'error', error: 'Upload failed' });
      }
    }
    setUploading(false);

    if (successCount > 0) {
      addToast('success', `${successCount} submission${successCount > 1 ? 's' : ''} uploaded`);
      // Clear completed uploads and refresh
      setPending((prev) => prev.filter((p) => p.status !== 'done'));
      await refreshContest();
    }
  };

  // --- Delete submission ---

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSubmission(contest.id, deleteTarget.id);
      addToast('success', 'Submission deleted');
      setDeleteTarget(null);
      await refreshContest();
    } catch {
      addToast('error', 'Failed to delete submission');
    }
    setDeleting(false);
  };

  // --- Assign submission ---

  const openAssign = (sub: ContestSubmission) => {
    setAssignTarget(sub);
    setAssignPhotographer(sub.photographer);
    setAssignMemberId('');
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      const memberId = assignMemberId ? parseInt(assignMemberId, 10) : null;
      await assignSubmission(contest.id, assignTarget.id, {
        memberId,
        photographer: assignPhotographer.trim(),
      });
      addToast('success', 'Submission reassigned');
      setAssignTarget(null);
      await refreshContest();
    } catch {
      addToast('error', 'Failed to reassign submission');
    }
    setAssigning(false);
  };

  // --- Finalize ---

  const handleFinalize = async () => {
    if (submissions.length === 0) {
      addToast('error', 'No submissions to finalize');
      return;
    }
    setFinalizing(true);
    try {
      const voteTallies: SubmissionVoteTally[] = submissions.map((sub) => ({
        submissionId: sub.id,
        theme: tallies[sub.id]?.theme ?? 0,
        favorite: tallies[sub.id]?.favorite ?? 0,
        wildcard: tallies[sub.id]?.wildcard ?? 0,
      }));
      const updated = await finalizeContest(contest.id, voteTallies);
      setSubmissions(updated.submissions);
      onContestUpdate(updated);
      addToast('success', 'Contest finalized — winners calculated');
    } catch {
      addToast('error', 'Failed to finalize contest');
    }
    setFinalizing(false);
  };

  const handleRefreshGallery = async () => {
    setRefreshingGallery(true);
    try {
      const res = await refreshGallery(contest.id);
      addToast('success', res.detail);
    } catch {
      addToast('error', 'Failed to refresh gallery');
    }
    setRefreshingGallery(false);
  };

  const handleBackfillExif = async () => {
    setBackfilling(true);
    try {
      const res = await backfillExif(contest.id);
      addToast('success', res.detail);
      await refreshContest();
    } catch {
      addToast('error', 'Failed to backfill EXIF data');
    }
    setBackfilling(false);
  };

  const updateTally = (subId: number, category: 'theme' | 'favorite' | 'wildcard', value: number) => {
    setTallies((prev) => ({
      ...prev,
      [subId]: { ...prev[subId], [category]: Math.max(0, value) },
    }));
  };

  const hasWildcard = !!contest.wildcardCategory;

  return (
    <div className="cif">
      {/* --- Section 1: Existing Submissions --- */}
      {submissions.length > 0 && (
        <div className="cif__section">
          <div className="cif__section-header">
            <h4 className="cif__section-title" style={{ margin: 0 }}>
              Submissions ({submissions.length})
            </h4>
            <button
              className="admin__action-btn"
              onClick={handleBackfillExif}
              disabled={backfilling}
              title="Re-extract camera metadata (aperture, shutter, ISO, focal length, camera model) from this contest's stored images. Use this if submissions were imported without EXIF, or if EXIF parsing was changed and existing entries need to be refreshed."
            >
              {backfilling ? 'Extracting...' : 'Backfill EXIF'}
              <Info size={14} style={{ marginLeft: 4, opacity: 0.7 }} aria-hidden="true" />
            </button>
            <button
              className="admin__action-btn"
              onClick={handleRefreshGallery}
              disabled={refreshingGallery}
              title="Re-publish this contest's winning submissions to the public Winners gallery. Use after finalizing a contest or after manually adjusting winner placements/vote counts so the public gallery reflects the latest results."
            >
              {refreshingGallery ? 'Refreshing...' : 'Refresh Gallery'}
              <Info size={14} style={{ marginLeft: 4, opacity: 0.7 }} aria-hidden="true" />
            </button>
          </div>
          <div className="cif__subs-grid">
            {submissions.map((sub) => (
              <div key={sub.id} className="cif__sub-card">
                <img
                  src={getImageUrl(sub.url, 'thumb')}
                  alt={sub.title}
                  className="cif__sub-thumb"
                />
                <div className="cif__sub-info">
                  <div className="cif__sub-title">{sub.title}</div>
                  <div className="cif__sub-photographer">
                    {sub.photographer}
                    {sub.isAssigned ? (
                      <UserCheck size={12} className="cif__assigned-icon cif__assigned-icon--yes" />
                    ) : (
                      <UserX size={12} className="cif__assigned-icon cif__assigned-icon--no" />
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div className="cif__sub-actions">
                    <button className="admin__action-btn" onClick={() => openAssign(sub)}>Reassign</button>
                    <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(sub)}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Section 2: Upload New Submissions (import mode only) --- */}
      {!readOnly && <div className="cif__section">
        <h4 className="cif__section-title">Add Submissions</h4>
        <div
          className="cif__drop-zone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('cif__drop-zone--active'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('cif__drop-zone--active')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('cif__drop-zone--active'); handleFileSelect(e.dataTransfer.files); }}
        >
          <Upload size={20} />
          <span>Drop images here or click to browse</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            onChange={(e) => { handleFileSelect(e.target.files); e.target.value = ''; }}
          />
        </div>

        {pending.length > 0 && (
          <div className="cif__pending-list">
            {pending.map((p) => (
              <div key={p.id} className={`cif__pending-row${p.status === 'error' ? ' cif__pending-row--error' : ''}`}>
                <img
                  src={p.previewUrl}
                  alt=""
                  className="cif__pending-thumb"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.cif__pending-placeholder')?.classList.add('cif__pending-placeholder--visible'); }}
                />
                <div className="cif__pending-placeholder" title={p.file.name}>
                  <Upload size={18} />
                </div>
                <div className="cif__pending-fields">
                  <input
                    className="afm-input"
                    placeholder="Title *"
                    value={p.title}
                    onChange={(e) => updatePending(p.id, { title: e.target.value })}
                    disabled={p.status === 'uploading' || p.status === 'done'}
                  />
                  <select
                    className="afm-select"
                    value={p.memberId ?? ''}
                    onChange={(e) => updatePending(p.id, {
                      memberId: e.target.value ? parseInt(e.target.value, 10) : null,
                      photographer: e.target.value ? '' : p.photographer,
                    })}
                    disabled={p.status === 'uploading' || p.status === 'done'}
                  >
                    <option value="">No member (enter name)</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {p.memberId == null && (
                    <input
                      className="afm-input"
                      placeholder="Photographer name *"
                      value={p.photographer}
                      onChange={(e) => updatePending(p.id, { photographer: e.target.value })}
                      disabled={p.status === 'uploading' || p.status === 'done'}
                    />
                  )}
                </div>
                <div className="cif__pending-status">
                  {p.status === 'uploading' && <Loader2 size={16} className="cif__spinner" />}
                  {p.status === 'done' && <span className="cif__status-done">✓</span>}
                  {p.status === 'error' && <span className="cif__status-error">{p.error}</span>}
                </div>
                <button
                  className="cif__pending-remove"
                  onClick={() => removePending(p.id)}
                  disabled={p.status === 'uploading'}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="afm-btn afm-btn--save"
              onClick={handleUploadAll}
              disabled={uploading || pending.every((p) => p.status === 'done')}
              style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
            >
              {uploading && <Loader2 size={14} className="afm-spinner" />}
              {uploading ? 'Uploading...' : `Upload ${pending.filter((p) => p.status !== 'done').length} Submission${pending.filter((p) => p.status !== 'done').length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>}

      {/* --- Section 3: Vote Tallies --- */}
      {submissions.length > 0 && (
        <div className="cif__section">
          <h4 className="cif__section-title">Vote Tallies</h4>
          <div className="cif__tally-table-wrap">
            <table className="admin__table cif__tally-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Title</th>
                  <th>Photographer</th>
                  <th>Theme</th>
                  <th>Favorite</th>
                  {hasWildcard && <th>{contest.wildcardCategory}</th>}
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <img src={getImageUrl(sub.url, 'thumb')} alt="" className="cif__tally-thumb" />
                    </td>
                    <td>{sub.title}</td>
                    <td>{sub.photographer}</td>
                    <td>
                      {readOnly
                        ? <span className="cif__tally-value">{tallies[sub.id]?.theme ?? 0}</span>
                        : <input type="number" min="0" className="cif__tally-input" value={tallies[sub.id]?.theme ?? 0} onChange={(e) => updateTally(sub.id, 'theme', parseInt(e.target.value, 10) || 0)} />
                      }
                    </td>
                    <td>
                      {readOnly
                        ? <span className="cif__tally-value">{tallies[sub.id]?.favorite ?? 0}</span>
                        : <input type="number" min="0" className="cif__tally-input" value={tallies[sub.id]?.favorite ?? 0} onChange={(e) => updateTally(sub.id, 'favorite', parseInt(e.target.value, 10) || 0)} />
                      }
                    </td>
                    {hasWildcard && (
                      <td>
                        {readOnly
                          ? <span className="cif__tally-value">{tallies[sub.id]?.wildcard ?? 0}</span>
                          : <input type="number" min="0" className="cif__tally-input" value={tallies[sub.id]?.wildcard ?? 0} onChange={(e) => updateTally(sub.id, 'wildcard', parseInt(e.target.value, 10) || 0)} />
                        }
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <button
              className="afm-btn afm-btn--save"
              onClick={handleFinalize}
              disabled={finalizing}
              style={{ alignSelf: 'flex-start', marginTop: '0.75rem' }}
            >
              {finalizing && <Loader2 size={14} className="afm-spinner" />}
              {finalizing ? 'Finalizing...' : 'Calculate Winners & Finalize'}
            </button>
          )}
        </div>
      )}

      {/* --- Section 4: Winners Preview --- */}
      {contest.winners && contest.winners.length > 0 && (
        <div className="cif__section">
          <h4 className="cif__section-title">
            <Trophy size={16} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Winners
          </h4>
          {(['theme', 'favorite', 'wildcard'] as VoteCategory[])
            .filter((cat) => contest.winners!.some((w) => (w.category || 'theme') === cat))
            .map((cat) => (
              <div key={cat} className="cif__winners-category">
                <div className="cif__winners-label">
                  {getCategoryLabel(cat, contest.wildcardCategory)}
                </div>
                {contest.winners!
                  .filter((w) => (w.category || 'theme') === cat)
                  .sort((a, b) => a.place - b.place)
                  .map((w) => {
                    const sub = submissions.find((s) => s.id === w.submissionId);
                    return (
                      <div key={`${cat}-${w.submissionId}`} className="cif__winners-entry">
                        {w.place === 1 ? '🥇' : w.place === 2 ? '🥈' : '🥉'}{' '}
                        {sub ? `${sub.title} — ${sub.photographer}` : `Submission #${w.submissionId}`}
                      </div>
                    );
                  })}
              </div>
            ))}
        </div>
      )}

      {/* --- Dialogs --- */}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Submission"
          message={`Delete "${deleteTarget.title}" by ${deleteTarget.photographer}? This removes the photo and its storage files.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {assignTarget && (
        <div className="confirm-overlay" onClick={() => setAssignTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3 className="confirm-dialog__title">Reassign Submission</h3>
            <p className="confirm-dialog__message">
              Assign &ldquo;{assignTarget.title}&rdquo; to a member, or enter a placeholder name.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <label className="afm-label">Member</label>
                <select
                  className="afm-select"
                  value={assignMemberId}
                  onChange={(e) => {
                    setAssignMemberId(e.target.value);
                    if (e.target.value) {
                      const m = members.find((m) => String(m.id) === e.target.value);
                      if (m) setAssignPhotographer(m.name);
                    } else {
                      setAssignPhotographer('');
                    }
                  }}
                >
                  <option value="">No member (enter name)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              {!assignMemberId && (
                <div>
                  <label className="afm-label">Photographer Name</label>
                  <input
                    className="afm-input"
                    value={assignPhotographer}
                    onChange={(e) => setAssignPhotographer(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="confirm-dialog__actions">
              <button className="confirm-dialog__btn confirm-dialog__btn--cancel" onClick={() => setAssignTarget(null)} disabled={assigning}>
                Cancel
              </button>
              <button
                className="confirm-dialog__btn confirm-dialog__btn--confirm"
                onClick={handleAssign}
                disabled={assigning || (!assignMemberId && !assignPhotographer.trim())}
              >
                {assigning && <Loader2 size={14} className="confirm-dialog__spinner" />}
                {assigning ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
