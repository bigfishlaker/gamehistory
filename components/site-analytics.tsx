'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { isOwnerBrowser, shouldSkipAnalytics } from '@/lib/owner';

/**
 * Vercel Web Analytics (anonymous, cookie-free). Events are dropped for the site owner's
 * browsers (/owner sets the flag) and on localhost/dev.
 */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        if (shouldSkipAnalytics(window.location.hostname, isOwnerBrowser())) return null;
        return event;
      }}
    />
  );
}
