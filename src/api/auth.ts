import { apiFetch, setTokens, clearTokens } from './client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export async function register(email: string, password: string): Promise<AuthUser> {
  const tokens = await apiFetch<TokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(tokens.accessToken, tokens.refreshToken);
  return getCurrentUser();
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

export function logout(): void {
  clearTokens();
}
