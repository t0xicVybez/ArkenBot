'use client';

import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Reddit Feeds are temporarily hidden pending Reddit Data API approval.
// To restore the full feature, revert this file to render <FeedAlertsPage>
// with the reddit platform config (see git history), and re-add the sidebar
// (Sidebar.tsx) and command-palette (CommandPalette.tsx) entries.
export default function RedditFeedsPage() {
  const t = useTranslations('redditFeeds');
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-orange-500/15 text-orange-400 flex items-center justify-center mb-6">
        <Globe className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-semibold text-white mb-2">{t('title')}</h1>
      <p className="text-[var(--text-secondary)] max-w-md">{t('description')}</p>
    </div>
  );
}
