import { postAuthPath } from '@/lib/authReturnTo';

const GOOGLE_SCRIPT_ID = 'google-gsi-script';

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}

export function isGoogleConfigured() {
  return Boolean(getGoogleClientId());
}

export function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google auth is only available in the browser.'));
      return;
    }

    if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google SDK failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google SDK failed to load.'));
    document.head.appendChild(script);
  });
}

export async function signInWithGoogle(returnTo = '/') {
  const clientId = getGoogleClientId();

  if (!clientId) {
    throw new Error('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID to enable this option.');
  }

  try {
    await loadGoogleScript();

    if (!window.google?.accounts?.id) {
      throw new Error('Google popup auth is unavailable in this browser.');
    }

    const handleCredential = async ({ credential }) => {
      if (!credential) {
        throw new Error('Google sign-in was cancelled.');
      }

      const payload = JSON.parse(atob(credential.split('.')[1] || ''));
      const profile = {
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email?.split('@')[0] || 'Google User',
        picture: payload.picture || '',
      };

      const backendResponse = await fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential,
          user: profile,
        }),
      });

      if (!backendResponse.ok) {
        const text = await backendResponse.text();
        throw new Error(text || 'Google verification failed.');
      }

      const data = await backendResponse.json();
      localStorage.setItem('frontend_user', JSON.stringify(data.user));
      localStorage.setItem('frontend_access_token', credential);
      window.location.href = postAuthPath(data.user);
      return data.user;
    };

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        throw new Error('Google sign-in was blocked or skipped.');
      }
    });

    return null;
  } catch (error) {
    console.error('Google sign-in failed:', error);
    throw error;
  }
}
