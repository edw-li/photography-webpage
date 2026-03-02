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

export function logout(): void {
  clearTokens();
}
