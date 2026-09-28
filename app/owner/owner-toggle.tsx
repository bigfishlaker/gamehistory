'use client';

import { useSyncExternalStore } from 'react';
import { isOwnerBrowser, setOwnerBrowser } from '@/lib/owner';

const EVENT = 'gamerid-owner-change';
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};
const setOwner = (on: boolean) => {
  setOwnerBrowser(on);
  window.dispatchEvent(new Event(EVENT));
};

export function OwnerToggle() {
  // null on the server (unknown until the browser's storage/cookie is read).
  const owner = useSyncExternalStore<boolean | null>(subscribe, isOwnerBrowser, () => null);

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-zinc-300" role="status" aria-live="polite">
        Status:{' '}
        <strong className={owner ? 'text-emerald-400' : 'text-zinc-100'}>
          {owner === null ? 'checking…' : owner ? 'excluded (your visits are not counted)' : 'counted (normal visitor)'}
        </strong>
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={owner === true}
          onClick={() => setOwner(true)}
        >
          Exclude this browser
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={owner === false}
          onClick={() => setOwner(false)}
        >
          Count this browser again
        </button>
      </div>
    </div>
  );
}
