/** A single knowledge-base entry. Stored per-guild under key 'entries'. */
export interface FaqEntry {
  id: string;
  title: string;
  answer: string;
  /** Lowercased search terms in addition to the title. */
  tags: string[];
  createdAt: string;
  uses: number;
}
