import { useState, type MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { likePhoto, unlikePhoto } from '../api/gallery';
import './LikeButton.css';

interface LikeButtonProps {
  photoId: number;
  liked: boolean;
  count: number;
  onChange: (liked: boolean, count: number) => void;
}

export default function LikeButton({ photoId, liked, count, onChange }: LikeButtonProps) {
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      addToast('info', 'Log in to like this photo');
      navigate('/login');
      return;
    }
    if (pending) return;

    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
    // Optimistic update
    onChange(nextLiked, nextCount);
    setPending(true);
    try {
      if (nextLiked) {
        await likePhoto(photoId);
      } else {
        await unlikePhoto(photoId);
      }
    } catch {
      // Revert on error
      onChange(liked, count);
      addToast('error', 'Failed to update like. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const labelAction = liked ? 'Unlike photo' : 'Like photo';

  return (
    <button
      type="button"
      className={`like-button${liked ? ' like-button--active' : ''}${pending ? ' like-button--pending' : ''}`}
      onClick={handleClick}
      aria-label={labelAction}
      aria-pressed={liked}
      title={isAuthenticated ? labelAction : 'Log in to like'}
    >
      <Heart
        size={18}
        className="like-button__icon"
        fill={liked ? 'currentColor' : 'none'}
      />
      <span className="like-button__count">{count}</span>
    </button>
  );
}
