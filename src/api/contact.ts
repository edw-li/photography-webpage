import { apiFetch } from './client';

interface ContactSubmission {
  name: string;
  email: string;
  message: string;
}

export async function submitContact(data: ContactSubmission): Promise<void> {
  await apiFetch('/contact', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
