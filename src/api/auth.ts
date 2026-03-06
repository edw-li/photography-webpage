import { apiFetch, setTokens, clearTokens } from './client';
import type { Member } from '../types/members';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  member?: Member;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const tokens = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(tokens.accessToken, tokens.refreshToken);
  return getCurrentUser();
}

export async function register(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<AuthUser> {
  const tokens = await apiFetch<TokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  setTokens(tokens.accessToken, tokens.refreshToken);
  return getCurrentUser();
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

export async function getMyProfile(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

export async function updateMyProfile(data: Record<string, unknown>): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export interface SamplePhotoResponse {
  id: number;
  src: string;
  caption?: string;
}

export async function addSamplePhoto(src: string, caption?: string): Promise<SamplePhotoResponse> {
  return apiFetch<SamplePhotoResponse>('/auth/profile/sample-photos', {
    method: 'POST',
    body: JSON.stringify({ src, caption }),
  });
}

export async function deleteSamplePhoto(photoId: number): Promise<void> {
  await apiFetch<void>(`/auth/profile/sample-photos/${photoId}`, {
    method: 'DELETE',
  });
}

export async function updateSamplePhotoCaptions(
  photos: { id: number; caption: string | null }[],
): Promise<void> {
  await apiFetch<void>('/auth/profile/sample-photos', {
    method: 'PATCH',
    body: JSON.stringify(photos),
  });
}

export function logout(): void {
  clearTokens();
}

interface MessageResponse {
  message: string;
}

export async function forgotPassword(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}
