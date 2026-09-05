'use client';

import React, {
  ChangeEvent,
  FC,
  FormEvent,
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from 'react';
import TermsOfServiceModal from '@/components/TermsOfServiceModal';
import BrandLogos from '@/components/ui/BrandLogos';
import { useTranslations } from '@/i18n';
import Google from './Google';
import { AUTH_STATUSES, useAuthContext } from './authContext';

const AuthWrapper: FC<PropsWithChildren> = ({ children = null }) => {
  const {
    authStatus,
    authError,
    signIn,
    allowPassword,
    userData,
    signOut,
    acceptTermsOfServices,
  } = useAuthContext();

  const handleAcceptTerms = useCallback(async () => {
    await acceptTermsOfServices();
  }, [acceptTermsOfServices]);

  const handleRefuseTerms = useCallback(() => {
    signOut();
  }, [signOut]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className='flex flex-col items-center justify-center w-full'>
        <h1 className='mb-4 text-xl'>Loading…</h1>
      </div>
    );
  }

  if (authStatus === AUTH_STATUSES.NOT_CHECKED) {
    return (
      <div className='flex flex-col items-center justify-center w-full'>
        <h1 className='mb-4 text-xl'>Loading…</h1>
      </div>
    );
  }

  if (authStatus === AUTH_STATUSES.NOT_LOGGED) {
    return (
      <div className='flex flex-col items-center justify-center w-full'>
        <SignInScreen
          authError={authError}
          allowPassword={allowPassword}
          onSignIn={signIn}
        />
      </div>
    );
  }

  if (userData && !userData.user_settings.accepted_terms_of_services) {
    return (
      <TermsOfServiceModal
        onAccept={handleAcceptTerms}
        onRefuse={handleRefuseTerms}
      />
    );
  }

  return children;
};

export default AuthWrapper;

interface SignInScreenProps {
  authError: 'invalid' | 'not_provisioned' | 'password_conflict' | false;
  allowPassword: boolean;
  onSignIn: (email: string, password: string) => void;
}

const SignInScreen: FC<SignInScreenProps> = ({
  authError,
  allowPassword,
  onSignIn,
}) => {
  const t = useTranslations();
  const { googleClientId } = useAuthContext();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (formData.email && formData.password) {
        onSignIn(formData.email, formData.password);
      }
    },
    [formData, onSignIn],
  );
  const onChangeEmail = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, email: event.target.value }));
    },
    [setFormData],
  );
  const onChangePassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, password: event.target.value }));
    },
    [setFormData],
  );

  const errorMessage = (() => {
    if (authError === 'not_provisioned') {
      return t('common.accountNotProvisioned');
    }
    if (authError === 'password_conflict') {
      return t('common.accountHasPassword');
    }
    if (authError === 'invalid') {
      return t('common.emailOrPasswordIncorrect');
    }
    return '';
  })();

  return (
    <div className='flex flex-col gap-3 max-w-md w-[90%] my-16'>
      <form
        className='flex flex-col gap-4 w-full bg-surface border border-hairline shadow-[var(--sh-md)] px-11 py-9 rounded-4xl'
        onSubmit={onSubmit}
      >
        <BrandLogos
          showBy
          className='pb-2 text-xs'
        />
        <h1 className='text-center text-xl font-bold mb-9'>
          {t('common.signIn')}
        </h1>
        {errorMessage && (
          <p
            role='alert'
            className='text-sm text-red text-center leading-snug px-2'
          >
            {errorMessage}
          </p>
        )}
        {allowPassword && (
          <React.Fragment>
            <div className='flex flex-col gap-1'>
              <label
                htmlFor='auth-email-input'
                className='block mb-1 text-sm font-medium'
              >
                {t('common.yourEmail')}
              </label>
              <input
                id='auth-email-input'
                type='email'
                onChange={onChangeEmail}
                className='w-full px-4 py-3 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
                placeholder={t('common.emailPlaceholder')}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <label
                htmlFor='auth-password-input'
                className='block mb-1 text-sm font-medium'
              >
                {t('common.yourPassword')}
              </label>
              <input
                id='auth-password-input'
                type='password'
                onChange={onChangePassword}
                className='w-full px-6 py-3 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
                placeholder='*********'
              />
            </div>
            <button
              type='submit'
              className='shrink-0 mt-4 h-14 flex items-center justify-center px-8 text-sm font-bold cursor-pointer pointer-events-auto text-white bg-blue hover:bg-blue-600 transition-colors rounded-2xl'
            >
              {t('common.signIn')}
            </button>
            {googleClientId && (
              <p className='font-bold text-sm text-center'>{t('common.or')}</p>
            )}
          </React.Fragment>
        )}
        <Google />
      </form>
      <div className='w-full bg-surface border border-hairline shadow-[var(--sh-md)] px-11 py-9 rounded-4xl'>
        <p className='text-sm text-center text-ink-2 leading-relaxed'>
          {t('common.adminProvisionedOnly')}
        </p>
      </div>
    </div>
  );
};
