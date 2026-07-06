'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { selfRolesApi, guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { UserCheck, Plus, Trash2 } from 'lucide-react';

interface SelfRole { id: string; roleId: string; name: string }
interface GuildRole { id: string; name: string }

export default function SelfRolesPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ roleId: '', name: '' });

  const { data: selfRolesRes, isLoading } = useQuery({
    queryKey: ['self-roles', guildId],
    queryFn: () => selfRolesApi.list(guildId),
  });

  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });

  const selfRoles = (selfRolesRes?.data?.data ?? []) as SelfRole[];
  const guildRoles = (rolesRes?.data?.data ?? []) as GuildRole[];

  const addRole = useMutation({
    mutationFn: () => selfRolesApi.create(guildId, { roleId: form.roleId, name: form.name }),
    onSuccess: () => {
      toast.success('Role added to self-assignable list.');
      setForm({ roleId: '', name: '' });
      queryClient.invalidateQueries({ queryKey: ['self-roles', guildId] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Failed to add role.';
      toast.error(msg);
    },
  });

  const removeRole = useMutation({
    mutationFn: (id: string) => selfRolesApi.delete(guildId, id),
    onSuccess: () => {
      toast.success('Role removed.');
      queryClient.invalidateQueries({ queryKey: ['self-roles', guildId] });
    },
    onError: () => toast.error('Failed to remove role.'),
  });

  const handleRoleSelect = (roleId: string) => {
    const roleName = guildRoles.find((r) => r.id === roleId)?.name ?? '';
    setForm({ roleId, name: roleName.toLowerCase().replace(/\s+/g, '-') });
  };

  const isFormValid = form.roleId && form.name.trim();

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-700" />)}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl space-y-6">
      <div className="page-head">
        <div className="page-head-icon"><UserCheck className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Self-Assignable Roles</h1>
          <div className="page-head-desc">Members can claim roles themselves with <code className="bg-gray-700 px-1 rounded text-xs">/selfassignrole</code> and drop them with{' '}
            <code className="bg-gray-700 px-1 rounded text-xs">/selfremoverole</code>.</div>
        </div>
      </div>

      <SettingsSection
        title="Add a Role"
        description="Select a server role and give it a short name that members will type in the command."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.roleId}
              onChange={(e) => handleRoleSelect(e.target.value)}
            >
              <option value="">Select a role</option>
              {guildRoles
                .filter((r) => !selfRoles.some((sr) => sr.roleId === r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Command name</label>
            <input
              className="input"
              placeholder="e.g. fighter"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
            />
            <p className="text-xs text-gray-500 mt-1">Members will run <code className="bg-gray-700 px-1 rounded">/selfassignrole {form.name || 'name'}</code></p>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2 mt-2"
          disabled={!isFormValid || addRole.isPending}
          onClick={() => addRole.mutate()}
        >
          <Plus className="w-4 h-4" />
          {addRole.isPending ? 'Adding…' : 'Add Role'}
        </button>
      </SettingsSection>

      {selfRoles.length > 0 && (
        <SettingsSection title="Current Self-Assignable Roles" description="Members can claim any of these roles at any time.">
          <div className="space-y-2">
            {selfRoles.map((sr) => {
              const roleName = guildRoles.find((r) => r.id === sr.roleId)?.name;
              return (
                <div
                  key={sr.id}
                  className="flex items-center justify-between bg-[var(--bg-base)] rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-white text-sm font-medium">
                      <code className="bg-gray-700 px-1.5 py-0.5 rounded text-xs mr-2">{sr.name}</code>
                      {roleName ? (
                        <span className="text-gray-300">@{roleName}</span>
                      ) : (
                        <span className="text-red-400 line-through text-xs">{sr.roleId} (deleted)</span>
                      )}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">/selfassignrole {sr.name}</p>
                  </div>
                  <button
                    className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    onClick={() => removeRole.mutate(sr.id)}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      )}

      {selfRoles.length === 0 && (
        <p className="text-gray-500 text-sm">No self-assignable roles yet. Add one above.</p>
      )}
    </div>
  );
}
