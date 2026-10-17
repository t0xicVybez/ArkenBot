import { describe, it, expect } from 'vitest';

// HTTP smoke test for the web dashboard. Gated on WEB_SMOKE_URL so it only runs
// when pointed at a running instance (set WEB_SMOKE_URL=http://localhost:3000);
// CI has no web server, so it skips. It catches the class of failure the
// dashboard hit recently — a page that 500s or renders a Next.js error boundary
// instead of its content — across the whole public + dashboard surface.
const BASE = process.env.WEB_SMOKE_URL;

// Public pages: must return 200 and real HTML (no error boundary).
const PUBLIC = ['/', '/features', '/status', '/privacy', '/terms', '/changelog', '/addons'];
// Guild dashboard + staff routes: served to the client shell (auth happens
// client-side), so they must not 5xx and must not be an error boundary.
const GID = '1477178076789211136';
const APP = [
  `/dashboard/${GID}`, `/dashboard/${GID}/leveling`, `/dashboard/${GID}/settings`,
  `/dashboard/${GID}/automod`, `/dashboard/${GID}/embeds`, `/dashboard/${GID}/tickets`,
  `/dashboard/${GID}/analytics`, `/dashboard/${GID}/economy`, `/dashboard/${GID}/moderation`,
  `/dashboard/${GID}/reaction-roles`, `/dashboard/${GID}/welcome`, `/dashboard/${GID}/music`,
  `/dashboard/account`, '/staff', '/staff/metrics', '/staff/service-logs',
];

const ERROR_MARKERS = ['Application error', 'Internal Server Error', '__next_error__', 'client reference manifest'];

async function fetchPage(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { 'User-Agent': 'arken-smoke' } });
  const body = res.status < 400 ? await res.text() : '';
  return { status: res.status, body };
}

describe.skipIf(!BASE)('web smoke (WEB_SMOKE_URL)', () => {
  it('serves public pages with real content (200, no error boundary)', async () => {
    for (const path of PUBLIC) {
      const { status, body } = await fetchPage(path);
      expect(status, `${path} status`).toBe(200);
      for (const marker of ERROR_MARKERS) {
        expect(body.includes(marker), `${path} contains "${marker}"`).toBe(false);
      }
    }
  });

  it('serves dashboard/staff routes without a server error', async () => {
    for (const path of APP) {
      const { status, body } = await fetchPage(path);
      // 200 (client shell) or 3xx (redirect to login) are both fine; never 5xx.
      expect(status, `${path} status (${status})`).toBeLessThan(500);
      if (body) for (const marker of ERROR_MARKERS) {
        expect(body.includes(marker), `${path} contains "${marker}"`).toBe(false);
      }
    }
  });
});
