import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/store';
import { isShareRecord, isValidShareCode, shareDisplayName, shareKey, shareRecordQuery, type ShareRecord } from '@/lib/share-links';
import { ShareRedirect } from './share-redirect';

// Short links are looked up per request (new links must work immediately).
export const dynamic = 'force-dynamic';

async function loadRecord(code: string): Promise<ShareRecord | null> {
  if (!isValidShareCode(code)) return null;
  try {
    const value = await getStore().get<unknown>(shareKey(code));
    return isShareRecord(value) ? value : null;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const record = await loadRecord(code);
  if (!record) return { title: 'Link not found', robots: { index: false } };
  const title = `${shareDisplayName(record)}'s gaming history on GAMER.ID`;
  const description = 'Pooled playtime, every game played and a Top 6 across Xbox, Steam and PlayStation.';
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/u/${code}` },
    openGraph: { type: 'website', siteName: 'GAMER.ID', title, description, url: `/u/${code}`, images: ['/opengraph-image'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/twitter-image'] },
  };
}

export default async function ShortLinkPage({ params }: Props) {
  const { code } = await params;
  const record = await loadRecord(code);
  if (!record) notFound();
  const target = `/p?${shareRecordQuery(record)}`;
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="text-center">
        <p className="text-sm text-zinc-400">Opening {shareDisplayName(record)}&apos;s profile…</p>
        <a href={target} className="text-link mt-3 inline-block text-sm">Continue</a>
        <ShareRedirect to={target} />
      </div>
    </div>
  );
}
