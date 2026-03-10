export interface NewsletterMeta {
  title: string;
  date: string;
  category: string;
  author: string;
  preview: string;
  featured?: boolean;
}

export interface Newsletter extends NewsletterMeta {
  id: string;
  html: string;
  emailedAt?: string | null;
}
