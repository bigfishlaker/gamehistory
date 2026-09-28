import Link from 'next/link';
import { SearchForm } from '@/components/search-form';
import { BuiltBy } from '@/components/built-by';
import { SavedAccountsPanel } from '@/components/saved-accounts-panel';
import { DEMO_ACCOUNTS, getDemoProfileUrl, getDemoSummary } from '@/lib/demo-accounts';

const STEPS = [
  {
    title: 'Add your accounts',
    body: 'Enter an Xbox gamertag, Steam ID or PSN Online ID. Add as many as you like.',
  },
  {
    title: 'See pooled hours and games',
    body: 'Every game from every account is merged into one library with total playtime.',
  },
  {
    title: 'Share your Top 6 card',
    body: 'Pick your favourite games and export a Top 6 (or 10, 25, 50) image.',
  },
];

export default function Home() {
  const demoUrl = getDemoProfileUrl();
  const demoName = DEMO_ACCOUNTS.map(a => a.displayName ?? a.identifier).join(', ');
  const { accountCount, platformCount } = getDemoSummary();
  const demoDetail = `${accountCount} public account${accountCount === 1 ? '' : 's'} on ${platformCount} platform${platformCount === 1 ? '' : 's'}`;

  return (
    <div className="flex-1">
      <section className="mx-auto max-w-xl px-4 pt-16 pb-12 sm:pt-24">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Your gaming history across Xbox, Steam and PlayStation.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          Look up your accounts to see total hours and every game you&apos;ve played in one place,
          then share a Top 6 card. No sign-up.
        </p>
        <div className="mt-5 text-sm">
          <BuiltBy />
        </div>

        <div className="mt-10 space-y-4">
          <SavedAccountsPanel />

          <div className="card p-5">
            <SearchForm />
            <p className="mt-4 text-sm text-zinc-400">
              Use <span className="text-zinc-300">Add</span> to include more than one account.{' '}
              <Link href="/help" className="text-link">How do I find my ID?</Link>
            </p>
          </div>

          <p className="text-sm text-zinc-400">
            Just looking?{' '}
            <Link href={demoUrl} className="text-link">
              See an example profile: {demoName} ({demoDetail})
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-zinc-800/80">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="text-sm font-medium text-zinc-400">How it works</h2>
          <ol className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <div className="text-sm tabular-nums text-zinc-400">0{i + 1}</div>
                <h3 className="mt-2 font-medium text-zinc-100">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
