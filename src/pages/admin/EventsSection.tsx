import { useState, useEffect, useCallback } from 'react';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../../api/events';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import type { CalendarEvent, RecurrenceRule, RecurrenceFrequency } from '../../types/events';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const emptyForm = {
  title: '',
  description: '',
  location: '',
  date: '',
  time: '',
  endTime: '',
  useRecurrence: false,
  frequency: 'weekly' as RecurrenceFrequency,
  interval: 1,
  dayOfWeek: [] as number[],
  weekOfMonth: [] as number[],
  endDate: '',
};

export default function EventsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setItems(data);
    } catch {
      addToast('error', 'Failed to load events');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingEvent(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    const init = {
      title: ev.title,
      description: ev.description,
      location: ev.location,
      date: ev.date,
      time: ev.time,
      endTime: ev.endTime || '',
      useRecurrence: !!ev.recurrence,
      frequency: ev.recurrence?.frequency || 'weekly',
      interval: ev.recurrence?.interval || 1,
      dayOfWeek: ev.recurrence?.dayOfWeek || [],
      weekOfMonth: ev.recurrence?.weekOfMonth || [],
      endDate: ev.recurrence?.endDate || '',
    };
    setForm(init);
    setInitialForm(init);
    setShowForm(true);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleSave = async () => {
    if (!form.title || !form.date || !form.time || !form.location || !form.description) {
      addToast('error', 'Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      let recurrence: RecurrenceRule | undefined;
      if (form.useRecurrence) {
        recurrence = {
          frequency: form.frequency,
          interval: form.interval > 1 ? form.interval : undefined,
          dayOfWeek: form.dayOfWeek.length > 0 ? form.dayOfWeek : undefined,
          weekOfMonth: form.weekOfMonth.length > 0 ? form.weekOfMonth : undefined,
          endDate: form.endDate || undefined,
        } as RecurrenceRule;
      }
      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          title: form.title,
          description: form.description,
          location: form.location,
          date: form.date,
          time: form.time,
          endTime: form.endTime || undefined,
          recurrence,
        });
        addToast('success', 'Event updated');
      } else {
        const id = slugify(form.title) + '-' + form.date;
        await createEvent({
          id,
          title: form.title,
          description: form.description,
          location: form.location,
          date: form.date,
          time: form.time,
          endTime: form.endTime || undefined,
          recurrence,
        });
        addToast('success', 'Event created');
      }
      setShowForm(false);
      load();
    } catch {
      addToast('error', `Failed to ${editingEvent ? 'update' : 'create'} event`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteTarget.id);
      addToast('success', 'Event deleted');
      setDeleteTarget(null);
      load();
    } catch {
      addToast('error', 'Failed to delete event');
    }
    setDeleting(false);
  };

  const getRecurrenceLabel = (ev: CalendarEvent) => {
    if (!ev.recurrence) return 'One-time';
    const freq = ev.recurrence.frequency;
    return freq.charAt(0).toUpperCase() + freq.slice(1);
  };

  const filtered = search
    ? items.filter((e) =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.location.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) return <p className="admin__loading">Loading events...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin__create-btn" onClick={openCreate}>+ Create Event</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Title</th><th>Date</th><th>Time</th><th>Location</th><th>Recurrence</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((ev) => (
              <tr key={ev.id}>
                <td>{ev.title}</td>
                <td>{ev.date}</td>
                <td>{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ''}</td>
                <td>{ev.location}</td>
                <td>
                  <span className={`admin__badge admin__badge--${ev.recurrence ? 'active' : 'member'}`}>
                    {getRecurrenceLabel(ev)}
                  </span>
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <button className="admin__action-btn" onClick={() => openEdit(ev)}>Edit</button>
                    <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(ev)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>No events yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminFormModal
          title={editingEvent ? 'Edit Event' : 'Create Event'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
          isDirty={isDirty}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Title *</label>
              <input className="afm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Location *</label>
              <input className="afm-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Description *</label>
            <textarea className="afm-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Date *</label>
              <input className="afm-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Start Time *</label>
              <input className="afm-input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">End Time</label>
            <input className="afm-input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <div className="afm-checkbox-row">
            <input
              type="checkbox"
              id="useRecurrence"
              checked={form.useRecurrence}
              onChange={(e) => setForm({ ...form, useRecurrence: e.target.checked })}
            />
            <label htmlFor="useRecurrence">Recurring event</label>
          </div>
          {form.useRecurrence && (
            <>
              <div className="afm-row">
                <div className="afm-field">
                  <label className="afm-label">Frequency</label>
                  <select className="afm-select" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as 'weekly' | 'monthly' })}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="afm-field">
                  <label className="afm-label">Interval</label>
                  <input className="afm-input" type="number" min={1} value={form.interval} onChange={(e) => setForm({ ...form, interval: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="afm-field">
                <label className="afm-label">Days of Week</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map((label, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={form.dayOfWeek.includes(i)}
                        onChange={(e) => {
                          const dow = e.target.checked
                            ? [...form.dayOfWeek, i]
                            : form.dayOfWeek.filter((d) => d !== i);
                          setForm({ ...form, dayOfWeek: dow });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="afm-field">
                <label className="afm-label">End Date</label>
                <input className="afm-input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </>
          )}
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Event"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
