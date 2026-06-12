import Image from 'next/image';
import { useEffect, useMemo } from 'react';
import { useTranslations } from '@/i18n';
import { useAuthContext } from './authContext';

const Google = () => {
  const { googleSignIn, googleClientId } = useAuthContext();
  const t = useTranslations();
  const clientID = googleClientId;
  const redirect = window.location.origin;
  const response = 'id_token';
  const scope = 'openid profile email';
  // Fresh random value per mount; a fixed string would let an attacker replay
  // a previously captured id_token URL.
  const nonce = useMemo(() => crypto.randomUUID().replace(/-/g, ''), []);

  useEffect(() => {
    if (window.location.hash) {
      if (window.location.hash.split('id_token=').length > 1) {
        const googleToken = window.location.hash
          .split('id_token=')[1]
          .split('&')[0];
        googleSignIn(googleToken);
      }
    }
  }, [googleSignIn]);

  // No OAuth client configured on the backend (GOOGLE_CLIENT_ID empty): hide the
  // button entirely. Showing it would send `client_id=` (empty) to Google and
  // fail with "Missing required parameter: client_id". The hash-handling effect
  // above still runs (hooks execute before this return) so a redirect coming
  // back from Google is processed once a client id is configured.
  if (!clientID) {
    return null;
  }

  return (
    <a
      href={`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientID}&redirect_uri=${redirect}&response_type=${response}&scope=${scope}&nonce=${nonce}`}
      className='shrink-0 p-px cursor-pointer pointer-events-auto rounded-2xl h-14'
    >
      <div className='h-full w-full flex flex-row bg-[#181818] items-center justify-center gap-2 rounded-2xl text-sm px-8'>
        <Image
          src='/google-icon.webp'
          alt='Google Logo'
          width={16}
          height={16}
          className='mr-2'
        />
        {t('common.googleSignIn')}
      </div>
    </a>
  );
};

export default Google;
