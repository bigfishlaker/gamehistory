import type { Metadata } from 'next';
import { OwnerToggle } from './owner-toggle';

// Unlisted: not linked anywhere, not indexed.
export const metadata: Metadata = {
  title: 'Owner settings',
  robots: { index: false, follow: false, nocache: true },
};

export default function OwnerPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md p-6">
        <h1 className="text-lg font-semibold text-white">Exclude this browser from analytics</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          For the site owner. Turn this on once in each browser and on each phone so your own visits
          are not counted in Vercel Web Analytics or the server-side visit counter.
        </p>
        <OwnerToggle />
      </div>
    </div>
  );
}
