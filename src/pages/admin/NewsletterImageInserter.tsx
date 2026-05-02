import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { compressImage, isImageFile, IMAGE_ACCEPT } from '../../utils/compressImage';
import { uploadNewsletterImage } from '../../api/newsletters';
import { useToast } from '../../contexts/ToastContext';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface NewsletterImageInserterProps {
  newsletterId: string;
  enabled: boolean;
  /** Called once an image has been uploaded; parent prompts for alt text and inserts. */
  onUploaded: (url: string, filename: string) => void;
}

export default function NewsletterImageInserter({
  newsletterId,
  enabled,
  onUploaded,
}: NewsletterImageInserterProps) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'idle' | 'compressing' | 'uploading'>('idle');

  const handleFile = async (file: File) => {
    if (!enabled) {
      addToast('error', 'Set the title and date before adding images');
      return;
    }
    if (!isImageFile(file)) {
      addToast('error', 'Please select an image file');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      addToast('error', `Image must be under ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    setBusy('compressing');
    try {
      const { file: compressed } = await compressImage(file, { maxSizeMB: MAX_FILE_SIZE_MB });
      setBusy('uploading');
      const url = await uploadNewsletterImage(compressed, newsletterId);
      onUploaded(url, file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      addToast('error', msg);
    } finally {
      setBusy('idle');
    }
  };

  const handlePickClick = () => {
    if (!enabled) {
      addToast('error', 'Set the title and date before adding images');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file);
  };

  const buttonLabel =
    busy === 'compressing' ? 'Compressing…' :
    busy === 'uploading' ? 'Uploading…' :
    'Insert image';
  const buttonBusy = busy !== 'idle';

  return (
    <>
      <button
        type="button"
        className="admin__action-btn"
        onClick={handlePickClick}
        disabled={!enabled || buttonBusy}
        title={enabled ? 'Insert an image into the newsletter body' : 'Set title and date first'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {buttonBusy
          ? <Loader2 size={14} className="confirm-dialog__spinner" />
          : <ImageIcon size={14} />}
        {buttonLabel}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </>
  );
}
