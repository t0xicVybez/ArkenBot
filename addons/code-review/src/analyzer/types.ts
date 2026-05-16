/** Shared types for the code analysis pipeline. */

/** A single code issue identified by a static or AI-powered analysis pass. */
export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/** The complete result of analyzing a code snippet. */
export interface AnalysisResult {
  language: string;
  issues: Issue[];
  /** The formatted (or AI-corrected) version of the submitted code. */
  formatted: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Present and `true` when the review was produced by the Groq AI backend. */
  aiPowered?: boolean;
  /** One-sentence summary provided by the AI reviewer. */
  summary?: string;
}
