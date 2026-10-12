/**
 * Type definitions for the code-review addon.
 */
export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AnalysisResult {
  language: string;
  issues: Issue[];

  formatted: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;

  aiPowered?: boolean;

  summary?: string;
}
