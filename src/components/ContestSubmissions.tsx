import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Contest, ContestSubmission } from '../types/contest';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../api/client';
import {
  changeSubmission, discardPreparedSubmission, getMySubmissions, getSubmissionOperation, prepareSubmission,
  type MySubmissions, type PreparedSubmission, type SubmissionChange,
} from '../api/contests';
import { getImageUrl } from '../utils/imageUrl';
import './ContestSubmissions.css';

type Action = 'add' | 'replace' | 'title' | 'remove';
interface Draft { action: Action; target?: ContestSubmission; title: string }
interface PendingChange { action: Action; submissionId?: number; body: SubmissionChange }

function readPending(key: string): PendingChange | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.body?.operationId && ['add', 'replace', 'title', 'remove'].includes(value.action) ? value : null;
  } catch { return null; }
}

export default function ContestSubmissions({ contest, onRefresh, onGuardChange }: {
  contest: Contest;
  onRefresh: () => void;
  onGuardChange: (dirty: boolean, busy: boolean) => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const storageKey = `contest-change:${user?.id}:${contest.id}`;
  const [entries, setEntries] = useState<MySubmissions>({
    submissions: contest.submissions.filter(s => s.isOwn), userSubmissionCount: contest.userSubmissionCount ?? 0,
    canManageSubmissions: contest.canManageSubmissions ?? false, submissionLockReason: contest.submissionLockReason ?? null,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prepared, setPrepared] = useState<PreparedSubmission | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(() => readPending(storageKey));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [fileName, setFileName] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const generation = useRef(0);
  const readGeneration = useRef(0);
  const preparedRef = useRef<PreparedSubmission | null>(null);
  const pendingRef = useRef(pending);
  const savingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const dirty = draft !== null || pending !== null;

  const reload = useCallback(async () => {
    const ticket = ++readGeneration.current;
    const current = await getMySubmissions(contest.id);
    if (ticket === readGeneration.current) {
      setEntries(current);
      onRefresh();
    }
    return current;
  }, [contest.id, onRefresh]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const ticket = ++readGeneration.current;
    getMySubmissions(contest.id).then(data => { if (active && ticket === readGeneration.current) setEntries(data); })
      .catch(() => { if (active) setError('Could not refresh your entries. Please try again.'); });
    const refresh = () => { void reload().catch(() => {}); };
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [contest.id, contest.status, isAuthenticated, reload]);

  useEffect(() => { onGuardChange(dirty, saving); }, [dirty, saving, onGuardChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => () => {
    generation.current++;
    // A save with an unknown outcome must remain recoverable after closing/reloading.
    if (preparedRef.current && !pendingRef.current) {
      void discardPreparedSubmission(contest.id, preparedRef.current.uploadId).catch(() => {});
    }
  }, [contest.id]);

  const editorKey = draft ? `${draft.action}:${draft.target?.id ?? 'new'}` : null;
  useEffect(() => {
    if (editorKey) editorRef.current?.focus();
    else summaryRef.current?.focus();
  }, [editorKey]);

  const rememberPending = (value: PendingChange | null) => {
    pendingRef.current = value;
    setPending(value);
    try {
      if (value) localStorage.setItem(storageKey, JSON.stringify(value));
      else localStorage.removeItem(storageKey);
    } catch { /* In-memory recovery still works if storage is unavailable. */ }
  };

  const discard = () => {
    generation.current++;
    if (preparedRef.current) void discardPreparedSubmission(contest.id, preparedRef.current.uploadId).catch(() => {});
    preparedRef.current = null;
    setPrepared(null);
    setUploading(false);
    setDraft(null);
    setFileName('');
    setError('');
    setConflict(false);
    setEnlarged(false);
  };

  const begin = (action: Action, target?: ContestSubmission) => {
    discard();
    setMessage('');
    setDraft({ action, target, title: target?.title ?? '' });
  };

  const chooseFile = async (file?: File) => {
    if (!file || !draft || savingRef.current || pendingRef.current) return;
    const ticket = ++generation.current;
    if (preparedRef.current) void discardPreparedSubmission(contest.id, preparedRef.current.uploadId).catch(() => {});
    preparedRef.current = null;
    setPrepared(null);
    setFileName(file.name);
    setError('');
    if (file.size > 10 * 1024 * 1024) { setUploading(false); setError('Choose an image under 10MB.'); return; }
    setUploading(true);
    try {
      const next = await prepareSubmission(contest.id, file, draft.target?.id);
      if (generation.current !== ticket) {
        void discardPreparedSubmission(contest.id, next.uploadId).catch(() => {});
        return;
      }
      preparedRef.current = next;
      setPrepared(next);
    } catch (err) {
      if (generation.current === ticket) setError(err instanceof Error ? err.message : 'Could not prepare the photo. Try again.');
    } finally { if (generation.current === ticket) setUploading(false); }
  };

  const saved = async (change: PendingChange) => {
    rememberPending(null);
    preparedRef.current = null;
    setPrepared(null);
    setDraft(null);
    setConflict(false);
    setMessage({ add: 'Photo submitted.', replace: 'Photo replaced.', title: 'Title saved.', remove: 'Photo removed from this contest.' }[change.action]);
    setError('');
    try { await reload(); } catch { setError('Your change was saved, but the list could not refresh. Refresh your entries below.'); }
  };

  const save = async () => {
    if (savingRef.current) return;
    const change = pendingRef.current ?? (draft ? {
      action: draft.action, submissionId: draft.target?.id,
      body: { operationId: crypto.randomUUID(), expectedRevision: draft.target?.revision,
        uploadId: prepared?.uploadId, title: draft.action === 'remove' ? undefined : draft.title.trim() },
    } : null);
    if (!change) return;
    rememberPending(change);
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await changeSubmission(contest.id, change.action, change.body, change.submissionId);
      await saved(change);
    } catch (err) {
      // A 401 or transport/server failure cannot settle a previously started save.
      if (err instanceof ApiError && [400, 403, 404, 409, 422].includes(err.status)) {
        rememberPending(null);
        setError(err.message);
        const latest = await reload().catch(() => null);
        setConflict(Boolean(draft?.target && latest?.submissions.some(s => s.id === draft.target!.id && s.revision !== draft.target!.revision)));
      } else {
        try {
          const result = await getSubmissionOperation(contest.id, change.body.operationId);
          if (result.state === 'saved') { await saved(change); return; }
        } catch { /* Leave the durable request available to retry. */ }
        setError('We could not confirm whether your change was saved. Reconnect or sign in again, then use Check / retry save.');
      }
    } finally { savingRef.current = false; setSaving(false); }
  };

  if (!isAuthenticated) return <div className="contest__submit-success" role="tabpanel" aria-label="My submissions">
    <Camera size={40} /><p>Log in to submit and manage your photos.</p><Link className="contest__modal-btn" to="/login">Log in</Link>
  </div>;

  const canSave = entries.canManageSubmissions && !uploading && !saving && !conflict && draft &&
    (draft.action === 'remove' || (draft.title.trim() && (draft.action === 'title' || prepared)));
  const label = draft ? { add: 'Add photo', replace: 'Replace photo', title: 'Save title', remove: 'Remove from contest' }[draft.action] : '';

  return <div className="my-submissions" role="tabpanel" aria-label="My submissions">
    <div className="my-submissions__summary" ref={summaryRef} tabIndex={-1}>
      <strong>{entries.userSubmissionCount} of 3 photos submitted</strong>
      <span>{entries.canManageSubmissions ? 'Submissions open' : <><Lock size={14} /> Submissions locked</>}</span>
    </div>
    <p className="my-submissions__help">{entries.canManageSubmissions
      ? `Please submit by ${new Date(contest.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. You can manage your photos while submissions are open. Entries lock when voting begins.`
      : entries.submissionLockReason}</p>
    {message && <p className="my-submissions__success" role="status"><Check size={18} /> {message}</p>}
    {error && <p className="contest__submit-error" role="alert">{error}</p>}
    {pending && <div className="my-submissions__pending" role="status">
      <p>{saving ? 'Saving your change…' : 'A save needs confirmation. Retrying this action will not create a duplicate.'}</p>
      {!saving && <button className="contest__modal-btn" onClick={() => void save()}>Check / retry save</button>}
    </div>}

    {!draft && !pending && <>
      <div className="my-submissions__grid">
        {entries.submissions.map(sub => <article key={sub.id} className="my-submissions__card">
          <a href={getImageUrl(sub.url, 'full')} target="_blank" rel="noopener noreferrer" aria-label={`Enlarge ${sub.title}`}>
            <img src={getImageUrl(sub.url, 'medium')} alt={sub.title} />
          </a>
          <h3>{sub.title}</h3>
          {entries.canManageSubmissions && <div className="my-submissions__actions">
            <button onClick={() => begin('replace', sub)}><RefreshCw size={15} /> Replace photo</button>
            <button onClick={() => begin('title', sub)}>Edit title</button>
            <button className="my-submissions__remove" onClick={() => begin('remove', sub)}><Trash2 size={14} /> Remove</button>
          </div>}
        </article>)}
        {entries.canManageSubmissions && entries.userSubmissionCount < 3 && <button className="my-submissions__add" onClick={() => begin('add')}>
          <Plus size={28} /> {entries.userSubmissionCount ? 'Add photo' : 'Add your first photo'}
        </button>}
      </div>
      {entries.canManageSubmissions && entries.userSubmissionCount === 3 && <p className="my-submissions__help">All three spaces are filled. You can still replace any photo.</p>}
    </>}

    {draft && <div ref={editorRef} className="my-submissions__editor" tabIndex={-1}>
      <h3>{draft.action === 'title' ? 'Edit title' : label}</h3>
      {draft.action === 'replace' && <p className="my-submissions__help">Your current photo stays submitted until you save this replacement.</p>}
      <div className={`my-submissions__previews${enlarged ? ' my-submissions__previews--large' : ''}`}>
        {draft.target && <figure><img src={getImageUrl(draft.target.url, 'medium')} alt={draft.target.title} /><figcaption>Current photo — {draft.target.title}</figcaption></figure>}
        {prepared && <figure><img src={prepared.previewUrl} alt="Replacement preview" /><figcaption>{draft.action === 'add' ? 'New photo' : 'Replacement'} — ready to save</figcaption></figure>}
      </div>
      {prepared && <button className="my-submissions__text-button" onClick={() => setEnlarged(v => !v)}>{enlarged ? 'Smaller preview' : 'Enlarge preview'}</button>}
      {(draft.action === 'add' || draft.action === 'replace') && <div className="my-submissions__upload"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void chooseFile(e.dataTransfer.files[0]); }}>
        <label>Choose a photo
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.heif" disabled={saving || Boolean(pending)}
            onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <p>Or drag a photo here. JPEG, PNG, WebP, GIF, or HEIC · maximum 10MB.</p>
        {uploading && <p role="status" aria-live="polite">Uploading and preparing {fileName}…</p>}
      </div>}
      {draft.action !== 'remove' && <label className="contest__form-label"><span>Title</span>
        <input className="contest__form-input" value={draft.title} maxLength={300} disabled={saving || Boolean(pending)}
          onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Give your photo a title" />
      </label>}
      {draft.action === 'remove' && <p>This removes this photo from the contest and frees one of your three spaces.</p>}
      {conflict && <button className="contest__modal-btn" onClick={() => {
        const latest = entries.submissions.find(s => s.id === draft.target?.id);
        if (latest) { setDraft({ ...draft, target: latest }); setConflict(false); setError(''); }
      }}>Review latest entry</button>}
      <div className="my-submissions__editor-actions">
        <button onClick={discard} disabled={saving || Boolean(pending)}>Cancel</button>
        <button className={`contest__modal-btn${draft.action === 'remove' ? ' my-submissions__danger' : ''}`}
          disabled={!canSave || Boolean(pending)} onClick={() => void save()}>{saving ? 'Saving…' : label}</button>
      </div>
    </div>}
    {!saving && <button className="my-submissions__text-button" onClick={() => void reload().then(() => { if (!pending) setError(''); }).catch(() => setError('Could not refresh your entries. Please try again.'))}>Refresh your entries</button>}
  </div>;
}
