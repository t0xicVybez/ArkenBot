# ArkenBot v2 Redesign — Master Roadmap & Tracker

**Branch:** `feat/v2-redesign` · **Worktree:** `/home/bot/arkenbot-v2` (prod `main` at `/home/bot/bot` is untouched until cutover)
**Design reference:** v2 mockup canvas (dark-first, emerald accent, Space Grotesk / Manrope / JetBrains Mono)
**Principle:** incremental & feature-flagged — v1 keeps running; v2 ships page-by-page behind a flag, cutover only when complete.
**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Setup
- [x] Isolated worktree + `feat/v2-redesign` branch
- [x] Master tracker (this file)
- [x] Feature-flag mechanism — `arken_v2` cookie gates the per-guild layout to the v2 shell (`?v2=1`/`?v2=0` toggles); default off = v1
- [x] `pnpm install` in worktree

## Phase 1 — Foundations (design system)
- [x] Design tokens: color (light+dark), type scale, spacing, radius, shadow, motion — `packages/web/src/styles/tokens.v2.css` (scoped `.v2`, dark + light, emerald accent). *Tailwind theme mapping still TODO.*
- [x] Fonts wired (Space Grotesk / Manrope / JetBrains Mono via next/font in `layout.tsx`; families exposed as CSS vars, applied only under `.v2`)
- [x] UI kit location decided → `packages/web/src/components/ui/`
- [x] Primitives: Button, Input, Select, Switch, Tabs, Badge, Tooltip, Avatar, Card, Skeleton, Kbd (+ composites StatTile, SettingCard) — `components/ui/*`, barrel `index.ts`. *TODO later: Textarea, Checkbox, Radio, Divider, ScrollArea, IconButton.*
- [x] Kitchen-sink route `/v2-kit` (client page, light/dark toggle) — dev preview, remove before cutover
- [ ] Icon set standardized (Lucide) + audit

## Phase 2 — App shell  →  live at /v2-app
- [x] Layout grid (sidebar + topbar + content), light/dark — `components/shell/AppShell.tsx`
- [x] Sidebar: regrouped IA (`shell/nav.ts`, all 5 groups/~40 items), collapsible groups, active states, counts — `shell/Sidebar.tsx`
- [x] Server switcher (static for now) — in Sidebar
- [x] Topbar: breadcrumbs, search trigger, notifications, avatar, theme toggle — `shell/Topbar.tsx`
- [x] Command palette (⌘K) — `shell/CommandPalette.tsx` (global ⌘K, search over pages; actions TODO)
- [x] Persistent Save bar (diff count, discard/save) — `shell/SaveBar.tsx` (renders when `dirty`)
- [x] Theme provider + persistence — in AppShell (localStorage `v2-theme`)
- [ ] Global search (beyond palette) · [ ] Toast system · [ ] Command-palette actions/settings
- [x] Beta-flag wiring on real routes — `DashboardShell` behind `arken_v2` cookie; v1 pages render inside the v2 shell until each is migrated

## Phase 3 — Composite components
- [x] SettingCard (icon/title/desc/control + expandable body)
- [x] StatTile (replaces `StatCard`) — trend
- [x] LivePreview panel — `ui/LivePreview.tsx`
- [x] Toast — `ui/Toast.tsx` (controlled; global Toaster TODO)
- [x] Form field patterns: chips, slider (range + accent-color), Select — shown on Auto-Mod
- [x] ChartCard wrapper (area/bar/donut via recharts 3, tokenized) — `ui/ChartCard.tsx`
- [ ] EmptyState (+ enable CTA) · [ ] DataTable · [ ] Modal / Sheet / Drawer
- [ ] Section component (replaces `SettingsSection`) · [ ] PageHeader component

## Phase 4 — Dashboard pages (50)
**Tier 1 — theme migration: DONE for ALL pages.** The v2 shell (`DashboardShell`) + variable-driven tokens (component classes and `discord.*` colors now resolve to v2 vars under `.v2`) mean every page auto-restyles to the v2 design system (emerald, surfaces, fonts, shell) with full functionality (real data/save/i18n) intact — no per-page rewrite needed for the base look. Verify live via prod-behind-flag (`?v2=1`).
**Tier 2 — per-page polish (the checkboxes below):** upgrade specific pages to the refined v2 composites (SettingCard, StatTile, save bar, live preview, ChartCard) and mockup-exact layouts. Overview/Auto-Mod/Analytics have full v2 builds at `/v2-app*` to port onto the real routes.

### Home
- [x] Overview · [x] Analytics · [ ] Setup Wizard · [ ] Server select (root) · [ ] Account
### Safety
- [ ] Moderation · [x] Auto-Mod (live at /v2-app/automod — save bar + live preview) · [ ] Anti-Nuke · [ ] Auto-Slowmode · [ ] Verification · [ ] Reports · [ ] Appeals · [ ] Logs · [ ] Audit Log
### Community
- [ ] Leveling · [ ] Leaderboard · [ ] Welcome · [ ] Reaction Roles · [ ] Self Roles · [ ] Birthdays · [ ] Polls · [ ] Suggestions · [ ] Giveaways · [ ] Economy · [ ] Starboard · [ ] Invite Tracker · [ ] Vote Rewards · [ ] Counting
### Content & Tools
- [ ] Music · [ ] Stats Channels · [ ] Embed Builder · [ ] Scheduled Messages · [ ] Temp Voice · [ ] Commands · [ ] Forum Management · [ ] Members · [ ] RSS Feeds · [ ] Stream Alerts · [ ] Announcements
### Extend / Add-ons
- [ ] Add-ons (marketplace) · [ ] Tickets (main) · [ ] Tickets/Settings · [ ] Tickets/Panels · [ ] Tickets/Canned Responses · [ ] Tickets/Stats · [ ] Tickets/[ticketId] · [ ] Applications · [ ] Monday.com · [ ] Trello
### Server
- [ ] Server Settings

## Phase 5 — Marketing & public (19)
- [ ] Home · [ ] Features · [ ] Add-ons · [ ] Changelog · [ ] Status · [ ] Privacy · [ ] Terms · [ ] Appeal · [ ] Auth (login) · [ ] Public Leaderboard `[guildId]`
- [ ] LandingNav + Footer restyle
### Staff portal (9)
- [ ] Staff home · [ ] Addons · [ ] Announcements · [ ] Guilds · [ ] Logs · [ ] Metrics · [ ] Service Logs · [ ] Settings · [ ] Users
### Docs
- [ ] Docusaurus theme restyle to match (submodule `packages/docs`)

## Phase 6 — Cross-cutting
- [ ] i18n: every new/changed web string across all 14 locales
- [ ] Accessibility (WCAG AA, keyboard, focus, contrast — both themes)
- [ ] Performance (code-split, skeletons, optimistic mutations, LCP)
- [ ] Motion pass (transitions + reduced-motion)
- [ ] Responsive/mobile pass on every page
- [ ] Light-mode parity

## Phase 7 — QA & rollout
- [ ] Visual QA vs mockup · [ ] Cross-browser
- [ ] Feature-flag / opt-in beta rollout
- [ ] Cutover plan + rollback
- [ ] Retire v1 after stabilization
- [ ] Tests + CI updates

---

**Totals:** 5 foundation groups · app shell · ~11 composites · **50 dashboard pages** · **19 public pages** + docs · cross-cutting + rollout.
Update the boxes as we go; every page has a line so nothing is missed.
