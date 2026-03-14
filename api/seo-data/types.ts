export interface FaqItem {
  question: string;
  answer: string;
}

export interface SeoPage {
  slug: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  intro: string;
  howItWorks: string[];
  faq: FaqItem[];
}
