import Link from 'next/link';
import { BuiltBy } from './built-by';

/** Shared site footer with the creator credit. Rendered once from the root layout. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-800/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-sm sm:flex-row sm:justify-between sm:px-6">
        <div className="flex items-center gap-4 text-zinc-400">
          <span className="font-medium text-zinc-300">GAMER.ID</span>
          <Link href="/privacy" className="inline-flex min-h-11 items-center text-zinc-400 hover:text-zinc-100 transition-colors">Privacy</Link>
        </div>
        <BuiltBy />
      </div>
    </footer>
  );
}
