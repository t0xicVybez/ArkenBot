'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { guildsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { ClipboardList, Plus, Trash2, ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ApplicationField = {
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  placeholder?: string;
};

type ApplicationForm = {
  id: string;
  name: string;
  description: string;
  fields: ApplicationField[];
  reviewChannelId: string;
  acceptRoleId?: string;
  enabled: boolean;
  createdAt: string;
};

type ApplicationSubmission = {
  id: string;
  formId: string;
  userId: string;
  userTag: string;
  answers: Record<string, string>;
  status: 'pending' | 'accepted' | 'denied';
  reviewerTag?: string;
  reviewNote?: string;
  submittedAt: string;
};

const applicationsApi = {
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
  reviewSubmission: (guildId: string, submissionId: string, data: { action: 'accept' | 'deny'; note?: string }) =>
    api.post(`/guilds/${guildId}/applications/submissions/${submissionId}/review`, data),
};

type Tab = 'forms' | 'submissions';

export default function ApplicationsPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('applicationsPage');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('forms');

  // Form creation state
  const [newFormName, setNewFormName] = useState('');
  const [newFormDesc, setNewFormDesc] = useState('');
  const [newFormChannel, setNewFormChannel] = useState('');
  const [newFormRole, setNewFormRole] = useState('');

  // Expanded forms state
  const [expandedForms, setExpandedForms] = useState<Set<string>>(new Set());

  // Add field state per form
  const [addFieldFormId, setAddFieldFormId] = useState<string | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldStyle, setNewFieldStyle] = useState<'short' | 'paragraph'>('short');
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');

  // Submissions filter state
  const [filterFormId, setFilterFormId] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [pendingReview, setPendingReview] = useState<{ id: string; action: 'accept' | 'deny' } | null>(null);

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });
  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });
  const { data: formsRes, isLoading: formsLoading } = useQuery({
    queryKey: ['application-forms', guildId],
    queryFn: () => applicationsApi.listForms(guildId),
  });
  const { data: submissionsRes, isLoading: submissionsLoading } = useQuery({
    queryKey: ['application-submissions', guildId, filterFormId, filterStatus],
    queryFn: () =>
      applicationsApi.listSubmissions(guildId, {
        ...(filterFormId ? { formId: filterFormId } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      }),
    enabled: tab === 'submissions',
  });

  const allChannels = (channelsRes?.data as { data?: Array<{ id: string; name: string; type: number }> })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);
  const roles = (rolesRes?.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
  const forms: ApplicationForm[] = (formsRes?.data as { data?: ApplicationForm[] })?.data ?? [];
  const submissions: ApplicationSubmission[] = (submissionsRes?.data as { data?: ApplicationSubmission[] })?.data ?? [];

  const createFormMutation = useMutation({
    mutationFn: (data: object) => applicationsApi.createForm(guildId, data),
    onSuccess: () => {
      toast.success(t('formCreated'));
      queryClient.invalidateQueries({ queryKey: ['application-forms', guildId] });
      setNewFormName('');
      setNewFormDesc('');
      setNewFormChannel('');
      setNewFormRole('');
    },
    onError: () => toast.error(t('createFormError')),
  });

  const updateFormMutation = useMutation({
    mutationFn: ({ formId, data }: { formId: string; data: object }) =>
      applicationsApi.updateForm(guildId, formId, data),
    onSuccess: () => {
      toast.success(t('formUpdated'));
      queryClient.invalidateQueries({ queryKey: ['application-forms', guildId] });
    },
    onError: () => toast.error(t('updateFormError')),
  });

  const deleteFormMutation = useMutation({
    mutationFn: (formId: string) => applicationsApi.deleteForm(guildId, formId),
    onSuccess: () => {
      toast.success(t('formDeleted'));
      queryClient.invalidateQueries({ queryKey: ['application-forms', guildId] });
    },
    onError: () => toast.error(t('deleteFormError')),
  });

  const addFieldMutation = useMutation({
    mutationFn: ({ formId, data }: { formId: string; data: object }) =>
      applicationsApi.addField(guildId, formId, data),
    onSuccess: () => {
      toast.success(t('fieldAdded'));
      queryClient.invalidateQueries({ queryKey: ['application-forms', guildId] });
      setAddFieldFormId(null);
      setNewFieldLabel('');
      setNewFieldStyle('short');
      setNewFieldRequired(true);
      setNewFieldPlaceholder('');
    },
    onError: () => toast.error(t('addFieldError')),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: ({ formId, fieldId }: { formId: string; fieldId: string }) =>
      applicationsApi.deleteField(guildId, formId, fieldId),
    onSuccess: () => {
      toast.success(t('fieldRemoved'));
      queryClient.invalidateQueries({ queryKey: ['application-forms', guildId] });
    },
    onError: () => toast.error(t('removeFieldError')),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'accept' | 'deny'; note?: string }) =>
      applicationsApi.reviewSubmission(guildId, id, { action, note }),
    onSuccess: () => {
      toast.success(t('submissionReviewed'));
      setPendingReview(null);
      queryClient.invalidateQueries({ queryKey: ['application-submissions', guildId] });
    },
    onError: () => toast.error(t('reviewError')),
  });

  const toggleForm = (formId: string) => {
    setExpandedForms((prev) => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      return next;
    });
  };

  const toggleSubmission = (subId: string) => {
    setExpandedSubmissions((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const statusColors: Record<string, string> = {
    pending: 'badge-warning',
    accepted: 'badge-success',
    denied: 'badge-danger',
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><ClipboardList className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {(['forms', 'submissions'] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabKey
                ? 'border-discord-blurple text-discord-blurple'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t(`tab_${tabKey}`)}
          </button>
        ))}
      </div>

      {/* ── Forms Tab ── */}
      {tab === 'forms' && (
        <div className="space-y-4">
          {/* Create form */}
          <div className="card">
            <h3 className="text-base font-semibold text-white mb-4">{t('createNewForm')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('formName')}</label>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('formNamePlaceholder')}
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">{t('reviewChannel')}</label>
                  <select className="input" value={newFormChannel} onChange={(e) => setNewFormChannel(e.target.value)}>
                    <option value="">{t('selectChannel')}</option>
                    {textChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>#{ch.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{t('description')}</label>
                <textarea
                  className="input min-h-[70px] resize-none"
                  placeholder={t('descriptionPlaceholder')}
                  value={newFormDesc}
                  onChange={(e) => setNewFormDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t('acceptRole')}</label>
                <select className="input" value={newFormRole} onChange={(e) => setNewFormRole(e.target.value)}>
                  <option value="">{t('none')}</option>
                  {roles.filter((r) => r.name !== '@everyone').map((r) => (
                    <option key={r.id} value={r.id}>@{r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{t('acceptRoleHelp')}</p>
              </div>
              <button
                onClick={() => {
                  if (!newFormName.trim() || !newFormChannel) {
                    toast.error(t('nameChannelRequired'));
                    return;
                  }
                  createFormMutation.mutate({
                    name: newFormName.trim(),
                    description: newFormDesc.trim(),
                    reviewChannelId: newFormChannel,
                    ...(newFormRole ? { acceptRoleId: newFormRole } : {}),
                  });
                }}
                disabled={createFormMutation.isPending}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {createFormMutation.isPending ? t('creating') : t('createForm')}
              </button>
            </div>
          </div>

          {/* Existing forms */}
          {formsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="card h-20 animate-pulse bg-gray-700" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <div className="card text-center py-10 text-gray-500">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t('noForms')}</p>
            </div>
          ) : (
            forms.map((form) => {
              const expanded = expandedForms.has(form.id);
              const reviewCh = textChannels.find((c) => c.id === form.reviewChannelId);
              const acceptRole = roles.find((r) => r.id === form.acceptRoleId);
              return (
                <div key={form.id} className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <button
                      onClick={() => toggleForm(form.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-white">{form.name}</p>
                        <p className="text-xs text-gray-500">
                          {t('fieldCount', { count: form.fields.length })} ·{' '}
                          {reviewCh ? `#${reviewCh.name}` : form.reviewChannelId}
                          {acceptRole ? t('acceptSuffix', { role: acceptRole.name }) : ''}
                        </p>
                      </div>
                    </button>
                    <span className={`badge ${form.enabled ? 'badge-success' : 'badge-warning'}`}>
                      {form.enabled ? t('badgeOpen') : t('badgeClosed')}
                    </span>
                    <button
                      onClick={() => updateFormMutation.mutate({ formId: form.id, data: { enabled: !form.enabled } })}
                      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-gray-600 hover:border-gray-400"
                    >
                      {form.enabled ? t('btnClose') : t('btnOpen')}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t('confirmDeleteForm', { name: form.name }))) {
                          deleteFormMutation.mutate(form.id);
                        }
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title={t('deleteForm')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-[var(--border-subtle)] px-4 py-3 space-y-3">
                      {form.fields.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('noFields')}</p>
                      ) : (
                        <div className="space-y-2">
                          {form.fields.map((field) => (
                            <div key={field.id} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2">
                              <div>
                                <p className="text-sm text-gray-200">{field.label}</p>
                                <p className="text-xs text-gray-500">
                                  {t(`style_${field.style}`)} · {field.required ? t('required') : t('optional')}
                                  {field.placeholder ? t('phSuffix', { ph: field.placeholder }) : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => deleteFieldMutation.mutate({ formId: form.id, fieldId: field.id })}
                                className="text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {addFieldFormId === form.id ? (
                        <div className="border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase">{t('addFieldTitle')}</p>
                          <input
                            type="text"
                            className="input"
                            placeholder={t('fieldLabelPlaceholder')}
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                          />
                          <div className="flex gap-3 flex-wrap">
                            <div>
                              <label className="label">{t('styleLabel')}</label>
                              <select
                                className="input"
                                value={newFieldStyle}
                                onChange={(e) => setNewFieldStyle(e.target.value as 'short' | 'paragraph')}
                              >
                                <option value="short">{t('style_short')}</option>
                                <option value="paragraph">{t('style_paragraph')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="label">{t('requiredLabel')}</label>
                              <select
                                className="input"
                                value={newFieldRequired ? 'yes' : 'no'}
                                onChange={(e) => setNewFieldRequired(e.target.value === 'yes')}
                              >
                                <option value="yes">{t('yes')}</option>
                                <option value="no">{t('no')}</option>
                              </select>
                            </div>
                          </div>
                          <input
                            type="text"
                            className="input"
                            placeholder={t('phPlaceholder')}
                            value={newFieldPlaceholder}
                            onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (!newFieldLabel.trim()) {
                                  toast.error(t('fieldLabelRequired'));
                                  return;
                                }
                                addFieldMutation.mutate({
                                  formId: form.id,
                                  data: {
                                    label: newFieldLabel.trim(),
                                    style: newFieldStyle,
                                    required: newFieldRequired,
                                    ...(newFieldPlaceholder.trim() ? { placeholder: newFieldPlaceholder.trim() } : {}),
                                  },
                                });
                              }}
                              disabled={addFieldMutation.isPending}
                              className="btn-primary text-sm py-1.5"
                            >
                              {addFieldMutation.isPending ? t('adding') : t('addField')}
                            </button>
                            <button
                              onClick={() => setAddFieldFormId(null)}
                              className="btn-secondary text-sm py-1.5"
                            >
                              {t('cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setAddFieldFormId(form.id);
                            setNewFieldLabel('');
                            setNewFieldStyle('short');
                            setNewFieldRequired(true);
                            setNewFieldPlaceholder('');
                          }}
                          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          {t('addField')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Submissions Tab ── */}
      {tab === 'submissions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card flex flex-wrap gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="label">{t('filterByForm')}</label>
              <select className="input" value={filterFormId} onChange={(e) => setFilterFormId(e.target.value)}>
                <option value="">{t('allForms')}</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('statusLabel')}</label>
              <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">{t('all')}</option>
                <option value="pending">{t('status_pending')}</option>
                <option value="accepted">{t('status_accepted')}</option>
                <option value="denied">{t('status_denied')}</option>
              </select>
            </div>
          </div>

          {submissionsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card h-16 animate-pulse bg-gray-700" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="card text-center py-10 text-gray-500">
              <p>{t('noSubmissions')}</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="bg-[var(--bg-base)]">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colSubmittedBy')}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colForm')}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colDate')}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">{t('colStatus')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {submissions.map((sub) => {
                      const form = forms.find((f) => f.id === sub.formId);
                      const isExpanded = expandedSubmissions.has(sub.id);
                      const isPendingReview = pendingReview?.id === sub.id;
                      return (
                        <>
                          <tr
                            key={sub.id}
                            className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => toggleSubmission(sub.id)}
                          >
                            <td className="px-4 py-3 text-sm text-gray-200">{sub.userTag}</td>
                            <td className="px-4 py-3 text-sm text-gray-400">{form?.name ?? sub.formId}</td>
                            <td className="px-4 py-3 text-sm text-gray-400">
                              {new Date(sub.submittedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`badge ${statusColors[sub.status] ?? 'badge-info'}`}>
                                {t(`status_${sub.status}`)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400 inline" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${sub.id}-expanded`}>
                              <td colSpan={5} className="px-4 pb-4 pt-2 bg-discord-dark-bg/20">
                                <div className="space-y-3">
                                  {Object.entries(sub.answers).map(([label, answer]) => (
                                    <div key={label}>
                                      <p className="text-xs font-semibold text-gray-400 mb-0.5">{label}</p>
                                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{answer}</p>
                                    </div>
                                  ))}
                                  {sub.reviewNote && (
                                    <div className="border-t border-[var(--border-subtle)] pt-2">
                                      <p className="text-xs text-gray-500">
                                        {t.rich('reviewedBy', { reviewer: sub.reviewerTag ?? '', note: sub.reviewNote, b: (c) => <span className="text-gray-400">{c}</span> })}
                                      </p>
                                    </div>
                                  )}
                                  {sub.status === 'pending' && !isPendingReview && (
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setPendingReview({ id: sub.id, action: 'accept' }); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600/20 text-green-400 hover:bg-green-600/30 text-sm transition-colors"
                                      >
                                        <Check className="w-4 h-4" />
                                        {t('accept')}
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setPendingReview({ id: sub.id, action: 'deny' }); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm transition-colors"
                                      >
                                        <X className="w-4 h-4" />
                                        {t('deny')}
                                      </button>
                                    </div>
                                  )}
                                  {isPendingReview && (
                                    <div className="border border-[var(--border-subtle)] rounded-lg p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                                      <p className="text-xs font-semibold text-gray-400 uppercase">
                                        {t('reviewNoteTitle', { action: pendingReview.action === 'accept' ? t('accept') : t('deny') })}
                                      </p>
                                      <textarea
                                        className="input min-h-[60px] resize-none"
                                        placeholder={t('reviewNotePlaceholder')}
                                        value={reviewNotes[sub.id] ?? ''}
                                        onChange={(e) => setReviewNotes((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => {
                                            reviewMutation.mutate({
                                              id: sub.id,
                                              action: pendingReview.action,
                                              note: reviewNotes[sub.id] || undefined,
                                            });
                                          }}
                                          disabled={reviewMutation.isPending}
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                                            pendingReview.action === 'accept'
                                              ? 'bg-green-600 hover:bg-green-700 text-white'
                                              : 'bg-red-600 hover:bg-red-700 text-white'
                                          }`}
                                        >
                                          {reviewMutation.isPending
                                            ? t('submitting')
                                            : pendingReview.action === 'accept'
                                            ? t('confirmAccept')
                                            : t('confirmDeny')}
                                        </button>
                                        <button
                                          onClick={() => setPendingReview(null)}
                                          className="btn-secondary text-sm py-1.5"
                                        >
                                          {t('cancel')}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
