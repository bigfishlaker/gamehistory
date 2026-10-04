import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCard } from '@/lib/nft/mint-service';
import { liveStats, toCardView } from '@/lib/nft/card-view';
import { mintDeps } from '@/lib/nft/route-helpers';
import { buildXIntentUrl } from '@/lib/share';

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[1-9]\d{0,9}$/.test(id)) return null;
  const deps = mintDeps();
  if (!deps) return null;
  const card = await getCard(deps, BigInt(id)).catch(() => null);
  if (!card) return null;
  const { stats, live } = await liveStats(deps.store, card, deps.loadProfile);
  return toCardView(card, stats, live);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const view = await load(id);
  if (!view) return { title: 'GAMER.ID Card' };
  const title = `GAMER.ID ${view.serial}: ${view.totalHours.toLocaleString('en-US')} hours`;
  const image = `/api/nft/${id}/image?h=${view.totalHours}`;
  return {
    title,
    description: `${view.displayName}'s Top 6: ${view.top6.map(g => g.t).join(', ')}`,
    openGraph: { title, images: [{ url: image, width: 800, height: 1120 }] },
    twitter: { card: 'summary_large_image', title, images: [image] },
  };
}

export default async function CardPage({ params }: Props) {
  const { id } = await params;
  const view = await load(id);
  if (!view) notFound();
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  const share = buildXIntentUrl(
    `My GAMER.ID ${view.serial}: ${view.totalHours.toLocaleString('en-US')} hours, ${view.tier.name} tier. Top 6 locked in forever 👇`,
    `${site}/mint/card/${id}`,
  );
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-4 py-10 md:flex-row md:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/nft/${id}/image?h=${view.totalHours}`} alt={`GAMER.ID card ${view.serial}`} width={400} height={560} className="rounded-3xl shadow-2xl" />
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-black">GAMER.ID {view.serial}</h1>
        <p className="text-zinc-400">{view.displayName} · {view.tier.name} tier · {view.totalHours.toLocaleString('en-US')} hours across {view.gameCount} games{view.live ? '' : ' (at mint)'}</p>
        <ol className="list-decimal pl-5 text-zinc-200">
          {view.top6.map(g => <li key={g.t}>{g.t} <span className="text-zinc-500">· {g.h.toLocaleString('en-US')}h at mint</span></li>)}
        </ol>
        <p className="text-sm text-zinc-500">Soulbound. Owner {view.owner.slice(0, 6)}…{view.owner.slice(-4)}. The Top 6 was locked at mint; hours and tier update from GAMER.ID.</p>
        <div className="flex gap-3">
          <a href={share} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-black px-4 py-2 font-bold ring-1 ring-zinc-700">Share on X</a>
          <Link href="/mint" className="rounded-xl bg-violet-600 px-4 py-2 font-bold">Forge yours</Link>
        </div>
      </div>
    </div>
  );
}
