import type { Member } from '../types/members';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface MembersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  specialty?: string;
}

export async function getMembers(query: MembersQuery = {}): Promise<PaginatedResponse<Member>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('page_size', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  if (query.specialty) params.set('specialty', query.specialty);
  const qs = params.toString();
  return apiFetch<PaginatedResponse<Member>>(`/members${qs ? `?${qs}` : ''}`);
}

export async function getMember(id: number): Promise<Member> {
  return apiFetch<Member>(`/members/${id}`);
}

export async function getLeaders(): Promise<Member[]> {
  return apiFetch<Member[]>('/members/leaders');
}
