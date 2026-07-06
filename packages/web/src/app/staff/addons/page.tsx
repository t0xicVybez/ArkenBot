'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addonsApi } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Puzzle, Plus } from 'lucide-react';

export default function StaffAddonsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    version: '1.0.0',
    description: '',
    author: '',
    homepage: '',
  });

  const { data: addonsRes } = useQuery({
    queryKey: ['addons-all'],
    queryFn: () => addonsApi.listAll(true),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => addonsApi.register(data),
    onSuccess: () => {
      toast.success('Addon registered!');
      queryClient.invalidateQueries({ queryKey: ['addons-all'] });
      setShowForm(false);
    },
    onError: () => toast.error('Failed to register addon.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => addonsApi.update(id, data),
    onSuccess: () => {
      toast.success('Addon updated!');
      queryClient.invalidateQueries({ queryKey: ['addons-all'] });
    },
    onError: () => toast.error('Failed to update addon.'),
  });

  const addons = (addonsRes?.data?.data ?? []) as Array<{
    id: string; name: string; displayName: string; description: string; version: string; author: string; enabled: boolean; verified: boolean;
  }>;

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><Puzzle className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Addons Registry</h1>
          <div className="page-head-desc">Publish and maintain addon packages.</div>
        </div>
        <div className="page-head-actions">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Register Addon
        </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Register New Addon</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Package Name (unique)</label>
              <input className="input" placeholder="my-addon" value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Display Name</label>
              <input className="input" placeholder="My Addon" value={formData.displayName} onChange={(e) => setFormData(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Version</label>
              <input className="input" placeholder="1.0.0" value={formData.version} onChange={(e) => setFormData(f => ({ ...f, version: e.target.value }))} />
            </div>
            <div>
              <label className="label">Author</label>
              <input className="input" placeholder="Author Name" value={formData.author} onChange={(e) => setFormData(f => ({ ...f, author: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <input className="input" placeholder="Short description..." value={formData.description} onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => createMutation.mutate({ ...formData, manifest: { commands: [], events: [], settings: [] } })}
              className="btn-primary"
            >
              Register
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {addons.map((addon) => (
          <div key={addon.id} className={`card ${!addon.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-white font-semibold">{addon.displayName}</h3>
                <p className="text-xs text-gray-500 font-mono">{addon.name}@{addon.version}</p>
              </div>
              <div className="flex gap-1">
                <span className={addon.enabled ? 'badge-success' : 'badge-danger'}>{addon.enabled ? 'Enabled' : 'Disabled'}</span>
                {addon.verified && <span className="badge-info">✓</span>}
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-3 line-clamp-2">{addon.description}</p>
            <p className="text-gray-500 text-xs mb-3">by {addon.author}</p>
            <div className="flex gap-2">
              <button
                onClick={() => updateMutation.mutate({ id: addon.id, data: { enabled: !addon.enabled } })}
                className={addon.enabled ? 'btn-danger text-xs py-1' : 'btn-success text-xs py-1'}
              >
                {addon.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => updateMutation.mutate({ id: addon.id, data: { verified: !addon.verified } })}
                className="btn-secondary text-xs py-1"
              >
                {addon.verified ? 'Unverify' : 'Verify'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
