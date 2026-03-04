import { apiFetch } from './client';

interface UploadResponse {
  url: string;
}

export async function uploadImage(file: File, category: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  const response = await apiFetch<UploadResponse>('/uploads', {
    method: 'POST',
    body: formData,
    headers: {},
  });
  return response.url;
}
