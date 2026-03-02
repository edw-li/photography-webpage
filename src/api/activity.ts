import type { ActivityItem, Paginated } from '../pages/admin/types';
import { apiFetch } from './client';

export async function getActivityLog(
  page = 1,
  pageSize = 10,
): Promise<Paginated<ActivityItem>> {
  return apiFetch<Paginated<ActivityItem>>(
    `/activity?page=${page}&page_size=${pageSize}`,
  );
}
