/**
 * Type definitions for the faq addon.
 */
export interface FaqEntry {
  id: string;
  title: string;
  answer: string;

  tags: string[];
  createdAt: string;
  uses: number;
}
