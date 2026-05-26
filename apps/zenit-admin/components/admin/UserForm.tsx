import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import AccountPermissionsManager from '@/components/admin/AccountPermissionsManager';
import api from '@/lib/api';
import {
  AppKey,
  allowedRolesForCompany,
  defaultRoleForCompany
} from '@zenit/shared-users-core';

const checkboxClasses =
  'h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent';

interface User {
  id: number;
  name: string;
  email: string;
  appGrants?: {
    companyId: number;
    granted: boolean;
    app: {
      appKey: 'ZENIT_CASH' | 'ZENIT_CALC' | 'ZENIT_ADMIN';
    };
  }[];
  companies: {
    company: {
      id: number;
      name: string;
      code: number;
    };
    role: string;
    isCompanyOwner?: boolean;
    manageFinancialAccounts?: boolean;
    manageFinancialCategories?: boolean;
  }[];
}

interface Company {
  id: number;
  name: string;
  code: number;
}

type Role = 'USER' | 'SUPERUSER' | 'ADMIN';

interface UserFormProps {
  mode: 'create' | 'edit';
  userId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const APP_KEY = (process.env.NEXT_PUBLIC_APP_KEY || 'zenit-admin') as AppKey;

const APP_LABELS: Record<AppKey, string> = {
  'zenit-cash': 'Zenit Cash',
  'zenit-calc': 'Zenit Calc',
  'zenit-admin': 'Zenit Admin'
};

function fromBackendAppKey(value: 'ZENIT_CASH' | 'ZENIT_CALC' | 'ZENIT_ADMIN'): AppKey {
  if (value === 'ZENIT_CASH') return 'zenit-cash';
  if (value === 'ZENIT_CALC') return 'zenit-calc';
  return 'zenit-admin';
}

function getDefaultRole(
  userRole: string | null | undefined,
  company: Company | undefined
): Role {
  if (!company) {
    return 'USER';
  }

  return defaultRoleForCompany(userRole as any, company) as Role;
}

export default function UserForm({ mode, userId, onSuccess, onCancel }: UserFormProps) {
  const router = useRouter();
  const confirmation = useConfirmation();
  const { userRole, companyId } = useAuth();
  const { isAdmin, canManageCompanyOwnership } = usePermissions();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [companyEntitlements, setCompanyEntitlements] = useState<Record<number, AppKey[]>>({});
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    newRole: 'USER' as Role
  });
  const [companyConfigs, setCompanyConfigs] = useState<
    Array<{
      companyId: number;
      role: string;
      isCompanyOwner: boolean;
      manageFinancialAccounts: boolean;
      manageFinancialCategories: boolean;
    }>
  >([]);
  const [accountConfigs, setAccountConfigs] = useState<
    Record<number, { selectedAccountIds: number[]; grantAllAccess: boolean }>
  >({});
  const [appGrantsByCompany, setAppGrantsByCompany] = useState<Record<number, AppKey[]>>({});

  useEffect(() => {
    void initialize();
  }, [mode, userId, userRole, companyId]);

  function canManageOwnershipForCompany(targetCompanyId: number): boolean {
    if (isAdmin()) {
      return true;
    }

    return canManageCompanyOwnership() && companyId === targetCompanyId;
  }

  async function initialize() {
    setLoading(true);

    try {
      const companiesResultPromise = loadCompanies();
      const userPromise = mode === 'edit' && userId ? loadUser(userId) : Promise.resolve(null);

      const [companiesResult, loadedUser] = await Promise.all([
        companiesResultPromise,
        userPromise
      ]);

      setCompanies(companiesResult.list);
      setCompanyEntitlements(companiesResult.entitlements);
      setCompaniesError(companiesResult.error);

      if (mode === 'edit') {
        if (!loadedUser) {
          addToast('Usuario nao encontrado', 'error');
          handleCancel();
          return;
        }

        applyEditState(loadedUser);
      } else {
        applyCreateState(companiesResult.list, companiesResult.entitlements);
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar formulario de usuario', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanies(): Promise<{
    list: Company[];
    entitlements: Record<number, AppKey[]>;
    error: string | null;
  }> {
    try {
      const response = await api.get('/companies');
      let list: Company[] = response.data || [];

      if (!isAdmin() && userRole === 'SUPERUSER') {
        list = list.filter((company) => company.id === companyId);
      }

      const entitlementEntries = await Promise.all(
        list.map(async (company) => {
          const entitlementResponse = await api.get(
            `/app-access/company/${company.id}/entitlements`
          );
          const enabledApps = (entitlementResponse.data || [])
            .filter((item: { appKey: AppKey; enabled: boolean }) => item.enabled)
            .map((item: { appKey: AppKey }) => item.appKey as AppKey);

          return [company.id, enabledApps] as const;
        })
      );

      const entitlements = entitlementEntries.reduce<Record<number, AppKey[]>>(
        (acc, [id, apps]) => {
          acc[id] = apps;
          return acc;
        },
        {}
      );

      return {
        list,
        entitlements,
        error: null
      };
    } catch (error: any) {
      if (error.response?.status === 403) {
        return {
          list: [],
          entitlements: {},
          error: 'Sem permissao para listar empresas.'
        };
      }

      return {
        list: [],
        entitlements: {},
        error: 'Erro ao carregar lista de empresas'
      };
    }
  }

  async function loadUser(id: string): Promise<User | null> {
    const response = await api.get('/users');
    const users = response.data || [];
    return users.find((user: User) => user.id.toString() === id) || null;
  }

  function applyCreateState(
    loadedCompanies: Company[],
    entitlements: Record<number, AppKey[]>
  ) {
    const firstCompany = loadedCompanies[0];
    const defaultRole = getDefaultRole(userRole, firstCompany);

    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      newRole: defaultRole
    });

    if (loadedCompanies.length === 1 && firstCompany) {
      const enabledApps = entitlements[firstCompany.id] || [];
      const defaultApps = enabledApps.includes(APP_KEY)
        ? [APP_KEY]
        : enabledApps.length > 0
          ? [enabledApps[0]]
          : [];

      setCompanyConfigs([
        {
          companyId: firstCompany.id,
          role: defaultRole,
          isCompanyOwner: false,
          manageFinancialAccounts: false,
          manageFinancialCategories: false
        }
      ]);
      setAccountConfigs({
        [firstCompany.id]: { selectedAccountIds: [], grantAllAccess: false }
      });
      setAppGrantsByCompany({
        [firstCompany.id]: defaultApps
      });
      return;
    }

    setCompanyConfigs([]);
    setAccountConfigs({});
    setAppGrantsByCompany({});
  }

  function applyEditState(user: User) {
    const visibleCompanies =
      !isAdmin() && userRole === 'SUPERUSER'
        ? user.companies.filter((companyConfig) => companyConfig.company.id === companyId)
        : user.companies;

    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      newRole: (visibleCompanies[0]?.role || 'USER') as Role
    });
    setCompanyConfigs(
      visibleCompanies.map((companyConfig) => ({
        companyId: companyConfig.company.id,
        role: companyConfig.role,
        isCompanyOwner: companyConfig.isCompanyOwner || false,
        manageFinancialAccounts: companyConfig.manageFinancialAccounts || false,
        manageFinancialCategories: companyConfig.manageFinancialCategories || false
      }))
    );

    const initialAccountConfigs: Record<
      number,
      { selectedAccountIds: number[]; grantAllAccess: boolean }
    > = {};
    visibleCompanies.forEach((companyConfig) => {
      initialAccountConfigs[companyConfig.company.id] = {
        selectedAccountIds: [],
        grantAllAccess: false
      };
    });
    setAccountConfigs(initialAccountConfigs);

    const mappedAppGrants = (user.appGrants || []).reduce<Record<number, AppKey[]>>(
      (acc, grant) => {
        if (!grant.granted) {
          return acc;
        }

        if (!acc[grant.companyId]) {
          acc[grant.companyId] = [];
        }

        acc[grant.companyId].push(fromBackendAppKey(grant.app.appKey));
        return acc;
      },
      {}
    );

    setAppGrantsByCompany(mappedAppGrants);
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/admin/users');
  }

  function handlePermissionsChange(company: number, accountIds: number[], grantAll: boolean) {
    setAccountConfigs((prev) => ({
      ...prev,
      [company]: {
        selectedAccountIds: accountIds,
        grantAllAccess: grantAll
      }
    }));
  }

  function toggleAppGrant(companyIdValue: number, appKey: AppKey) {
    setAppGrantsByCompany((prev) => {
      const current = prev[companyIdValue] || [];
      const hasKey = current.includes(appKey);

      return {
        ...prev,
        [companyIdValue]: hasKey
          ? current.filter((existingKey) => existingKey !== appKey)
          : [...current, appKey]
      };
    });
  }

  function buildAppGrantsPayload() {
    return companyConfigs.flatMap((config) => {
      const enabledApps = companyEntitlements[config.companyId] || [];
      const selectedApps = new Set(appGrantsByCompany[config.companyId] || []);

      return enabledApps.map((appKey) => ({
        companyId: config.companyId,
        appKey,
        granted: selectedApps.has(appKey)
      }));
    });
  }

  function getDefaultAppsForCompany(company: Company): AppKey[] {
    const enabledApps = companyEntitlements[company.id] || [];
    if (enabledApps.includes(APP_KEY)) {
      return [APP_KEY];
    }
    if (enabledApps.length > 0) {
      return [enabledApps[0]];
    }
    return [];
  }

  function addCompanyConfig(company: Company) {
    const role = getDefaultRole(userRole, company);

    setCompanyConfigs((prev) => [
      ...prev,
      {
        companyId: company.id,
        role,
        isCompanyOwner: false,
        manageFinancialAccounts: false,
        manageFinancialCategories: false
      }
    ]);
    setAccountConfigs((prev) => ({
      ...prev,
      [company.id]: { selectedAccountIds: [], grantAllAccess: false }
    }));
    setAppGrantsByCompany((prev) => ({
      ...prev,
      [company.id]: getDefaultAppsForCompany(company)
    }));
  }

  function removeCompanyConfig(companyIdValue: number) {
    setCompanyConfigs((prev) => prev.filter((config) => config.companyId !== companyIdValue));
    setAccountConfigs((prev) => {
      const next = { ...prev };
      delete next[companyIdValue];
      return next;
    });
    setAppGrantsByCompany((prev) => {
      const next = { ...prev };
      delete next[companyIdValue];
      return next;
    });
  }

  function updateCompanyRole(companyIdValue: number, role: string) {
    setCompanyConfigs((prev) =>
      prev.map((config) =>
        config.companyId === companyIdValue
          ? {
              ...config,
              role,
              isCompanyOwner: role === 'SUPERUSER' ? config.isCompanyOwner : false
            }
          : config
      )
    );

    if (companies.length === 1) {
      setFormData((prev) => ({
        ...prev,
        newRole: role as Role
      }));
    }
  }

  function updateCompanyPermissionFlag(
    companyIdValue: number,
    field: 'manageFinancialAccounts' | 'manageFinancialCategories',
    checked: boolean
  ) {
    setCompanyConfigs((prev) =>
      prev.map((config) =>
        config.companyId === companyIdValue
          ? { ...config, [field]: checked }
          : config
      )
    );
  }

  function updateCompanyOwnerFlag(companyIdValue: number, checked: boolean) {
    setCompanyConfigs((prev) =>
      prev.map((config) =>
        config.companyId === companyIdValue
          ? { ...config, isCompanyOwner: checked }
          : config
      )
    );
  }

  function getSubmitDisabled() {
    if (saving) {
      return true;
    }

    if (companiesError) {
      return true;
    }

    if (mode === 'create' && companies.length === 0) {
      return true;
    }

    return false;
  }

  function confirmSaveWithoutPermissions(): Promise<boolean> {
    return new Promise((resolve) => {
      confirmation.confirm(
        {
          title: 'Usuario sem Permissoes de Acesso',
          message: `O usuario "${formData.name}" sera criado sem acesso a nenhuma conta financeira. Ele nao conseguira visualizar dashboard, transacoes ou relatorios ate que permissoes sejam concedidas. Deseja continuar?`,
          confirmText: 'Criar Mesmo Assim',
          cancelText: 'Voltar e Configurar',
          type: 'warning'
        },
        () => resolve(true),
        () => resolve(false)
      );
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.name.trim() || !formData.email.trim()) {
      addToast('Nome e email sao obrigatorios', 'error');
      return;
    }

    if (!editingUser && !formData.password) {
      addToast('Senha e obrigatoria para novos usuarios', 'error');
      return;
    }

    if (companiesError) {
      addToast(companiesError, 'error');
      return;
    }

    if (companies.length === 0) {
      addToast('Nao e possivel salvar usuarios sem empresas disponiveis', 'error');
      return;
    }

    if (isAdmin() && companyConfigs.length === 0) {
      addToast('Selecione ao menos uma empresa', 'error');
      return;
    }

    if (!editingUser) {
      const lacksPermission = companyConfigs.some((config) => {
        if (config.role !== 'USER') {
          return false;
        }

        const accountConfig = accountConfigs[config.companyId];
        if (!accountConfig) {
          return true;
        }

        return !accountConfig.grantAllAccess && accountConfig.selectedAccountIds.length === 0;
      });

      if (lacksPermission) {
        const shouldContinue = await confirmSaveWithoutPermissions();
        if (!shouldContinue) {
          return;
        }
      }
    }

    setSaving(true);

    try {
      if (editingUser) {
        const updateData: Partial<typeof formData> = { ...formData };
        if (!updateData.password) {
          delete updateData.password;
        }

        const payload = {
          ...updateData,
          companies: companyConfigs,
          appGrants: buildAppGrantsPayload()
        };

        await api.put(`/users/${editingUser.id}`, payload);

        await Promise.all(
          companyConfigs
            .filter((config) => config.role === 'USER')
            .map(async (config) => {
              const accountConfig = accountConfigs[config.companyId];
              if (!accountConfig) {
                return;
              }

              if (accountConfig.grantAllAccess) {
                await api.post(`/users/${editingUser.id}/account-access/grant-all`, null, {
                  headers: { 'X-Company-Id': config.companyId }
                });
                return;
              }

              await api.post(
                `/users/${editingUser.id}/account-access/bulk-update`,
                { accountIds: accountConfig.selectedAccountIds },
                { headers: { 'X-Company-Id': config.companyId } }
              );
            })
        );

        addToast('Usuario atualizado com sucesso', 'success');
      } else {
        const payload = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          newRole: formData.newRole,
          companies: companyConfigs,
          appGrants: buildAppGrantsPayload()
        };

        const response = await api.post('/users', payload);
        const newId = response.data.id;

        await Promise.all(
          companyConfigs
            .filter((config) => config.role === 'USER')
            .map(async (config) => {
              const accountConfig = accountConfigs[config.companyId];
              if (!accountConfig) {
                return;
              }

              if (accountConfig.grantAllAccess) {
                await api.post(`/users/${newId}/account-access/grant-all`, null, {
                  headers: { 'X-Company-Id': config.companyId }
                });
                return;
              }

              await api.post(
                `/users/${newId}/account-access/bulk-update`,
                { accountIds: accountConfig.selectedAccountIds },
                { headers: { 'X-Company-Id': config.companyId } }
              );
            })
        );

        addToast('Usuario criado com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/users');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar usuario', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageLoader
        message={mode === 'edit' ? 'Carregando usuario...' : 'Carregando formulario...'}
      />
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'create' ? 'Novo Usuario' : 'Editar Usuario'}
          </h1>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            type="submit"
            form="user-form"
            variant="accent"
            disabled={getSubmitDisabled()}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving
              ? 'Salvando...'
              : mode === 'create'
                ? 'Criar Usuario'
                : 'Salvar Alteracoes'}
          </Button>
        </div>
      </div>

      <Card>
        <form id="user-form" onSubmit={handleSubmit} className="space-y-6">
          {companiesError && (
            <div className="rounded-lg border border-yellow-700/60 bg-yellow-900/20 p-4 text-sm text-yellow-200">
              {companiesError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Nome"
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, email: event.target.value }))
              }
              required
              disabled={saving}
            />
            <Input
              label={editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
              type="password"
              value={formData.password}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, password: event.target.value }))
              }
              required={!editingUser}
              disabled={saving}
              placeholder={editingUser ? 'Deixe em branco para nao alterar' : ''}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Empresas</label>
            <div className="space-y-2">
              {companies.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-[#1e2126] p-4 text-sm text-gray-400">
                  Nenhuma empresa disponivel para vinculo.
                </div>
              ) : (
                companies.map((company) => {
                  const config = companyConfigs.find(
                    (companyConfig) => companyConfig.companyId === company.id
                  );
                  const singleCompany = companies.length === 1;

                  return (
                    <div
                      key={company.id}
                      className="space-y-2 rounded-lg border border-gray-700 bg-[#1e2126] p-3"
                    >
                      <label className="flex items-center gap-3 rounded-md border border-gray-600 bg-[#0f1419] px-3 py-2 font-semibold">
                        <input
                          type="checkbox"
                          checked={Boolean(config)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              addCompanyConfig(company);
                              return;
                            }

                            removeCompanyConfig(company.id);
                          }}
                          disabled={saving || singleCompany}
                          className={checkboxClasses}
                        />
                        <span className="flex-1 text-sm text-white">{company.name}</span>

                        {config && (
                          <select
                            value={config.role}
                            onChange={(event) =>
                              updateCompanyRole(company.id, event.target.value)
                            }
                            className="rounded border border-gray-700 bg-[#1e2126] px-2 py-1 text-white"
                            disabled={saving}
                          >
                            {allowedRolesForCompany(userRole as any, company).includes('USER') && (
                              <option value="USER">Usuario</option>
                            )}
                            {allowedRolesForCompany(userRole as any, company).includes(
                              'SUPERUSER'
                            ) && <option value="SUPERUSER">Superusuario</option>}
                            {allowedRolesForCompany(userRole as any, company).includes('ADMIN') && (
                              <option value="ADMIN">Administrador</option>
                            )}
                          </select>
                        )}
                      </label>

                      {config && (
                        <div className="ml-6 mt-2 space-y-2">
                          <label className="mb-1 block text-sm font-medium text-gray-300">
                            Aplicativos do ecossistema
                          </label>
                          <div className="flex flex-wrap gap-3">
                            {(companyEntitlements[company.id] || []).map((appKey) => (
                              <label
                                key={appKey}
                                className="flex items-center gap-2 text-sm text-gray-300"
                              >
                                <input
                                  type="checkbox"
                                  className={checkboxClasses}
                                  checked={(appGrantsByCompany[company.id] || []).includes(appKey)}
                                  onChange={() => toggleAppGrant(company.id, appKey)}
                                  disabled={saving}
                                />
                                {APP_LABELS[appKey]}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {config &&
                        config.role === 'SUPERUSER' &&
                        canManageOwnershipForCompany(company.id) && (
                          <div className="ml-6 mt-2 rounded-lg border border-amber-700/50 bg-amber-900/10 p-3">
                            <label className="flex items-start gap-3 text-sm text-amber-100">
                              <input
                                type="checkbox"
                                className={checkboxClasses}
                                checked={config.isCompanyOwner}
                                onChange={(event) =>
                                  updateCompanyOwnerFlag(company.id, event.target.checked)
                                }
                                disabled={saving}
                              />
                              <span>
                                <span className="block font-medium">Company owner</span>
                                <span className="block text-xs text-amber-200/80">
                                  Libera acoes sensiveis da empresa, como o reset financeiro.
                                </span>
                              </span>
                            </label>
                          </div>
                        )}

                      {config &&
                        config.role === 'SUPERUSER' &&
                        config.isCompanyOwner &&
                        !canManageOwnershipForCompany(company.id) && (
                          <div className="ml-6 mt-2 rounded-lg border border-amber-700/50 bg-amber-900/10 px-3 py-2 text-sm text-amber-100">
                            Este usuario e company owner desta empresa.
                          </div>
                        )}

                      {config && config.role === 'USER' && (
                        <div className="ml-6 mt-2 space-y-4">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                              Permissoes de Acesso
                            </label>
                            <div className="space-y-2 rounded-lg border border-gray-700 bg-[#1a1f2b] p-3">
                              <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input
                                  type="checkbox"
                                  className={checkboxClasses}
                                  checked={config.manageFinancialAccounts}
                                  onChange={(event) =>
                                    updateCompanyPermissionFlag(
                                      company.id,
                                      'manageFinancialAccounts',
                                      event.target.checked
                                    )
                                  }
                                  disabled={saving}
                                />
                                Gerenciar Contas Financeiras
                              </label>
                              <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input
                                  type="checkbox"
                                  className={checkboxClasses}
                                  checked={config.manageFinancialCategories}
                                  onChange={(event) =>
                                    updateCompanyPermissionFlag(
                                      company.id,
                                      'manageFinancialCategories',
                                      event.target.checked
                                    )
                                  }
                                  disabled={saving}
                                />
                                Gerenciar Categorias Financeiras
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                              Permissao as Contas Financeiras
                            </label>
                            <AccountPermissionsManager
                              companyId={company.id}
                              userId={editingUser?.id || null}
                              selectedAccountIds={
                                accountConfigs[company.id]?.selectedAccountIds || []
                              }
                              onPermissionsChange={(ids, all) =>
                                handlePermissionsChange(company.id, ids, all)
                              }
                              disabled={saving}
                              showCurrentPermissions={Boolean(editingUser)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </form>
      </Card>
    </>
  );
}
