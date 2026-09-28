import Link from 'next/link';

export default function ShareLinkNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Link not found</h1>
        <p className="mt-2 text-sm text-zinc-400">This share link doesn&apos;t exist or has been removed.</p>
        <Link href="/" className="btn btn-primary mt-6">Look up accounts</Link>
      </div>
    </div>
  );
}
