import type { Metadata } from 'next';
import { MintClient } from './mint-client';

export const metadata: Metadata = {
  title: 'Forge your GAMER.ID Card',
  description: 'Pick your all-time Top 6, forge a soulbound holo card and share it. Hours and tier keep levelling up.',
};

export default async function MintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const embed = sp.embed === 'grotto' ? 'grotto' : null;
  const demo = process.env.NODE_ENV !== 'production' && sp.demo === '1';
  return <MintClient embed={embed} demo={demo} />;
}
