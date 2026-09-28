'use client';

import { useEffect } from 'react';

/**
 * Humans go straight to the profile; link-preview crawlers read this page's meta tags.
 * A full navigation (not a client-side router transition) so /p starts fresh and reads
 * every stored parameter (tab, size, top6, off) on its first render.
 */
export function ShareRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}
