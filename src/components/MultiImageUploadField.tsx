import React, { useRef, useState } from 'react';
import { uploadImage } from '../api/uploads';
import { getImageUrl } from '../utils/imageUrl';
import { compressImage } from '../utils/compressImage';
import { X } from 'lucide-react';

export interface ImageWithCaption {
  id?: number;
  url: string;
  caption: string;
}

interface MultiImageUploadFieldProps {
  items: ImageWithCaption[];
  onChange: (items: ImageWithCaption[]) => void;
  onAdd?: (src: string) => Promise<{ id: number }>;
  onRemove?: (id: number) => Promise<void>;
  category: string;
  label?: string;
  maxItems?: number;
}

export default function MultiImageUploadField({
  items,
  onChange,
  onAdd,
  onRemove,
  category,
  label,
  maxItems = 10,
}: MultiImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setError('');
    setCompressing(true);
    try {
      const { file: compressed } = await compressImage(file);
      setCompressing(false);
      setUploading(true);
      try {
        const url = await uploadImage(compressed, category);
        if (onAdd) {
          const result = await onAdd(url);
          onChange([...items, { id: result.id, url, caption: '' }]);
        } else {
          onChange([...items, { url, caption: '' }]);
        }
      } finally {
        setUploading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCompressing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const updateCaption = (index: number, caption: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], caption };
    onChange(updated);
  };

  const removeItem = async (index: number) => {
    const item = items[index];
    if (onRemove && item.id != null) {
      setRemovingId(item.id);
      try {
        await onRemove(item.id);
        onChange(items.filter((_, i) => i !== index));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
      setRemovingId(null);
    } else {
      onChange(items.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="afm-field">
      {label && <label className="afm-label">{label}</label>}

      {items.map((item, i) => (
        <div
          key={item.id ?? i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <img
            src={getImageUrl(item.url, 'thumb')}
            alt={item.caption || `Photo ${i + 1}`}
            style={{
              width: 48,
              height: 48,
              objectFit: 'cover',
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
          <input
            className="afm-input"
            value={item.caption}
            onChange={(e) => updateCaption(i, e.target.value)}
            placeholder="Caption (optional)"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="admin__action-btn admin__action-btn--danger"
            onClick={() => removeItem(i)}
            disabled={removingId === item.id}
            style={{ flexShrink: 0, padding: '0.25rem' }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {items.length < maxItems && (
        <button
          type="button"
          className="admin__action-btn"
          onClick={() => inputRef.current?.click()}
          disabled={compressing || uploading}
          style={{ marginTop: items.length > 0 ? '0.25rem' : 0 }}
        >
          {compressing ? 'Compressing...' : uploading ? 'Uploading...' : '+ Add Photo'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {error && (
        <p style={{ color: 'var(--color-error, #e53e3e)', fontSize: '0.8rem', marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
