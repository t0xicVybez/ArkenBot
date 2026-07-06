'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Smile, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle, Clock } from 'lucide-react';

interface PanelRole {
  id: string;
  emoji: string;
  roleId: string;
  type: string;
}

interface Panel {
  id: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  roles: PanelRole[];
}

interface GuildRole { id: string; name: string }
interface GuildChannel { id: string; name: string; type: number }

const emptyPanelForm = { channelId: '', title: '🎭 Self-Roles', description: 'React below to assign yourself a role.' };
const emptyRoleForm = { emoji: '', roleId: '', type: 'toggle' };

export default function ReactionRolesPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [panelForm, setPanelForm] = useState(emptyPanelForm);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const [roleForms, setRoleForms] = useState<Record<string, typeof emptyRoleForm>>({});

  const { data: panelsRes, isLoading } = useQuery({
    queryKey: ['reaction-role-panels', guildId],
    queryFn: () => settingsApi.getPanels(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const createPanel = useMutation({
    mutationFn: () => settingsApi.createPanel(guildId, panelForm),
    onSuccess: (res) => {
      toast.success('Panel created! The bot is deploying the message…');
      setPanelForm(emptyPanelForm);
      setShowNewPanel(false);
      const newPanel = (res as { data: { data: Panel } }).data?.data;
      if (newPanel) setExpandedPanels((s) => new Set([...s, newPanel.id]));
      queryClient.invalidateQueries({ queryKey: ['reaction-role-panels', guildId] });
    },
    onError: () => toast.error('Failed to create panel.'),
  });

  const updatePanel = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: { title?: string; description?: string } }) =>
      settingsApi.updatePanel(guildId, panelId, data),
    onSuccess: () => {
      toast.success('Panel updated!');
      queryClient.invalidateQueries({ queryKey: ['reaction-role-panels', guildId] });
    },
    onError: () => toast.error('Failed to update panel.'),
  });

  const deletePanel = useMutation({
    mutationFn: (panelId: string) => settingsApi.deletePanel(guildId, panelId),
    onSuccess: () => {
      toast.success('Panel deleted.');
      queryClient.invalidateQueries({ queryKey: ['reaction-role-panels', guildId] });
    },
    onError: () => toast.error('Failed to delete panel.'),
  });

  const addRole = useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: typeof emptyRoleForm }) =>
      settingsApi.addPanelRole(guildId, panelId, data),
    onSuccess: (_, vars) => {
      toast.success('Role added! Embed is updating…');
      setRoleForms((f) => ({ ...f, [vars.panelId]: emptyRoleForm }));
      queryClient.invalidateQueries({ queryKey: ['reaction-role-panels', guildId] });
    },
    onError: () => toast.error('Failed to add role.'),
  });

  const removeRole = useMutation({
    mutationFn: ({ panelId, roleId }: { panelId: string; roleId: string }) =>
      settingsApi.removePanelRole(guildId, panelId, roleId),
    onSuccess: () => {
      toast.success('Role removed. Embed is updating…');
      queryClient.invalidateQueries({ queryKey: ['reaction-role-panels', guildId] });
    },
    onError: () => toast.error('Failed to remove role.'),
  });

  const panels = (panelsRes?.data?.data ?? []) as Panel[];
  const roles = (rolesRes?.data?.data ?? []) as GuildRole[];
  const channels = (channelsRes?.data?.data ?? []) as GuildChannel[];
  const textChannels = channels.filter((c) => c.type === 0);

  const getRoleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const getChannelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  const togglePanel = (id: string) =>
    setExpandedPanels((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="page-head">
        <div className="page-head-icon"><Smile className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Reaction Roles</h1>
          <div className="page-head-desc">Members grab roles by reacting to a panel.</div>
        </div>
        <div className="page-head-actions">
          <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowNewPanel((v) => !v)}
        >
          <Plus className="w-4 h-4" />
          New Panel
        </button>
        </div>
      </div>

      {showNewPanel && (
        <SettingsSection
          title="New Panel"
          description="The bot will post an embed in the chosen channel and add emoji reactions automatically."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Channel</label>
              <select
                className="input"
                value={panelForm.channelId}
                onChange={(e) => setPanelForm((f) => ({ ...f, channelId: e.target.value }))}
              >
                <option value="">Select a channel</option>
                {textChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={panelForm.title}
                onChange={(e) => setPanelForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[60px] resize-y"
              value={panelForm.description}
              onChange={(e) => setPanelForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!panelForm.channelId || createPanel.isPending}
              onClick={() => createPanel.mutate()}
            >
              {createPanel.isPending ? 'Creating…' : 'Create & Deploy'}
            </button>
            <button className="btn-secondary" onClick={() => setShowNewPanel(false)}>
              Cancel
            </button>
          </div>
        </SettingsSection>
      )}

      {panels.length === 0 && !showNewPanel && (
        <p className="text-gray-500 text-sm mt-4">
          No panels yet. Click <strong className="text-gray-300">New Panel</strong> to get started.
        </p>
      )}

      <div className="space-y-4 mt-2">
        {panels.map((panel) => {
          const expanded = expandedPanels.has(panel.id);
          const roleForm = roleForms[panel.id] ?? emptyRoleForm;
          const isFormValid = roleForm.emoji.trim() && roleForm.roleId;

          return (
            <div key={panel.id} className="card border border-[var(--border-subtle)]">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => togglePanel(panel.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {panel.messageId ? (
                    <span title="Deployed"><CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" /></span>
                  ) : (
                    <span title="Pending deployment"><Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" /></span>
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-semibold truncate">{panel.title}</p>
                    <p className="text-gray-400 text-xs">
                      #{getChannelName(panel.channelId)} •{' '}
                      {panel.roles.length} role{panel.roles.length !== 1 ? 's' : ''}
                      {!panel.messageId && ' • pending deployment'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    className="text-red-400 hover:text-red-300 p-1 transition-colors"
                    onClick={(e) => { e.stopPropagation(); deletePanel.mutate(panel.id); }}
                    title="Delete panel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Title</label>
                      <input
                        className="input"
                        defaultValue={panel.title}
                        onBlur={(e) => {
                          if (e.target.value !== panel.title)
                            updatePanel.mutate({ panelId: panel.id, data: { title: e.target.value } });
                        }}
                      />
                    </div>
                    <div>
                      <label className="label">Description</label>
                      <input
                        className="input"
                        defaultValue={panel.description}
                        onBlur={(e) => {
                          if (e.target.value !== panel.description)
                            updatePanel.mutate({ panelId: panel.id, data: { description: e.target.value } });
                        }}
                      />
                    </div>
                  </div>

                  {panel.roles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Roles on this panel</p>
                      {panel.roles.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between bg-[var(--bg-base)] rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl leading-none">{r.emoji}</span>
                            <div>
                              <p className="text-white text-sm font-medium">@{getRoleName(r.roleId)}</p>
                              <p className="text-gray-500 text-xs">{r.type}</p>
                            </div>
                          </div>
                          <button
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            onClick={() => removeRole.mutate({ panelId: panel.id, roleId: r.id })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Add a role</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Emoji</label>
                        <input
                          className="input"
                          placeholder="e.g. ✅"
                          value={roleForm.emoji}
                          onChange={(e) =>
                            setRoleForms((f) => ({ ...f, [panel.id]: { ...roleForm, emoji: e.target.value } }))
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Role</label>
                        <select
                          className="input"
                          value={roleForm.roleId}
                          onChange={(e) =>
                            setRoleForms((f) => ({ ...f, [panel.id]: { ...roleForm, roleId: e.target.value } }))
                          }
                        >
                          <option value="">Select a role</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Behaviour</label>
                        <select
                          className="input"
                          value={roleForm.type}
                          onChange={(e) =>
                            setRoleForms((f) => ({ ...f, [panel.id]: { ...roleForm, type: e.target.value } }))
                          }
                        >
                          <option value="toggle">Toggle (add + remove)</option>
                          <option value="add">Add only</option>
                          <option value="remove">Remove only</option>
                        </select>
                      </div>
                    </div>
                    <button
                      className="btn-primary mt-3 flex items-center gap-2"
                      disabled={!isFormValid || addRole.isPending}
                      onClick={() => addRole.mutate({ panelId: panel.id, data: roleForm })}
                    >
                      <Plus className="w-4 h-4" />
                      {addRole.isPending ? 'Adding…' : 'Add Role'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
