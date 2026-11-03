import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import {
  getContests,
  getContest,
  createContest,
  updateContest,
  deleteContest,
  deleteSubmission,
  getLiveTallies,
  recalculateWinners,
} from '../../api/contests';
import type { Contest, ContestSubmission, LiveTallies, LiveTally } from '../../types/contest';
import { formatPoints, isPointsContest } from '../../types/contest';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import ContestImportForm from './ContestImportForm';

const STATUS_OPTIONS = ['upcoming', 'active', 'voting', 'completed'];
const nextStatus: Record<string, string> = {
  upcoming: 'active',
  active: 'voting',
  voting: 'completed',
};
const prevStatus: Record<string, string> = {
  voting: 'active',
  completed: 'voting',
};

const emptyForm = {
  month: '',
  theme: '',
  description: '',
  status: 'upcoming',
  deadline: '',
  guidelines: [''],
  wildcardCategory: '',
};

/** Debug lines for one submission's live tally in the submissions dialog. */
function tallyLines(tally: LiveTally, hasBonus: boolean): string[] {
  if (tally.score) {
    const s = tally.score;
    return [
      `#${s.rank} · ${formatPoints(s.total)}`,
      `Theme ${s.themePoints} (${s.themeFirst}/${s.themeSecond}/${s.themeThird}) · Fav ${s.favorite}` +
        (hasBonus ? ` · Bonus ${s.bonus}` : ''),
    ];
  }
  if (tally.categoryVotes) {
    const v = tally.categoryVotes;
    return [`Theme ${v.theme} · Fav ${v.favorite}${hasBonus ? ` · Bonus ${v.wildcard}` : ''} votes`];
  }
  return [];
}

export default function ContestsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingContest, setEditingContest] = useState<Contest | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ contest: Contest; newStatus: string } | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [viewSubmissions, setViewSubmissions] = useState<Contest | null>(null);
  const [deleteSubTarget, setDeleteSubTarget] = useState<{ contestId: number; sub: ContestSubmission } | null>(null);
  const [deletingSub, setDeletingSub] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [liveTallies, setLiveTallies] = useState<LiveTallies | null>(null);
  const [talliesState, setTalliesState] = useState<'idle' | 'loading' | 'error'>('idle');
  const talliesTicket = useRef(0);

  // Admin-only debugging aid: tallies from the ballots cast so far, for a
  // contest that is being voted on (members never see results before voting
  // closes). Called from event handlers; stale responses are ignored.
  const loadLiveTallies = useCallback(async (contest: Contest) => {
    const ticket = ++talliesTicket.current;
    setLiveTallies((prev) => (prev?.contestId === contest.id ? prev : null));
    if (contest.status !== 'voting') {
      setTalliesState('idle');
      return;
    }
    setTalliesState('loading');
    try {
      const data = await getLiveTallies(contest.id);
      if (ticket !== talliesTicket.current) return;
      setLiveTallies(data);
      setTalliesState('idle');
    } catch {
      if (ticket === talliesTicket.current) setTalliesState('error');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContests();
      setItems(data);
    } catch {
      addToast('error', 'Failed to load contests');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingContest(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = async (c: Contest) => {
    setLoadingId(c.id);
    try {
      const full = await getContest(c.id);
      setEditingContest(full);
      const init = {
        month: full.month,
        theme: full.theme,
        description: full.description,
        status: full.status,
        deadline: full.deadline,
        guidelines: full.guidelines.length > 0 ? full.guidelines : [''],
        wildcardCategory: full.wildcardCategory || '',
      };
      setForm(init);
      setInitialForm(init);
      setShowForm(true);
    } catch {
      addToast('error', 'Failed to load contest details');
    }
    setLoadingId(null);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const isImportMode = form.status === 'completed' && (!editingContest || editingContest.isImported);

  const handleSave = async () => {
    if (!form.month || !form.theme || !form.description || !form.deadline) {
      addToast('error', 'Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      const guidelines = form.guidelines.filter((g) => g.trim());
      const wildcardCategory = form.wildcardCategory.trim() || null;
      if (editingContest) {
        const updated = await updateContest(editingContest.id, {
          month: form.month,
          theme: form.theme,
          description: form.description,
          status: form.status,
          deadline: form.deadline,
          guidelines,
          wildcardCategory,
        });
        setEditingContest(updated);
        setInitialForm(form);
        addToast('success', 'Contest updated');
      } else {
        const created = await createContest({ ...form, guidelines, wildcardCategory });
        if (isImportMode) {
          // Open the newly created imported contest for editing
          setEditingContest(created);
          setInitialForm(form);
          addToast('success', 'Contest created — now add submissions and vote tallies below');
        } else {
          addToast('success', 'Contest created');
          setShowForm(false);
        }
      }
      load();
    } catch {
      addToast('error', `Failed to ${editingContest ? 'update' : 'create'} contest`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteContest(deleteTarget.id);
      addToast('success', 'Contest deleted');
      setDeleteTarget(null);
      load();
    } catch {
      addToast('error', 'Failed to delete contest');
    }
    setDeleting(false);
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    setAdvancing(true);
    try {
      await updateContest(statusTarget.contest.id, { status: statusTarget.newStatus });
      addToast('success', `Contest moved to ${statusTarget.newStatus}`);
      setStatusTarget(null);
      load();
    } catch {
      addToast('error', 'Failed to change contest status');
    }
    setAdvancing(false);
  };

  const handleRecalculateWinners = async () => {
    setRecalculating(true);
    try {
      const res = await recalculateWinners();
      addToast('success', res.detail);
      setShowRecalcConfirm(false);
      load();
    } catch {
      addToast('error', 'Failed to recalculate winners');
    }
    setRecalculating(false);
  };

  const handleDeleteSubmission = async () => {
    if (!deleteSubTarget) return;
    setDeletingSub(true);
    try {
      await deleteSubmission(deleteSubTarget.contestId, deleteSubTarget.sub.id);
      addToast('success', 'Submission deleted');
      setDeleteSubTarget(null);
      // Refresh submissions view
      if (viewSubmissions) {
        const updated = await getContest(viewSubmissions.id);
        setViewSubmissions(updated);
        void loadLiveTallies(updated);
      }
      load();
    } catch {
      addToast('error', 'Failed to delete submission');
    }
    setDeletingSub(false);
  };

  const filtered = search
    ? items.filter((c) =>
        c.theme.toLowerCase().includes(search.toLowerCase()) ||
        c.month.includes(search)
      )
    : items;

  if (loading) return <p className="admin__loading">Loading contests...</p>;

  // Live tallies for the open submissions dialog (voting only), best first.
  const tallies = viewSubmissions && liveTallies?.contestId === viewSubmissions.id ? liveTallies : null;
  const tallyOrder = new Map(tallies?.submissions.map((t, i) => [t.submissionId, { tally: t, order: i }]) ?? []);
  const dialogSubmissions = viewSubmissions
    ? tallies
      ? [...viewSubmissions.submissions].sort(
          (a, b) => (tallyOrder.get(a.id)?.order ?? Infinity) - (tallyOrder.get(b.id)?.order ?? Infinity),
        )
      : viewSubmissions.submissions
    : [];

  return (
    <>
      <div className="admin__toolbar">
        <input className="admin__search" placeholder="Search contests..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="admin__action-btn" onClick={() => setShowRecalcConfirm(true)}>Recalculate Winners</button>
        <button className="admin__create-btn" onClick={openCreate}>+ Create Contest</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Month</th><th>Theme</th><th>Status</th><th>Submissions</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.month}</td>
                <td>{c.theme}</td>
                <td>
                  <span className={`admin__badge admin__badge--${c.status === 'active' ? 'active' : c.status === 'completed' ? 'inactive' : 'member'}`}>
                    {c.status}
                  </span>
                  {isPointsContest(c) ? (
                    <span
                      className="admin__badge admin__badge--admin"
                      style={{ marginLeft: '0.35rem' }}
                      title="Voting format: points leaderboard"
                    >
                      Points
                    </span>
                  ) : (
                    <span
                      className="admin__badge admin__badge--member"
                      style={{ marginLeft: '0.35rem' }}
                      title="Voting format: classic (three category podiums)"
                    >
                      Classic
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="admin__action-btn"
                    onClick={async () => {
                      try {
                        const full = await getContest(c.id);
                        setViewSubmissions(full);
                        void loadLiveTallies(full);
                      } catch {
                        addToast('error', 'Failed to load submissions');
                      }
                    }}
                  >
                    {c.submissionCount} subs
                  </button>
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    {prevStatus[c.status] && (
                      <button
                        className="admin__action-btn"
                        onClick={() => setStatusTarget({ contest: c, newStatus: prevStatus[c.status] })}
                      >
                        &larr; {prevStatus[c.status]}
                      </button>
                    )}
                    {nextStatus[c.status] && (
                      <button
                        className="admin__action-btn"
                        onClick={() => setStatusTarget({ contest: c, newStatus: nextStatus[c.status] })}
                      >
                        &rarr; {nextStatus[c.status]}
                      </button>
                    )}
                    <button
                      className="admin__action-btn"
                      onClick={() => openEdit(c)}
                      disabled={loadingId === c.id}
                      style={loadingId === c.id ? { opacity: 0.6 } : undefined}
                    >
                      Edit
                    </button>
                    <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(c)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No contests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminFormModal
          title={editingContest?.isImported ? 'Import Contest' : editingContest ? 'Edit Contest' : isImportMode ? 'Create Imported Contest' : 'Create Contest'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
          wide={!!editingContest && form.status === 'completed'}
          saveLabel={!editingContest && isImportMode ? 'Create' : undefined}
          isDirty={isDirty}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Month (YYYY-MM) *</label>
              <input className="afm-input" placeholder="2026-03" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Theme *</label>
              <input className="afm-input" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Description *</label>
            <textarea className="afm-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Status</label>
              <select className="afm-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="afm-field">
              <label className="afm-label">Deadline *</label>
              <input className="afm-input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>

          <div className="afm-field">
            <label className="afm-label">Submission Guidelines</label>
            <div className="afm-dynamic-list">
              <div className="afm-defaults-list">
                <div className="afm-default-item">Maximum 3 submissions per person</div>
                <div className="afm-default-item">Submissions cannot be changed once submitted</div>
                <div className="afm-default-item">Submission deadline is based on the deadline field</div>
              </div>
              {form.guidelines.map((g, i) => (
                <div key={i} className="afm-dynamic-row">
                  <input
                    className="afm-input"
                    value={g}
                    onChange={(e) => {
                      const updated = [...form.guidelines];
                      updated[i] = e.target.value;
                      setForm({ ...form, guidelines: updated });
                    }}
                    placeholder="Additional guideline"
                  />
                  {form.guidelines.length > 1 && (
                    <button className="afm-remove-btn" onClick={() => setForm({ ...form, guidelines: form.guidelines.filter((_, j) => j !== i) })}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button className="afm-add-btn" onClick={() => setForm({ ...form, guidelines: [...form.guidelines, ''] })}>
                + Add Guideline
              </button>
            </div>
          </div>

          <div className="afm-field">
            <label className="afm-label">Bonus Challenge Category</label>
            <input
              className="afm-input"
              placeholder="e.g. Best Use of Color"
              value={form.wildcardCategory}
              onChange={(e) => setForm({ ...form, wildcardCategory: e.target.value })}
            />
          </div>

          {editingContest && form.status === 'completed' && (
            <ContestImportForm
              contest={editingContest}
              onContestUpdate={(updated) => { setEditingContest(updated); load(); }}
              readOnly={!editingContest.isImported}
            />
          )}
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Contest"
          message={`Delete "${deleteTarget.theme}"? All submissions will be lost. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showRecalcConfirm && (
        <ConfirmDialog
          title="Recalculate Winners"
          message="Recompute winners for every completed contest using the rules it ran under — classic contests keep their three category podiums; points contests use the points leaderboard — and refresh gallery winner badges? Placements, member stats, and badges may change."
          confirmLabel="Recalculate"
          loading={recalculating}
          onConfirm={handleRecalculateWinners}
          onCancel={() => setShowRecalcConfirm(false)}
        />
      )}

      {statusTarget && (
        <ConfirmDialog
          title={
            prevStatus[statusTarget.contest.status] === statusTarget.newStatus
              ? 'Revert Status'
              : 'Advance Status'
          }
          message={
            statusTarget.newStatus === 'completed'
              ? `Move "${statusTarget.contest.theme}" to completed? Winners will be auto-calculated from votes.`
              : statusTarget.newStatus === 'active' && statusTarget.contest.status === 'voting'
                ? `Move "${statusTarget.contest.theme}" back to active? Member submissions will stay locked because voting has already begun.`
                : statusTarget.newStatus === 'voting' && statusTarget.contest.status === 'completed'
                  ? `Move "${statusTarget.contest.theme}" back to voting? Existing winners will be cleared.`
                  : `Move "${statusTarget.contest.theme}" to ${statusTarget.newStatus}?`
          }
          confirmLabel={`Move to ${statusTarget.newStatus}`}
          loading={advancing}
          onConfirm={handleStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      )}

      {viewSubmissions && (
        <div className="confirm-overlay" onClick={() => setViewSubmissions(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 className="confirm-dialog__title">
              Submissions — {viewSubmissions.theme} ({viewSubmissions.submissions.length})
            </h3>
            {viewSubmissions.status === 'voting' && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                  flexWrap: 'wrap', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', borderRadius: 6,
                  background: 'var(--color-surface-alt)', border: '1px dashed var(--color-border)', fontSize: '0.8rem',
                }}
              >
                <span>
                  <strong>Live tallies</strong> (admin only, for debugging)
                  {' · '}
                  <span aria-live="polite">
                    {tallies
                      ? `${tallies.ballots} ${tallies.ballots === 1 ? 'ballot' : 'ballots'} so far`
                      : talliesState === 'error'
                        ? "Couldn't load tallies"
                        : 'Loading…'}
                  </span>
                  <br />
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {isPointsContest(viewSubmissions)
                      ? 'Rank · points; theme points (1st/2nd/3rd votes) · favorite · bonus.'
                      : 'Category votes so far.'}{' '}
                    Members only see results after voting closes.
                  </span>
                </span>
                <button
                  className="admin__action-btn"
                  onClick={() => void loadLiveTallies(viewSubmissions)}
                  disabled={talliesState === 'loading'}
                >
                  Refresh
                </button>
              </div>
            )}
            {viewSubmissions.submissions.length === 0 ? (
              <p className="confirm-dialog__message">No submissions yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                {dialogSubmissions.map((s) => {
                  const live = tallyOrder.get(s.id)?.tally;
                  return (
                  <div key={s.id} style={{ position: 'relative' }}>
                    <img src={s.url} alt={s.title} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                      <strong>{s.title}</strong><br />
                      {s.photographer}
                      {s.votes != null && (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {' '}· {s.votes} {isPointsContest(viewSubmissions) ? 'pts' : 'votes'}
                        </span>
                      )}
                      {live && (
                        <div style={{ marginTop: 2, color: 'var(--color-text-secondary)', fontSize: '0.72rem', lineHeight: 1.35 }}>
                          {tallyLines(live, !!viewSubmissions.wildcardCategory).map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className="admin__action-btn admin__action-btn--danger"
                      style={{ position: 'absolute', top: 4, right: 4, padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => setDeleteSubTarget({ contestId: viewSubmissions.id, sub: s })}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
            <div className="confirm-dialog__actions">
              <button className="confirm-dialog__btn confirm-dialog__btn--confirm" onClick={() => setViewSubmissions(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {deleteSubTarget && (
        <ConfirmDialog
          title="Delete Submission"
          message={`Delete "${deleteSubTarget.sub.title}" by ${deleteSubTarget.sub.photographer}?`}
          confirmLabel="Delete"
          danger
          loading={deletingSub}
          onConfirm={handleDeleteSubmission}
          onCancel={() => setDeleteSubTarget(null)}
        />
      )}
    </>
  );
}
