import React, { useRef, useState } from 'react';
import { uploadImage } from '../api/uploads';
import { compressImage } from '../utils/compressImage';

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  category: string;
  label?: string;
  shape?: 'square' | 'circle';
  required?: boolean;
  onRawFile?: (file: File) => void;
}

export default function ImageUploadField({
  value,
  onChange,
  category,
  label,
  shape = 'square',
  required = false,
  onRawFile,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    onRawFile?.(file);
    setError('');
    setCompressing(true);
    try {
      const { file: compressed } = await compressImage(file);
      setCompressing(false);
      setUploading(true);
      try {
        const url = await uploadImage(compressed, category);
        onChange(url);
      } finally {
        setUploading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCompressing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const isCircle = shape === 'circle';
  const previewSize = isCircle ? 80 : 120;

  return (
    <div className="afm-field">
      {label && (
        <label className="afm-label">
          {label} {required && '*'}
        </label>
      )}

      {value ? (
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            cursor: 'pointer',
          }}
          onClick={() => inputRef.current?.click()}
        >
          <img
            src={value}
            alt="Uploaded"
            style={{
              width: previewSize,
              height: previewSize,
              objectFit: 'cover',
              borderRadius: isCircle ? '50%' : 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              borderRadius: isCircle ? '50%' : 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.2s',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
          >
            Click to replace
          </div>
        </div>
      ) : (
        <div
          className={`admin__drop-zone${dragging ? ' admin__drop-zone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{ padding: '1.5rem' }}
        >
          {compressing ? (
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Compressing...</p>
          ) : uploading ? (
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Uploading...</p>
          ) : (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Drag & drop an image, or click to browse
            </p>
          )}
        </div>
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
