import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist on GAMER.ID.',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium tabular-nums text-zinc-400">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Look up your accounts or browse the example profile instead.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">Look up accounts</Link>
          <Link href="/dashboard?example=1" className="btn btn-secondary">See the example</Link>
        </div>
      </div>
    </div>
  );
}
