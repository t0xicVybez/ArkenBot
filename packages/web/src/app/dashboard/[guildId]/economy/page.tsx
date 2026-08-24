'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Trash2, Plus } from 'lucide-react';
import { guildsApi } from '@/lib/api';
import { SettingsSection } from '@/components/SettingsSection';
import { Toggle } from '@/components/Toggle';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';

type EconomyConfig = {
  enabled?: boolean;
  currencyName?: string;
  currencySymbol?: string;
  startingBalance?: number;
  dailyAmount?: number;
  dailyStreakBonus?: number;
  workMin?: number;
  workMax?: number;
  workCooldown?: number;
  robEnabled?: boolean;
  robCooldown?: number;
  robSuccessRate?: number;
  robMaxPercent?: number;
  robMinBalance?: number;
  robFinePercent?: number;
  gamblingEnabled?: boolean;
  maxBet?: number;
  levelUpReward?: number;
  bankInterestPct?: number;
  bankInterestCap?: number;
};

type IncomeRole = { id: string; roleId: string; amount: number };

type ShopItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  roleId?: string | null;
  stock: number;
  enabled: boolean;
};

type Role = { id: string; name: string; managed?: boolean };

const economyApi = {
  getConfig: (guildId: string) => api.get(`/guilds/${guildId}/economy/config`),
  updateConfig: (guildId: string, data: object) => api.patch(`/guilds/${guildId}/economy/config`, data),
  listShop: (guildId: string) => api.get(`/guilds/${guildId}/economy/shop`),
  addItem: (guildId: string, data: object) => api.post(`/guilds/${guildId}/economy/shop`, data),
  deleteItem: (guildId: string, itemId: string) => api.delete(`/guilds/${guildId}/economy/shop/${itemId}`),
  listIncome: (guildId: string) => api.get(`/guilds/${guildId}/economy/income-roles`),
  putIncome: (guildId: string, data: object) => api.put(`/guilds/${guildId}/economy/income-roles`, data),
  deleteIncome: (guildId: string, roleId: string) => api.delete(`/guilds/${guildId}/economy/income-roles/${roleId}`),
};

export default function EconomyPage() {
  const { guildId } = useParams() as { guildId: string };
  const t = useTranslations('economyPage');
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<EconomyConfig>({});
  const [newItem, setNewItem] = useState<{ name: string; price: string; description: string; roleId: string; stock: string }>({
    name: '', price: '', description: '', roleId: '', stock: '',
  });
  const [newIncome, setNewIncome] = useState<{ roleId: string; amount: string }>({ roleId: '', amount: '' });

  const { data: configRes, isLoading } = useQuery({
    queryKey: ['economy-config', guildId],
    queryFn: () => economyApi.getConfig(guildId),
  });
  const { data: shopRes } = useQuery({
    queryKey: ['economy-shop', guildId],
    queryFn: () => economyApi.listShop(guildId),
  });
  const { data: rolesRes } = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => guildsApi.roles(guildId),
  });
  const { data: incomeRes } = useQuery({
    queryKey: ['economy-income', guildId],
    queryFn: () => economyApi.listIncome(guildId),
  });

  useEffect(() => {
    const data = (configRes?.data as { data?: EconomyConfig })?.data;
    if (data) setConfig(data);
  }, [configRes]);

  const shopItems: ShopItem[] = (shopRes?.data as { data?: ShopItem[] })?.data ?? [];
  const incomeRoles: IncomeRole[] = (incomeRes?.data as { data?: IncomeRole[] })?.data ?? [];
  const roles = ((rolesRes?.data as { data?: Role[] })?.data ?? []).filter((r) => r.name !== '@everyone' && !r.managed);

  const configMutation = useMutation({
    mutationFn: (data: Partial<EconomyConfig>) => economyApi.updateConfig(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['economy-config', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });

  const addMutation = useMutation({
    mutationFn: (data: object) => economyApi.addItem(guildId, data),
    onSuccess: () => {
      toast.success(t('itemAdded'));
      setNewItem({ name: '', price: '', description: '', roleId: '', stock: '' });
      queryClient.invalidateQueries({ queryKey: ['economy-shop', guildId] });
    },
    onError: () => toast.error(t('itemError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => economyApi.deleteItem(guildId, itemId),
    onSuccess: () => {
      toast.success(t('itemDeleted'));
      queryClient.invalidateQueries({ queryKey: ['economy-shop', guildId] });
    },
    onError: () => toast.error(t('itemError')),
  });

  const putIncomeMutation = useMutation({
    mutationFn: (data: { roleId: string; amount: number }) => economyApi.putIncome(guildId, data),
    onSuccess: () => {
      toast.success(t('saved'));
      setNewIncome({ roleId: '', amount: '' });
      queryClient.invalidateQueries({ queryKey: ['economy-income', guildId] });
    },
    onError: () => toast.error(t('saveError')),
  });
  const deleteIncomeMutation = useMutation({
    mutationFn: (roleId: string) => economyApi.deleteIncome(guildId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['economy-income', guildId] }),
    onError: () => toast.error(t('saveError')),
  });

  const handleAddIncome = () => {
    const amount = parseInt(newIncome.amount || '0', 10);
    if (!newIncome.roleId || !amount || amount < 1) {
      toast.error(t('incomeRoleRequired'));
      return;
    }
    putIncomeMutation.mutate({ roleId: newIncome.roleId, amount });
  };

  const save = (partial: Partial<EconomyConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
    configMutation.mutate(partial);
  };
  // Commit a numeric field on blur, clamped to a sane minimum.
  const num = (key: keyof EconomyConfig, min = 0) => ({
    value: (config[key] as number | undefined) ?? 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, [key]: parseInt(e.target.value || '0', 10) })),
    onBlur: () => save({ [key]: Math.max(min, (config[key] as number | undefined) ?? min) } as Partial<EconomyConfig>),
  });

  const handleAdd = () => {
    const price = parseInt(newItem.price || '0', 10);
    if (!newItem.name.trim() || !price || price < 1) {
      toast.error(t('itemNamePriceRequired'));
      return;
    }
    addMutation.mutate({
      name: newItem.name.trim(),
      price,
      description: newItem.description.trim() || null,
      roleId: newItem.roleId || null,
      stock: newItem.stock ? parseInt(newItem.stock, 10) : -1,
    });
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {[...Array(3)].map((_, i) => (<div key={i} className="card h-40 animate-pulse bg-gray-700" />))}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="page-head">
        <div className="page-head-icon"><Coins className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>{t('title')}</h1>
          <div className="page-head-desc">{t('subtitle')}</div>
        </div>
      </div>

      <SettingsSection title={t('generalTitle')} description={t('generalDesc')}>
        <Toggle label={t('enable')} description={t('enableDesc')} enabled={config.enabled ?? false} onChange={(v) => save({ enabled: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">{t('currencyName')}</label>
            <input type="text" className="input" value={config.currencyName ?? ''} placeholder="Coins"
              onChange={(e) => setConfig((c) => ({ ...c, currencyName: e.target.value }))}
              onBlur={() => save({ currencyName: config.currencyName })} />
          </div>
          <div>
            <label className="label">{t('currencySymbol')}</label>
            <input type="text" className="input" value={config.currencySymbol ?? ''} placeholder="🪙"
              onChange={(e) => setConfig((c) => ({ ...c, currencySymbol: e.target.value }))}
              onBlur={() => save({ currencySymbol: config.currencySymbol })} />
          </div>
          <div>
            <label className="label">{t('startingBalance')}</label>
            <input type="number" className="input" min={0} {...num('startingBalance')} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('earnTitle')} description={t('earnDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('dailyAmount')}</label>
            <input type="number" className="input" min={0} {...num('dailyAmount')} />
          </div>
          <div>
            <label className="label">{t('dailyStreakBonus')}</label>
            <input type="number" className="input" min={0} {...num('dailyStreakBonus')} />
            <p className="text-xs text-gray-500 mt-1">{t('dailyStreakBonusHelp')}</p>
          </div>
          <div>
            <label className="label">{t('workMin')}</label>
            <input type="number" className="input" min={0} {...num('workMin')} />
          </div>
          <div>
            <label className="label">{t('workMax')}</label>
            <input type="number" className="input" min={0} {...num('workMax')} />
          </div>
          <div>
            <label className="label">{t('workCooldown')}</label>
            <input type="number" className="input" min={0} {...num('workCooldown')} />
            <p className="text-xs text-gray-500 mt-1">{t('secondsHelp')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('robTitle')} description={t('robDesc')}>
        <Toggle label={t('robEnable')} description={t('robEnableDesc')} enabled={config.robEnabled ?? true} onChange={(v) => save({ robEnabled: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('robSuccessRate')}</label>
            <input type="number" className="input" min={0} max={100} {...num('robSuccessRate')} />
            <p className="text-xs text-gray-500 mt-1">{t('percentHelp')}</p>
          </div>
          <div>
            <label className="label">{t('robMaxPercent')}</label>
            <input type="number" className="input" min={1} max={100} {...num('robMaxPercent', 1)} />
            <p className="text-xs text-gray-500 mt-1">{t('robMaxPercentHelp')}</p>
          </div>
          <div>
            <label className="label">{t('robFinePercent')}</label>
            <input type="number" className="input" min={0} max={100} {...num('robFinePercent')} />
            <p className="text-xs text-gray-500 mt-1">{t('robFinePercentHelp')}</p>
          </div>
          <div>
            <label className="label">{t('robMinBalance')}</label>
            <input type="number" className="input" min={0} {...num('robMinBalance')} />
            <p className="text-xs text-gray-500 mt-1">{t('robMinBalanceHelp')}</p>
          </div>
          <div>
            <label className="label">{t('robCooldown')}</label>
            <input type="number" className="input" min={0} {...num('robCooldown')} />
            <p className="text-xs text-gray-500 mt-1">{t('secondsHelp')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('gamblingTitle')} description={t('gamblingDesc')}>
        <Toggle label={t('gamblingEnable')} description={t('gamblingEnableDesc')} enabled={config.gamblingEnabled ?? true} onChange={(v) => save({ gamblingEnabled: v })} />
        <div>
          <label className="label">{t('maxBet')}</label>
          <input type="number" className="input" min={1} {...num('maxBet', 1)} />
          <p className="text-xs text-gray-500 mt-1">{t('maxBetHelp')}</p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('rewardsTitle')} description={t('rewardsDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">{t('levelUpReward')}</label>
            <input type="number" className="input" min={0} {...num('levelUpReward')} />
            <p className="text-xs text-gray-500 mt-1">{t('levelUpRewardHelp')}</p>
          </div>
          <div>
            <label className="label">{t('bankInterestPct')}</label>
            <input type="number" className="input" min={0} max={100} {...num('bankInterestPct')} />
            <p className="text-xs text-gray-500 mt-1">{t('bankInterestPctHelp')}</p>
          </div>
          <div>
            <label className="label">{t('bankInterestCap')}</label>
            <input type="number" className="input" min={0} {...num('bankInterestCap')} />
            <p className="text-xs text-gray-500 mt-1">{t('bankInterestCapHelp')}</p>
          </div>
        </div>
      </SettingsSection>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">{t('incomeTitle')}</h2>
        <p className="text-sm text-gray-400 mb-4">{t('incomeDesc')}</p>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select className="input sm:flex-1" value={newIncome.roleId} onChange={(e) => setNewIncome((s) => ({ ...s, roleId: e.target.value }))}>
            <option value="">{t('incomeSelectRole')}</option>
            {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <input type="number" className="input sm:w-40" placeholder={t('incomeAmount')} value={newIncome.amount} min={1}
            onChange={(e) => setNewIncome((s) => ({ ...s, amount: e.target.value }))} />
          <button className="btn-primary flex items-center gap-2 justify-center" onClick={handleAddIncome} disabled={putIncomeMutation.isPending}>
            <Plus className="w-4 h-4" /> {t('incomeAdd')}
          </button>
        </div>
        <div className="space-y-2">
          {incomeRoles.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">{t('incomeEmpty')}</p>
          ) : (
            incomeRoles.map((ir) => (
              <div key={ir.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                <div className="text-sm text-white">
                  @{roles.find((r) => r.id === ir.roleId)?.name ?? ir.roleId}
                  <span className="text-yellow-400"> · {(config.currencySymbol ?? '🪙')} {ir.amount.toLocaleString()}/{t('incomePerDay')}</span>
                </div>
                <button className="text-gray-500 hover:text-[var(--error)] transition-colors" title={t('deleteItem')}
                  onClick={() => deleteIncomeMutation.mutate(ir.roleId)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">{t('shopTitle')}</h2>
        <p className="text-sm text-gray-400 mb-4">{t('shopDesc')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <input type="text" className="input" placeholder={t('itemName')} value={newItem.name}
            onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))} />
          <input type="number" className="input" placeholder={t('itemPrice')} value={newItem.price} min={1}
            onChange={(e) => setNewItem((s) => ({ ...s, price: e.target.value }))} />
          <input type="text" className="input sm:col-span-2" placeholder={t('itemDescription')} value={newItem.description}
            onChange={(e) => setNewItem((s) => ({ ...s, description: e.target.value }))} />
          <select className="input" value={newItem.roleId} onChange={(e) => setNewItem((s) => ({ ...s, roleId: e.target.value }))}>
            <option value="">{t('itemNoRole')}</option>
            {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <input type="number" className="input" placeholder={t('itemStock')} value={newItem.stock} min={1}
            onChange={(e) => setNewItem((s) => ({ ...s, stock: e.target.value }))} />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleAdd} disabled={addMutation.isPending}>
          <Plus className="w-4 h-4" /> {t('addItem')}
        </button>

        <div className="mt-5 space-y-2">
          {shopItems.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">{t('shopEmpty')}</p>
          ) : (
            shopItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {item.name} <span className="text-yellow-400">· {(config.currencySymbol ?? '🪙')} {item.price.toLocaleString()}</span>
                    {item.stock >= 0 && <span className="text-gray-500 text-xs"> · {t('stockLeft', { n: item.stock })}</span>}
                  </div>
                  {item.description && <div className="text-xs text-gray-500 truncate">{item.description}</div>}
                  {item.roleId && <div className="text-xs text-discord-blurple">@{roles.find((r) => r.id === item.roleId)?.name ?? item.roleId}</div>}
                </div>
                <button className="text-gray-500 hover:text-[var(--error)] transition-colors" title={t('deleteItem')}
                  onClick={() => deleteMutation.mutate(item.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
