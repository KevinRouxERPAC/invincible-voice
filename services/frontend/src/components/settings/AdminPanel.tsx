'use client';

import { LoaderCircleIcon, Trash2 } from 'lucide-react';
import {
  ChangeEvent,
  FC,
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslations } from '@/i18n';
import {
  AdminUserSummary,
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
} from '@/utils/userData';

interface AdminPanelProps {
  currentUserEmail: string;
}

const AdminPanel: FC<AdminPanelProps> = ({ currentUserEmail }) => {
  const t = useTranslations();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLanguage, setNewLanguage] = useState('fr');
  const [newGoogleOnly, setNewGoogleOnly] = useState(false);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const result = await listAdminUsers();
    if (result.data) {
      setUsers(result.data);
    } else {
      setError(result.error ?? t('admin.loadFailed'));
    }
    setIsLoading(false);
  }, [t]);

  useEffect(() => {
    loadUsers().catch(() => {});
  }, [loadUsers]);

  const onCreateUser = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsCreating(true);
      setError('');
      setSuccess('');
      const result = await createAdminUser({
        email: newEmail.trim(),
        password: newGoogleOnly ? undefined : newPassword,
        google_only: newGoogleOnly,
        language: newLanguage,
        is_admin: newIsAdmin,
      });
      if (result.data) {
        setSuccess(t('admin.userCreated'));
        setNewEmail('');
        setNewPassword('');
        setNewGoogleOnly(false);
        setNewIsAdmin(false);
        await loadUsers();
      } else {
        setError(result.error ?? t('admin.createFailed'));
      }
      setIsCreating(false);
    },
    [
      loadUsers,
      newEmail,
      newGoogleOnly,
      newIsAdmin,
      newLanguage,
      newPassword,
      t,
    ],
  );

  const onToggleAdmin = useCallback(
    async (user: AdminUserSummary) => {
      setError('');
      setSuccess('');
      const result = await updateAdminUser(user.email, {
        is_admin: !user.is_admin,
      });
      if (result.data) {
        await loadUsers();
      } else {
        setError(result.error ?? t('admin.updateFailed'));
      }
    },
    [loadUsers, t],
  );

  const onDeleteUser = useCallback(
    async (email: string) => {
      // eslint-disable-next-line no-alert -- simple admin confirmation
      const confirmed = window.confirm(
        `${t('admin.deleteConfirm')} ${email} ?`,
      );
      if (!confirmed) {
        return;
      }
      setError('');
      setSuccess('');
      const result = await deleteAdminUser(email);
      if (result.status === 200) {
        setSuccess(t('admin.userDeleted'));
        await loadUsers();
      } else {
        setError(result.error ?? t('admin.deleteFailed'));
      }
    },
    [loadUsers, t],
  );

  const onChangeNewEmail = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNewEmail(event.target.value);
    },
    [],
  );

  const onChangeNewPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNewPassword(event.target.value);
    },
    [],
  );

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h3 className='text-lg font-semibold text-ink'>{t('admin.title')}</h3>
        <p className='mt-1 text-sm text-muted'>{t('admin.description')}</p>
      </div>

      {(error || success) && (
        <p
          className={`text-sm ${error ? 'text-red' : 'text-sage-600'}`}
          role='status'
        >
          {error || success}
        </p>
      )}

      <form
        onSubmit={onCreateUser}
        className='flex flex-col gap-4 p-6 bg-surface border border-hairline rounded-3xl'
      >
        <h4 className='text-sm font-medium text-ink'>
          {t('admin.createUser')}
        </h4>
        <input
          type='email'
          required
          value={newEmail}
          onChange={onChangeNewEmail}
          placeholder={t('admin.emailPlaceholder')}
          className='w-full px-4 py-3 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
        />
        {!newGoogleOnly && (
          <input
            type='password'
            required={!newGoogleOnly}
            minLength={10}
            value={newPassword}
            onChange={onChangeNewPassword}
            placeholder={t('admin.passwordPlaceholder')}
            className='w-full px-4 py-3 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
          />
        )}
        <select
          value={newLanguage}
          onChange={(event) => setNewLanguage(event.target.value)}
          className='w-full px-4 py-3 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
        >
          <option value='fr'>Français</option>
          <option value='en'>English</option>
          <option value='de'>Deutsch</option>
          <option value='es'>Español</option>
          <option value='pt'>Português</option>
        </select>
        <label className='flex items-center gap-3 text-sm text-ink'>
          <input
            type='checkbox'
            checked={newGoogleOnly}
            onChange={(event) => setNewGoogleOnly(event.target.checked)}
            className='size-5 accent-blue'
          />
          {t('admin.googleOnly')}
        </label>
        <label className='flex items-center gap-3 text-sm text-ink'>
          <input
            type='checkbox'
            checked={newIsAdmin}
            onChange={(event) => setNewIsAdmin(event.target.checked)}
            className='size-5 accent-blue'
          />
          {t('admin.grantAdmin')}
        </label>
        <button
          type='submit'
          disabled={isCreating}
          className='h-12 px-6 text-sm font-medium text-white bg-blue rounded-2xl hover:bg-blue-600 disabled:opacity-50'
        >
          {isCreating ? (
            <LoaderCircleIcon
              className='mx-auto animate-spin'
              size={18}
            />
          ) : (
            t('admin.createUser')
          )}
        </button>
      </form>

      <div className='flex flex-col gap-3'>
        <h4 className='text-sm font-medium text-ink'>{t('admin.usersList')}</h4>
        {isLoading ? (
          <LoaderCircleIcon
            className='animate-spin text-muted'
            size={24}
          />
        ) : (
          users.map((user) => (
            <div
              key={user.email}
              className='flex flex-col gap-3 p-4 bg-surface-2 border border-hairline rounded-2xl sm:flex-row sm:items-center sm:justify-between'
            >
              <div>
                <p className='font-medium text-ink'>{user.email}</p>
                <p className='text-xs text-muted'>
                  {user.display_name}
                  {' · '}
                  {user.has_password ? t('admin.hasPassword') : ''}
                  {user.has_password && user.has_google ? ' · ' : ''}
                  {user.has_google ? t('admin.hasGoogle') : ''}
                  {!user.has_password && !user.has_google
                    ? t('admin.pendingGoogleLink')
                    : ''}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <label className='flex items-center gap-2 text-sm text-ink'>
                  <input
                    type='checkbox'
                    checked={user.is_admin}
                    disabled={user.email === currentUserEmail}
                    onChange={() => {
                      onToggleAdmin(user).catch(() => {});
                    }}
                    className='size-4 accent-blue'
                  />
                  {t('admin.adminBadge')}
                </label>
                <button
                  type='button'
                  disabled={user.email === currentUserEmail}
                  onClick={() => {
                    onDeleteUser(user.email).catch(() => {});
                  }}
                  className='inline-flex items-center gap-1 px-3 py-2 text-sm text-red border border-red/30 rounded-xl hover:bg-red-tint disabled:opacity-40'
                >
                  <Trash2 size={14} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
