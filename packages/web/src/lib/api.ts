/**
 * Centralised Axios instance for the Arken Bot API.
 * Handles Bearer token injection, automatic token refresh on 401,
 * and exports typed API objects for every feature area.
 */
import axios from 'axios';
import toast from 'react-hot-toast';
import type {
  ApiResponse,
  GuildSettings,
  AutoModConfig,
  WelcomeConfig,
  GuildOverview,
  SystemStats,
} from '@arkenbot/shared';
import { useAuth } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Zustand is the single source of truth for tokens — read directly from the store
// rather than React context so this interceptor works outside component trees.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = useAuth.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Shared refresh promise — ensures concurrent 401s share one refresh call
// instead of each racing to delete and recreate the session.
let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = (async () => {
          const refreshToken = useAuth.getState().refreshToken;
          if (!refreshToken) return null;
          try {
            const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = res.data.data;
            const store = useAuth.getState();
            if (store.user) store.login(store.user, accessToken, newRefreshToken);
            return accessToken as string;
          } catch {
            useAuth.getState().logout();
            toast.error('Your session expired — please log in again.');
            setTimeout(() => { window.location.href = '/auth'; }, 2000);
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newAccessToken = await refreshPromise;
      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  getOAuthUrl: () => api.get<ApiResponse<{ url: string; state: string }>>('/auth/url'),
  callback: (code: string, state: string) =>
    api.post<ApiResponse<{ user: import('@arkenbot/shared').PortalUser; accessToken: string; refreshToken: string }>>('/auth/callback', { code, state }),
  refresh: (refreshToken: string) =>
    api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  me: () => api.get<ApiResponse<import('@arkenbot/shared').PortalUser>>('/auth/me'),
};

// ─── Guilds ───────────────────────────────────────────────────────
export const guildsApi = {
  list: () => api.get<ApiResponse<GuildOverview[]>>('/guilds'),
  get: (guildId: string) => api.get<ApiResponse<GuildOverview>>(`/guilds/${guildId}`),
  channels: (guildId: string) => api.get<ApiResponse<unknown[]>>(`/guilds/${guildId}/channels`),
  roles: (guildId: string) => api.get<ApiResponse<unknown[]>>(`/guilds/${guildId}/roles`),
  analytics: (guildId: string) => api.get<ApiResponse<import('@arkenbot/shared').GuildAnalytics>>(`/guilds/${guildId}/analytics`),
  automodAnalytics: (guildId: string, days = 14) => api.get(`/guilds/${guildId}/analytics/automod`, { params: { days } }),
};

// ─── Settings ─────────────────────────────────────────────────────
export const settingsApi = {
  get: (guildId: string) => api.get<ApiResponse<GuildSettings>>(`/guilds/${guildId}/settings`),
  update: (guildId: string, data: Partial<GuildSettings>) =>
    api.patch<ApiResponse<GuildSettings>>(`/guilds/${guildId}/settings`, data),
  getAutoMod: (guildId: string) => api.get<ApiResponse<AutoModConfig>>(`/guilds/${guildId}/settings/automod`),
  updateAutoMod: (guildId: string, data: Partial<AutoModConfig>) =>
    api.patch<ApiResponse<AutoModConfig>>(`/guilds/${guildId}/settings/automod`, data),
  getWelcome: (guildId: string) => api.get<ApiResponse<WelcomeConfig>>(`/guilds/${guildId}/settings/welcome`),
  updateWelcome: (guildId: string, data: Partial<WelcomeConfig>) =>
    api.patch<ApiResponse<WelcomeConfig>>(`/guilds/${guildId}/settings/welcome`, data),
  getReactionRoles: (guildId: string) => api.get(`/guilds/${guildId}/reaction-roles`),
  createReactionRole: (guildId: string, data: object) =>
    api.post(`/guilds/${guildId}/reaction-roles`, data),
  deleteReactionRole: (guildId: string, id: string) =>
    api.delete(`/guilds/${guildId}/reaction-roles/${id}`),
  getPanels: (guildId: string) =>
    api.get(`/guilds/${guildId}/reaction-roles/panels`),
  createPanel: (guildId: string, data: { channelId: string; title?: string; description?: string }) =>
    api.post(`/guilds/${guildId}/reaction-roles/panels`, data),
  updatePanel: (guildId: string, panelId: string, data: { title?: string; description?: string }) =>
    api.patch(`/guilds/${guildId}/reaction-roles/panels/${panelId}`, data),
  deletePanel: (guildId: string, panelId: string) =>
    api.delete(`/guilds/${guildId}/reaction-roles/panels/${panelId}`),
  addPanelRole: (guildId: string, panelId: string, data: { emoji: string; roleId: string; type?: string }) =>
    api.post(`/guilds/${guildId}/reaction-roles/panels/${panelId}/roles`, data),
  removePanelRole: (guildId: string, panelId: string, roleId: string) =>
    api.delete(`/guilds/${guildId}/reaction-roles/panels/${panelId}/roles/${roleId}`),
};

// ─── Moderation ───────────────────────────────────────────────────
export const moderationApi = {
  getCases: (guildId: string, params?: object) =>
    api.get(`/guilds/${guildId}/cases`, { params }),
  getCase: (guildId: string, caseNumber: number) =>
    api.get(`/guilds/${guildId}/cases/${caseNumber}`),
  updateCase: (guildId: string, caseNumber: number, data: object) =>
    api.patch(`/guilds/${guildId}/cases/${caseNumber}`, data),
  getWarnings: (guildId: string, params?: object) =>
    api.get(`/guilds/${guildId}/warnings`, { params }),
  clearWarning: (guildId: string, id: string) =>
    api.delete(`/guilds/${guildId}/warnings/${id}`),
  clearAllWarnings: (guildId: string, userId: string) =>
    api.delete(`/guilds/${guildId}/warnings`, { params: { userId } }),
  getLogs: (guildId: string, params?: object) =>
    api.get(`/guilds/${guildId}/logs`, { params }),
};

// ─── Addons ───────────────────────────────────────────────────────
export const addonsApi = {
  listAll: (includeDisabled = false) => api.get('/addons', { params: includeDisabled ? { all: 'true' } : {} }),
  listGuild: (guildId: string) => api.get(`/guilds/${guildId}/addons`),
  install: (guildId: string, addonId: string) =>
    api.post(`/guilds/${guildId}/addons/${addonId}`),
  uninstall: (guildId: string, addonId: string) =>
    api.delete(`/guilds/${guildId}/addons/${addonId}`),
  getSettings: (guildId: string, addonId: string) =>
    api.get(`/guilds/${guildId}/addons/${addonId}/settings`),
  updateSettings: (guildId: string, addonId: string, settings: object) =>
    api.patch(`/guilds/${guildId}/addons/${addonId}/settings`, settings),
  register: (data: object) => api.post('/admin/addons', data),
  update: (id: string, data: object) => api.patch(`/admin/addons/${id}`, data),
};

// ─── Tickets Addon ────────────────────────────────────────────────
export const ticketsApi = {
  getPanels:   (guildId: string) => api.get(`/addons/tickets/${guildId}/panels`),
  createPanel: (guildId: string, data: object) => api.post(`/addons/tickets/${guildId}/panels`, data),
  updatePanel: (guildId: string, panelId: string, data: object) => api.patch(`/addons/tickets/${guildId}/panels/${panelId}`, data),
  deletePanel: (guildId: string, panelId: string) => api.delete(`/addons/tickets/${guildId}/panels/${panelId}`),
  getTickets: (guildId: string, params?: { status?: string; priority?: string; panel?: string; search?: string; page?: number }) =>
    api.get(`/addons/tickets/${guildId}/tickets`, { params }),
  getTicket: (guildId: string, ticketId: string) =>
    api.get(`/addons/tickets/${guildId}/tickets/${ticketId}`),
  deleteTicket: (guildId: string, ticketId: string) =>
    api.delete(`/addons/tickets/${guildId}/tickets/${ticketId}`),
  reopenTicket: (guildId: string, ticketId: string) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/reopen`),
  bulkClose: (guildId: string, idleHours: number) =>
    api.post(`/addons/tickets/${guildId}/tickets/bulk-close`, { idleHours }),
  claimTicket: (guildId: string, ticketId: string, data: { userId: string; userTag: string }) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/claim`, data),
  unclaimTicket: (guildId: string, ticketId: string) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/unclaim`),
  transferTicket: (guildId: string, ticketId: string, data: { userId: string; userTag: string }) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/transfer`, data),
  setPriority: (guildId: string, ticketId: string, priority: string) =>
    api.patch(`/addons/tickets/${guildId}/tickets/${ticketId}/priority`, { priority }),
  addTag: (guildId: string, ticketId: string, tag: string) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/tags`, { tag }),
  removeTag: (guildId: string, ticketId: string, tag: string) =>
    api.delete(`/addons/tickets/${guildId}/tickets/${ticketId}/tags/${encodeURIComponent(tag)}`),
  addNote: (guildId: string, ticketId: string, data: { content: string; authorTag: string }) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/notes`, data),
  replyTicket: (guildId: string, ticketId: string, data: { content: string; authorTag: string }) =>
    api.post(`/addons/tickets/${guildId}/tickets/${ticketId}/reply`, data),
  getTranscript: (guildId: string, ticketId: string) =>
    api.get(`/addons/tickets/${guildId}/tickets/${ticketId}/transcript`, { responseType: 'blob' }),
  getStats:      (guildId: string) => api.get(`/addons/tickets/${guildId}/stats`),
  getTimeseries: (guildId: string, days?: number) => api.get(`/addons/tickets/${guildId}/stats/timeseries`, { params: { days } }),
  getConfig:    (guildId: string) => api.get(`/addons/tickets/${guildId}/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/addons/tickets/${guildId}/config`, data),
  getCannedResponses:   (guildId: string) => api.get(`/addons/tickets/${guildId}/canned-responses`),
  createCannedResponse: (guildId: string, data: object) => api.post(`/addons/tickets/${guildId}/canned-responses`, data),
  updateCannedResponse: (guildId: string, responseId: string, data: object) => api.patch(`/addons/tickets/${guildId}/canned-responses/${responseId}`, data),
  deleteCannedResponse: (guildId: string, responseId: string) => api.delete(`/addons/tickets/${guildId}/canned-responses/${responseId}`),
};

// ─── Announcements (guild opt-in settings) ────────────────────────
export const announcementsApi = {
  getSettings: (guildId: string) => api.get(`/guilds/${guildId}/settings/announcements`),
  updateSettings: (guildId: string, data: { announcementsEnabled?: boolean; announcementChannelId?: string | null }) =>
    api.patch(`/guilds/${guildId}/settings/announcements`, data),
};

// ─── Commands (per-guild toggle) ──────────────────────────────────
export const commandsApi = {
  getAvailable: (guildId: string) => api.get<ApiResponse<Array<{ name: string; category: string }>>>(`/guilds/${guildId}/commands/available`),
  getDisabled: (guildId: string) => api.get<ApiResponse<string[]>>(`/guilds/${guildId}/commands/disabled`),
  disable: (guildId: string, commandName: string) => api.post(`/guilds/${guildId}/commands/disabled`, { commandName }),
  enable: (guildId: string, commandName: string) => api.delete(`/guilds/${guildId}/commands/disabled/${commandName}`),
};

// ─── Stats Channels ────────────────────────────────────────────────
export const statsChannelsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/stats-channels`),
  create: (guildId: string, data: { channelId: string; type: string; format?: string }) =>
    api.post(`/guilds/${guildId}/stats-channels`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/stats-channels/${id}`),
};

// ─── Birthday ─────────────────────────────────────────────────────
export const birthdayApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/birthdays/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/birthdays/config`, data),
  list: (guildId: string) => api.get(`/guilds/${guildId}/birthdays`),
  delete: (guildId: string, userId: string) => api.delete(`/guilds/${guildId}/birthdays/${userId}`),
};

// ─── Polls ────────────────────────────────────────────────────────
export const pollsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/polls`),
  close: (guildId: string, pollId: string) => api.patch(`/guilds/${guildId}/polls/${pollId}`, { closed: true }),
  delete: (guildId: string, pollId: string) => api.delete(`/guilds/${guildId}/polls/${pollId}`),
};

// ─── Scheduled Messages ───────────────────────────────────────────
export const scheduledMessagesApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/scheduled-messages`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/scheduled-messages`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/scheduled-messages/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/scheduled-messages/${id}`),
};

// ─── Slowmode ─────────────────────────────────────────────────────
export const slowmodeApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/slowmode`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/slowmode`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/slowmode/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/slowmode/${id}`),
};

// ─── Activity ─────────────────────────────────────────────────────
export const activityApi = {
  get: (guildId: string, days?: number) => api.get(`/guilds/${guildId}/activity`, { params: days ? { days } : {} }),
};

// ─── Members ──────────────────────────────────────────────────────
export const membersApi = {
  search: (guildId: string, search?: string) => api.get(`/guilds/${guildId}/members`, { params: search ? { search } : {} }),
};

// ─── Giveaways ────────────────────────────────────────────────────
export const giveawaysApi = {
  list: (guildId: string, ended?: boolean) =>
    api.get(`/guilds/${guildId}/giveaways`, { params: ended !== undefined ? { ended } : {} }),
};

// ─── Stream / Feed Alerts ─────────────────────────────────────────
export const streamAlertsApi = {
  list: (guildId: string, platforms?: string[]) =>
    api.get(`/guilds/${guildId}/stream-alerts`, { params: platforms?.length ? { platform: platforms.join(',') } : {} }),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/stream-alerts`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/stream-alerts/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/stream-alerts/${id}`),
};

// ─── Suggestions ──────────────────────────────────────────────────
export const suggestionsApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/suggestions/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/suggestions/config`, data),
  list: (guildId: string, status?: string) =>
    api.get(`/guilds/${guildId}/suggestions`, { params: status && status !== 'all' ? { status } : {} }),
};

// ─── Starboard ────────────────────────────────────────────────────
export const starboardApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/starboard/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/starboard/config`, data),
  listEntries: (guildId: string) => api.get(`/guilds/${guildId}/starboard/entries`),
};

// ─── Custom Commands ──────────────────────────────────────────────
export const customCommandsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/custom-commands`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/custom-commands`, data),
  toggle: (guildId: string, id: string, enabled: boolean) =>
    api.patch(`/guilds/${guildId}/custom-commands/${id}`, { enabled }),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/custom-commands/${id}`),
};

// ─── Auto-Responses ───────────────────────────────────────────────
export const autoResponsesApi = {
  list:   (guildId: string) => api.get(`/guilds/${guildId}/auto-responses`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/auto-responses`, data),
  toggle: (guildId: string, id: string, enabled: boolean) =>
    api.patch(`/guilds/${guildId}/auto-responses/${id}`, { enabled }),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/auto-responses/${id}`),
};

// ─── Self-Assignable Roles ────────────────────────────────────────
export const selfRolesApi = {
  list:   (guildId: string) => api.get(`/guilds/${guildId}/self-roles`),
  create: (guildId: string, data: { roleId: string; name: string }) => api.post(`/guilds/${guildId}/self-roles`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/self-roles/${id}`),
};

// ─── Bot Personalization ──────────────────────────────────────────
export const personalizationApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/personalization`),
  update: (guildId: string, data: { nickname?: string | null; botAvatarUrl?: string | null }) =>
    api.patch(`/guilds/${guildId}/personalization`, data),
};

// ─── Counting ─────────────────────────────────────────────────────
export const countingApi = {
  get:   (guildId: string) => api.get(`/guilds/${guildId}/counting`),
  reset: (guildId: string) => api.post(`/guilds/${guildId}/counting/reset`, {}),
};

// ─── Invite Tracker ───────────────────────────────────────────────
export const inviteTrackerApi = {
  get:        (guildId: string) => api.get(`/guilds/${guildId}/invite-tracker`),
  setEnabled: (guildId: string, enabled: boolean) =>
    api.patch(`/guilds/${guildId}/invite-tracker`, { enabled }),
  setBonus: (guildId: string, userId: string, bonus: number) =>
    api.patch(`/guilds/${guildId}/invite-tracker/bonus`, { userId, bonus }),
};

// ─── Level Roles ──────────────────────────────────────────────────
export const levelRolesApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/level-roles`),
  create: (guildId: string, data: { level: number; roleId: string }) =>
    api.post(`/guilds/${guildId}/level-roles`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/level-roles/${id}`),
};

// ─── Embeds ───────────────────────────────────────────────────────────────────
export const embedsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/embeds`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/embeds`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/embeds/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/embeds/${id}`),
  send: (guildId: string, id: string, channelId: string) =>
    api.post(`/guilds/${guildId}/embeds/${id}/send`, { channelId }),
};

// ─── Command Role Permissions ─────────────────────────────────────
export const commandPermissionsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/command-permissions`),
  set: (guildId: string, data: { commandName: string; roleId: string; allow: boolean }) =>
    api.post(`/guilds/${guildId}/command-permissions`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/command-permissions/${id}`),
};

// ─── Leaderboard Management ───────────────────────────────────────
export const leaderboardApi = {
  resetInactive: (guildId: string) => api.post(`/guilds/${guildId}/leaderboard/reset-inactive`),
};

// ─── XP Role Multipliers ──────────────────────────────────────────
export const xpMultipliersApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/xp-multipliers`),
  create: (guildId: string, data: { roleId: string; multiplier: number }) =>
    api.post(`/guilds/${guildId}/xp-multipliers`, data),
  delete: (guildId: string, roleId: string) => api.delete(`/guilds/${guildId}/xp-multipliers/${roleId}`),
};

// ─── XP Channel Multipliers ───────────────────────────────────────
export const xpChannelMultipliersApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/xp-channel-multipliers`),
  create: (guildId: string, data: { channelId: string; multiplier: number }) =>
    api.post(`/guilds/${guildId}/xp-channel-multipliers`, data),
  delete: (guildId: string, channelId: string) =>
    api.delete(`/guilds/${guildId}/xp-channel-multipliers/${channelId}`),
};

// ─── Applications ─────────────────────────────────────────────────
export const applicationsApi = {
  listForms: (guildId: string) => api.get(`/guilds/${guildId}/applications/forms`),
  createForm: (guildId: string, data: object) => api.post(`/guilds/${guildId}/applications/forms`, data),
  updateForm: (guildId: string, formId: string, data: object) =>
    api.patch(`/guilds/${guildId}/applications/forms/${formId}`, data),
  deleteForm: (guildId: string, formId: string) =>
    api.delete(`/guilds/${guildId}/applications/forms/${formId}`),
  addField: (guildId: string, formId: string, data: object) =>
    api.post(`/guilds/${guildId}/applications/forms/${formId}/fields`, data),
  deleteField: (guildId: string, formId: string, fieldId: string) =>
    api.delete(`/guilds/${guildId}/applications/forms/${formId}/fields/${fieldId}`),
  listSubmissions: (guildId: string, params?: object) =>
    api.get(`/guilds/${guildId}/applications/submissions`, { params }),
  reviewSubmission: (
    guildId: string,
    submissionId: string,
    data: { action: 'accept' | 'deny'; note?: string },
  ) => api.post(`/guilds/${guildId}/applications/submissions/${submissionId}/review`, data),
};

// ─── Anti-Nuke ────────────────────────────────────────────────────
export const antiNukeApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/anti-nuke/config`),
  update: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/anti-nuke/config`, data),
};

// ─── Verification ─────────────────────────────────────────────────
export const verificationApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/verification/config`),
  update: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/verification/config`, data),
};

// ─── Forum Management ─────────────────────────────────────────────
export const forumManagementApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/forum-management/config`),
  update: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/forum-management/config`, data),
};

// ─── Reports ──────────────────────────────────────────────────────
export const reportsApi = {
  list: (guildId: string, status?: string) =>
    api.get(`/guilds/${guildId}/reports`, { params: status ? { status } : {} }),
  update: (guildId: string, reportId: string, data: object) =>
    api.patch(`/guilds/${guildId}/reports/${reportId}`, data),
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/report-config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/report-config`, data),
};

// ─── Warning Escalation (stored in GuildSettings.extended) ────────
export const warningEscalationApi = {
  get: (guildId: string) => api.get(`/guilds/${guildId}/warning-escalation`),
  update: (guildId: string, escalations: Array<{ count: number; action: string; duration?: number }>) =>
    api.put(`/guilds/${guildId}/warning-escalation`, { escalations }),
};

// ─── Temp Voice Channels ──────────────────────────────────────────
export const tempVoiceApi = {
  getTriggers: (guildId: string) => api.get(`/guilds/${guildId}/temp-voice/triggers`),
  addTrigger: (guildId: string, channelId: string, categoryId?: string | null) =>
    api.post(`/guilds/${guildId}/temp-voice/triggers`, { channelId, categoryId: categoryId ?? null }),
  removeTrigger: (guildId: string, channelId: string) =>
    api.delete(`/guilds/${guildId}/temp-voice/triggers/${channelId}`),
};

// ─── Monday.com Alerts ────────────────────────────────────────────
export const mondayApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/monday-alerts`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/monday-alerts`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/monday-alerts/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/monday-alerts/${id}`),
};

// ─── Trello ───────────────────────────────────────────────────────
export const trelloApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/trello-alerts`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/trello-alerts`, data),
  update: (guildId: string, id: string, data: object) => api.patch(`/guilds/${guildId}/trello-alerts/${id}`, data),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/trello-alerts/${id}`),
};

// ─── Config Export / Import ───────────────────────────────────────
export const configTransferApi = {
  export: (guildId: string) => api.get(`/guilds/${guildId}/config-export`),
  import: (guildId: string, data: object) => api.post(`/guilds/${guildId}/config-import`, data),
};

// ─── Dashboard Audit Log ──────────────────────────────────────────
export const auditLogApi = {
  list: (guildId: string, page = 1) => api.get(`/guilds/${guildId}/audit-log`, { params: { page } }),
};

// ─── Admin ────────────────────────────────────────────────────────
export const adminApi = {
  getGuilds: (params?: object) => api.get('/admin/guilds', { params }),
  deleteGuild: (guildId: string) => api.delete(`/admin/guilds/${guildId}`),
  getStats: () => api.get<ApiResponse<SystemStats>>('/admin/stats'),
  getUsers: (params?: object) => api.get('/admin/users', { params }),
  updateUser: (id: string, data: object) => api.patch(`/admin/users/${id}`, data),
  getLogs: (params?: object) => api.get('/admin/logs', { params }),
  getBotConfig: () => api.get('/admin/bot-config'),
  updateBotConfig: (data: object) => api.patch('/admin/bot-config', data),
  getMetrics: () => api.get<string>('/admin/metrics', { responseType: 'text' }),
  getAnnouncements: () => api.get('/admin/announcements'),
  sendAnnouncement: (data: { title: string; body: string; type: string }) =>
    api.post('/admin/announcements', data),
  generateAnnouncement: (count?: number) =>
    api.post<{ success: boolean; data: { title: string; body: string; type: string } }>('/admin/announcements/generate', { count }),
};

export default api;
