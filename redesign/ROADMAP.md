# ArkenBot v2 Redesign — Master Roadmap & Tracker

**Branch:** `feat/v2-redesign` · **Worktree:** `/home/bot/arkenbot-v2` (prod `main` at `/home/bot/bot` is untouched until cutover)
**Design reference:** v2 mockup canvas (dark-first, emerald accent, Space Grotesk / Manrope / JetBrains Mono)
**Principle:** incremental & feature-flagged — v1 keeps running; v2 ships page-by-page behind a flag, cutover only when complete.
**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Setup
- [x] Isolated worktree + `feat/v2-redesign` branch
- [x] Master tracker (this file)
- [ ] Feature-flag mechanism (v1/v2 coexist; opt-in beta) — **decided: opt-in beta on same routes, `.v2` class**
- [x] `pnpm install` in worktree

## Phase 1 — Foundations (design system)
- [x] Design tokens: color (light+dark), type scale, spacing, radius, shadow, motion — `packages/web/src/styles/tokens.v2.css` (scoped `.v2`, dark + light, emerald accent). *Tailwind theme mapping still TODO.*
- [x] Fonts wired (Space Grotesk / Manrope / JetBrains Mono via next/font in `layout.tsx`; families exposed as CSS vars, applied only under `.v2`)
- [x] UI kit location decided → `packages/web/src/components/ui/`
- [x] Primitives: Button, Input, Select, Switch, Tabs, Badge, Tooltip, Avatar, Card, Skeleton, Kbd (+ composites StatTile, SettingCard) — `components/ui/*`, barrel `index.ts`. *TODO later: Textarea, Checkbox, Radio, Divider, ScrollArea, IconButton.*
- [x] Kitchen-sink route `/v2-kit` (client page, light/dark toggle) — dev preview, remove before cutover
- [ ] Icon set standardized (Lucide) + audit

## Phase 2 — App shell
- [ ] Layout grid (sidebar + topbar + content), light/dark
- [ ] Sidebar: regrouped IA, collapsible groups, active states, counts
- [ ] Server switcher
- [ ] Topbar: breadcrumbs, search, notifications, avatar menu, theme toggle
- [ ] Command palette (⌘K) — rebuild/extend existing `CommandPalette.tsx` (pages + settings + actions)
- [ ] Global search
- [ ] Persistent Save bar (dirty-state tracking, diff count, discard/save)
- [ ] Toast system
- [ ] Theme provider + persistence

## Phase 3 — Composite components
- [ ] SettingCard (icon/title/desc/control + expandable body)
- [ ] Section (replaces `SettingsSection`)
- [ ] StatTile (replaces `StatCard`) — sparkline + trend
- [ ] ChartCard wrappers (area/bar/donut) — recharts 3, tokenized colors
- [ ] EmptyState (+ enable CTA)
- [ ] DataTable (sortable, paginated)
- [ ] Modal / Sheet / Drawer
- [ ] LivePreview panel (welcome cards, embeds, automod)
- [ ] Form field patterns: inline validation, chips-input, slider
- [ ] PageHeader (breadcrumb + title + actions)

## Phase 4 — Dashboard pages (50)
### Home
- [ ] Overview · [ ] Analytics · [ ] Setup Wizard · [ ] Server select (root) · [ ] Account
### Safety
- [ ] Moderation · [ ] Auto-Mod · [ ] Anti-Nuke · [ ] Auto-Slowmode · [ ] Verification · [ ] Reports · [ ] Appeals · [ ] Logs · [ ] Audit Log
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
