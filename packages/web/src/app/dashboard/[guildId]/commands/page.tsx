'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commandsApi, commandPermissionsApi, guildsApi, autoResponsesApi } from '@/lib/api';
import { Terminal, Plus, Trash2, ShieldCheck, Regex } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';

type CommandEntry = { name: string; category: string };

type CustomCommand = {
  id: string;
  name: string;
  aliases: string[];
  response: string;
  embed: boolean;
  embedTitle?: string;
  embedColor?: string;
  deleteInvoking: boolean;
  dmResponse: boolean;
  cooldown: number;
  requiredRoles: string[];
  enabled: boolean;
  uses: number;
};


type AutoResponse = {
  id: string;
  pattern: string;
  flags: string;
  response: string;
  embed: boolean;
  embedColor?: string;
  deleteMessage: boolean;
  enabled: boolean;
  uses: number;
};

const customCommandsApi = {
  list: (guildId: string) => api.get(`/guilds/${guildId}/custom-commands`),
  create: (guildId: string, data: object) => api.post(`/guilds/${guildId}/custom-commands`, data),
  toggle: (guildId: string, id: string, enabled: boolean) =>
    api.patch(`/guilds/${guildId}/custom-commands/${id}`, { enabled }),
  delete: (guildId: string, id: string) => api.delete(`/guilds/${guildId}/custom-commands/${id}`),
};

export default function CommandsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('commandsPage');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showArForm, setShowArForm] = useState(false);
  const [permForm, setPermForm] = useState({ commandName: '', roleIds: [] as string[], allow: true });
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [form, setForm] = useState({
    name: '', aliases: '', response: '',
    embed: false, embedTitle: '', embedColor: '#5865F2',
    deleteInvoking: false, dmResponse: false, cooldown: 0,
  });
  const [arForm, setArForm] = useState({ pattern: '', flags: 'i', response: '', embed: false, embedColor: '#5865F2', deleteMessage: false });

  // All commands visible to this guild, including any addon-registered commands.
  const { data: availableRes } = useQuery({
    queryKey: ['commands-available', guildId],
    queryFn: () => commandsApi.getAvailable(guildId),
  });

  const { data: disabledRes, isLoading: builtinLoading } = useQuery({
    queryKey: ['commands-disabled', guildId],
    queryFn: () => commandsApi.getDisabled(guildId),
  });

  const { data: customRes, isLoading: customLoading } = useQuery({
    queryKey: ['custom-commands', guildId],
    queryFn: () => customCommandsApi.list(guildId),
  });

  const { data: autoResRes, isLoading: arLoading } = useQuery({
    queryKey: ['auto-responses', guildId],
    queryFn: () => autoResponsesApi.list(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const { data: cmdPermsRes } = useQuery({
    queryKey: ['command-permissions', guildId],
    queryFn: () => commandPermissionsApi.list(guildId),
  });

  const COMMANDS: CommandEntry[] = (availableRes?.data?.data ?? []) as CommandEntry[];
  const CATEGORIES = Array.from(new Set(COMMANDS.map((c) => c.category)));
  const disabledCommands: string[] = disabledRes?.data?.data ?? [];
  const customCommands: CustomCommand[] = (customRes?.data as { data?: CustomCommand[] })?.data ?? [];
  const autoResponses: AutoResponse[] = (autoResRes?.data as { data?: AutoResponse[] })?.data ?? [];
  const roles = (rolesRes?.data?.data ?? []) as Array<{ id: string; name: string }>;
  const cmdPerms = (cmdPermsRes?.data?.data ?? []) as Array<{ id: string; commandName: string; roleId: string; allow: boolean }>;

  const enableMutation = useMutation({
    mutationFn: (commandName: string) => commandsApi.enable(guildId, commandName),
    onSuccess: () => {
      toast.success(t('cmdEnabled'));
      queryClient.invalidateQueries({ queryKey: ['commands-disabled', guildId] });
    },
    onError: () => toast.error(t('cmdEnableError')),
  });

  const disableMutation = useMutation({
    mutationFn: (commandName: string) => commandsApi.disable(guildId, commandName),
    onSuccess: () => {
      toast.success(t('cmdDisabled'));
      queryClient.invalidateQueries({ queryKey: ['commands-disabled', guildId] });
    },
    onError: () => toast.error(t('cmdDisableError')),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => customCommandsApi.create(guildId, data),
    onSuccess: () => {
      toast.success(t('customCreated'));
      queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] });
      setShowForm(false);
      setForm({ name: '', aliases: '', response: '', embed: false, embedTitle: '', embedColor: '#5865F2', deleteInvoking: false, dmResponse: false, cooldown: 0 });
    },
    onError: () => toast.error(t('customCreateError')),
  });

  const toggleCustomMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      customCommandsApi.toggle(guildId, id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
    onError: () => toast.error(t('toggleError')),
  });

  const deleteCustomMutation = useMutation({
    mutationFn: (id: string) => customCommandsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success(t('customDeleted'));
      queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] });
    },
    onError: () => toast.error(t('customDeleteError')),
  });


  const createArMutation = useMutation({
    mutationFn: (data: object) => autoResponsesApi.create(guildId, data),
    onSuccess: () => {
      toast.success(t('arCreated'));
      queryClient.invalidateQueries({ queryKey: ['auto-responses', guildId] });
      setShowArForm(false);
      setArForm({ pattern: '', flags: 'i', response: '', embed: false, embedColor: '#5865F2', deleteMessage: false });
    },
    onError: () => toast.error(t('arCreateError')),
  });

  const toggleArMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      autoResponsesApi.toggle(guildId, id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auto-responses', guildId] }),
    onError: () => toast.error(t('arToggleError')),
  });

  const deleteArMutation = useMutation({
    mutationFn: (id: string) => autoResponsesApi.delete(guildId, id),
    onSuccess: () => {
      toast.success(t('arDeleted'));
      queryClient.invalidateQueries({ queryKey: ['auto-responses', guildId] });
    },
    onError: () => toast.error(t('arDeleteError')),
  });

  const addPermMutation = useMutation({
    mutationFn: async ({ commandName, roleIds, allow }: { commandName: string; roleIds: string[]; allow: boolean }) => {
      await Promise.all(roleIds.map((roleId) => commandPermissionsApi.set(guildId, { commandName, roleId, allow })));
    },
    onSuccess: () => {
      toast.success(t('permsSaved'));
      queryClient.invalidateQueries({ queryKey: ['command-permissions', guildId] });
      setPermForm({ commandName: '', roleIds: [], allow: true });
      setRoleDropdownOpen(false);
    },
    onError: () => toast.error(t('permsSaveError')),
  });

  const removePermMutation = useMutation({
    mutationFn: (id: string) => commandPermissionsApi.delete(guildId, id),
    onSuccess: () => {
      toast.success(t('permRemoved'));
      queryClient.invalidateQueries({ queryKey: ['command-permissions', guildId] });
    },
    onError: () => toast.error(t('permRemoveError')),
  });

  const handleArSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!arForm.pattern.trim() || !arForm.response.trim()) {
      toast.error(t('patternResponseRequired'));
      return;
    }
    createArMutation.mutate({
      pattern: arForm.pattern.trim(),
      flags: arForm.flags.trim() || 'i',
      response: arForm.response.trim(),
      embed: arForm.embed,
      embedColor: arForm.embed ? arForm.embedColor : undefined,
      deleteMessage: arForm.deleteMessage,
    });
  };

  const handleBuiltinToggle = (commandName: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) disableMutation.mutate(commandName);
    else enableMutation.mutate(commandName);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.response.trim()) {
      toast.error(t('nameResponseRequired'));
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      aliases: form.aliases.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
      response: form.response.trim(),
      embed: form.embed,
      embedTitle: form.embed && form.embedTitle.trim() ? form.embedTitle.trim() : undefined,
      embedColor: form.embed ? form.embedColor : undefined,
      deleteInvoking: form.deleteInvoking,
      dmResponse: form.dmResponse,
      cooldown: form.cooldown,
      enabled: true,
    });
  };

  const isLoading = builtinLoading || customLoading || arLoading;

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-5 bg-gray-700 rounded w-32 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(6)].map((_, j) => (
                <div key={j} className="h-12 bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Terminal className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <div className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('customCommands')}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{t('customCommandsDesc')}</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            {t('newCommand')}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreateSubmit} className="mb-5 p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
            <h3 className="text-sm font-semibold text-white">{t('createCustomCommand')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">{t('commandName')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">!</span>
                  <input
                    type="text"
                    className="input pl-6"
                    placeholder={t('commandNamePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">{t('aliases')} <span className="text-gray-600">{t('aliasesHint')}</span></label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('aliasesPlaceholder')}
                  value={form.aliases}
                  onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label">{t('response')}</label>
              <textarea
                className="input min-h-[80px] resize-y font-mono text-sm"
                placeholder={t('responsePlaceholder')}
                value={form.response}
                onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t.rich('variablesHint', { b: (c) => <span className="text-gray-400">{c}</span> })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.embed}
                onClick={() => setForm((f) => ({ ...f, embed: !f.embed }))}
                className={`toggle flex-shrink-0 ${form.embed ? 'bg-discord-blurple' : 'bg-gray-600'}`}
              >
                <span className={`toggle-thumb ${form.embed ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-300">{t('sendAsEmbed')}</span>
            </div>

            {form.embed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2 border-l-2 border-discord-blurple/40">
                <div>
                  <label className="label">{t('embedTitle')} <span className="text-gray-600">{t('optionalHint')}</span></label>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('embedTitlePlaceholder')}
                    value={form.embedTitle}
                    onChange={(e) => setForm((f) => ({ ...f, embedTitle: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{t('embedColor')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-10 h-9 rounded cursor-pointer bg-transparent border border-gray-600"
                      value={form.embedColor}
                      onChange={(e) => setForm((f) => ({ ...f, embedColor: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="input flex-1 font-mono"
                      value={form.embedColor}
                      onChange={(e) => setForm((f) => ({ ...f, embedColor: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">{t('cooldownSec')}</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  className="input"
                  value={form.cooldown}
                  onChange={(e) => setForm((f) => ({ ...f, cooldown: Math.max(0, parseInt(e.target.value) || 0) }))}
                />
              </div>
              <div className="flex flex-col gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-discord-blurple"
                    checked={form.deleteInvoking}
                    onChange={(e) => setForm((f) => ({ ...f, deleteInvoking: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-300">{t('deleteInvoking')}</span>
                </label>
              </div>
              <div className="flex flex-col gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-discord-blurple"
                    checked={form.dmResponse}
                    onChange={(e) => setForm((f) => ({ ...f, dmResponse: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-300">{t('dmResponse')}</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? t('creating') : t('createCommand')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        )}

        {customCommands.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {t('noCustom')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colCommand')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colResponse')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colOptions')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colUses')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colEnabled')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {customCommands.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-gray-200">!{cmd.name}</span>
                      {cmd.aliases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cmd.aliases.map((a) => (
                            <span key={a} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">!{a}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">{cmd.response}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cmd.embed && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">{t('optEmbed')}</span>}
                        {cmd.deleteInvoking && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">{t('optDelMsg')}</span>}
                        {cmd.dmResponse && <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">{t('optDM')}</span>}
                        {cmd.cooldown > 0 && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">{cmd.cooldown}s</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{cmd.uses.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cmd.enabled}
                        disabled={toggleCustomMutation.isPending}
                        onClick={() => toggleCustomMutation.mutate({ id: cmd.id, enabled: !cmd.enabled })}
                        className={`toggle flex-shrink-0 ${cmd.enabled ? 'bg-discord-blurple' : 'bg-gray-600'} ${toggleCustomMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`toggle-thumb ${cmd.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteCustomMutation.mutate(cmd.id)}
                        disabled={deleteCustomMutation.isPending}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        title={t('deleteCommand')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>



      <div className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Regex className="w-5 h-5 text-discord-blurple" />
            <div>
              <h2 className="text-lg font-semibold text-white">{t('autoResponses')}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{t('autoResponsesDesc')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowArForm((v) => !v)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            {t('newRule')}
          </button>
        </div>

        {showArForm && (
          <form onSubmit={handleArSubmit} className="mb-5 p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
            <h3 className="text-sm font-semibold text-white">{t('createAutoResponse')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="label">{t('regexPattern')}</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="\bhello\b"
                  value={arForm.pattern}
                  onChange={(e) => setArForm((f) => ({ ...f, pattern: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('flags')}</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="i"
                  value={arForm.flags}
                  onChange={(e) => setArForm((f) => ({ ...f, flags: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label">{t('response')}</label>
              <textarea
                className="input min-h-[70px] resize-y"
                placeholder={t('arResponsePlaceholder')}
                value={arForm.response}
                onChange={(e) => setArForm((f) => ({ ...f, response: e.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-5 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={arForm.embed}
                  onClick={() => setArForm((f) => ({ ...f, embed: !f.embed }))}
                  className={`toggle flex-shrink-0 ${arForm.embed ? 'bg-discord-blurple' : 'bg-gray-600'}`}
                >
                  <span className={`toggle-thumb ${arForm.embed ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-300">{t('sendAsEmbed')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-discord-blurple"
                  checked={arForm.deleteMessage}
                  onChange={(e) => setArForm((f) => ({ ...f, deleteMessage: e.target.checked }))}
                />
                <span className="text-sm text-gray-300">{t('deleteTriggering')}</span>
              </label>
            </div>

            {arForm.embed && (
              <div className="pl-2 border-l-2 border-discord-blurple/40">
                <label className="label">{t('embedColor')}</label>
                <div className="flex items-center gap-2 max-w-[220px]">
                  <input
                    type="color"
                    className="w-10 h-9 rounded cursor-pointer bg-transparent border border-gray-600"
                    value={arForm.embedColor}
                    onChange={(e) => setArForm((f) => ({ ...f, embedColor: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="input flex-1 font-mono"
                    value={arForm.embedColor}
                    onChange={(e) => setArForm((f) => ({ ...f, embedColor: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={createArMutation.isPending}
                className="px-4 py-1.5 rounded-md bg-discord-blurple hover:bg-discord-blurple/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createArMutation.isPending ? t('creating') : t('createRule')}
              </button>
              <button
                type="button"
                onClick={() => setShowArForm(false)}
                className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        )}

        {autoResponses.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {t('noAutoResponses')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px]">
                <thead className="bg-[var(--bg-base)]">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colPattern')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colResponse')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colOptions')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colUses')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colEnabled')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {autoResponses.map((ar) => (
                    <tr key={ar.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-200">{ar.pattern}</span>
                        <span className="ml-1.5 text-xs text-gray-600 font-mono">/{ar.flags}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-[180px] truncate">{ar.response}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ar.embed && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">{t('optEmbed')}</span>}
                          {ar.deleteMessage && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">{t('optDelMsg')}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{ar.uses.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ar.enabled}
                          disabled={toggleArMutation.isPending}
                          onClick={() => toggleArMutation.mutate({ id: ar.id, enabled: !ar.enabled })}
                          className={`toggle flex-shrink-0 ${ar.enabled ? 'bg-discord-blurple' : 'bg-gray-600'} ${toggleArMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span className={`toggle-thumb ${ar.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteArMutation.mutate(ar.id)}
                          disabled={deleteArMutation.isPending}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title={t('deleteRule')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-white">{t('builtinCommands')}</h2>
        {CATEGORIES.map((category) => {
          const categoryCommands = COMMANDS.filter((c) => c.category === category);
          return (
            <div key={category} className="card">
              <h3 className="text-base font-semibold text-white mb-4">{category}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categoryCommands.map((cmd) => {
                  const isEnabled = !disabledCommands.includes(cmd.name);
                  const isPending = enableMutation.isPending || disableMutation.isPending;
                  return (
                    <div
                      key={cmd.name}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]"
                    >
                      <span className="text-sm font-mono text-gray-200">/{cmd.name}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        disabled={isPending}
                        onClick={() => handleBuiltinToggle(cmd.name, isEnabled)}
                        className={`toggle flex-shrink-0 ${isEnabled ? 'bg-discord-blurple' : 'bg-gray-600'} ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`toggle-thumb ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-8">
        <div className="flex items-center gap-3 mb-1">
          <ShieldCheck className="w-5 h-5 text-discord-blurple" />
          <h2 className="text-lg font-semibold text-white">{t('rolePermissions')}</h2>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          {t.rich('rolePermsDesc', { b: (c) => <strong className="text-gray-300">{c}</strong> })}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            className="input flex-1 min-w-[140px]"
            value={permForm.commandName}
            onChange={(e) => setPermForm((f) => ({ ...f, commandName: e.target.value }))}
          >
            <option value="">{t('selectCommand')}</option>
            {COMMANDS.map((c) => (
              <option key={c.name} value={c.name}>/{c.name}</option>
            ))}
          </select>

          <div ref={roleDropdownRef} className="relative flex-1 min-w-[160px]">
            <button
              type="button"
              className="input w-full text-left flex items-center justify-between"
              onClick={() => setRoleDropdownOpen((v) => !v)}
            >
              <span className={permForm.roleIds.length === 0 ? 'text-gray-500' : 'text-gray-200'}>
                {permForm.roleIds.length === 0
                  ? t('selectRoles')
                  : permForm.roleIds.length === 1
                  ? (() => { const n = roles.find((r) => r.id === permForm.roleIds[0])?.name ?? permForm.roleIds[0]; return n.startsWith('@') ? n : `@${n}`; })()
                  : t('rolesSelected', { count: permForm.roleIds.length })}
              </span>
              <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {roleDropdownOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--bg-base)] border border-white/[0.08] rounded-lg shadow-xl max-h-52 overflow-y-auto">
                {roles.map((r) => {
                  const checked = permForm.roleIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        className="w-3.5 h-3.5 accent-discord-blurple flex-shrink-0"
                        onChange={() =>
                          setPermForm((f) => ({
                            ...f,
                            roleIds: checked
                              ? f.roleIds.filter((id) => id !== r.id)
                              : [...f.roleIds, r.id],
                          }))
                        }
                      />
                      <span className="text-sm text-gray-300 truncate">{r.name.startsWith('@') ? r.name : `@${r.name}`}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <select
            className="input w-28"
            value={permForm.allow ? 'allow' : 'deny'}
            onChange={(e) => setPermForm((f) => ({ ...f, allow: e.target.value === 'allow' }))}
          >
            <option value="allow">{t('allow')}</option>
            <option value="deny">{t('deny')}</option>
          </select>
          <button
            className="btn-primary px-4"
            disabled={!permForm.commandName || permForm.roleIds.length === 0 || addPermMutation.isPending}
            onClick={() => addPermMutation.mutate(permForm)}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {cmdPerms.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">{t('noPerms')}</p>

        ) : (
          <div className="space-y-1.5">
            {/* Group by commandName+allow so all roles show on one line */}
            {Object.values(
              cmdPerms.reduce<Record<string, { key: string; commandName: string; allow: boolean; entries: typeof cmdPerms }>>((acc, p) => {
                const key = `${p.commandName}:${p.allow}`;
                if (!acc[key]) acc[key] = { key, commandName: p.commandName, allow: p.allow, entries: [] };
                acc[key]!.entries.push(p);
                return acc;
              }, {})
            ).map((group) => (
              <div
                key={group.key}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-base)] border border-white/[0.04]"
              >
                <span className="text-xs font-mono text-gray-300 w-32 flex-shrink-0 truncate">/{group.commandName}</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {group.entries.map((p) => {
                    const rawName = roles.find((r) => r.id === p.roleId)?.name ?? p.roleId;
                    const roleName = rawName.startsWith('@') ? rawName : `@${rawName}`;
                    return (
                      <span key={p.id} className="flex items-center gap-1 text-[11px] bg-white/[0.06] text-gray-300 px-2 py-0.5 rounded-full">
                        {roleName}
                        <button
                          onClick={() => removePermMutation.mutate(p.id)}
                          disabled={removePermMutation.isPending}
                          className="text-gray-600 hover:text-red-400 transition-colors ml-0.5"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${group.allow ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                  {group.allow ? t('allowLower') : t('denyLower')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
