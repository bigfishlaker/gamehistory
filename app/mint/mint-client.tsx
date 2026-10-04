'use client';

import '@/components/mint/forge.css';
import { useEffect, useMemo, useState } from 'react';
import { ForgeGame } from '@/components/mint/forge-game';
import { ForgeApi } from '@/components/mint/api';
import { WalletProviders } from '@/components/mint/wallet-providers';
import { WalletMintPanel } from '@/components/mint/wallet-mint-panel';
import { GrottoMintPanel } from '@/components/mint/grotto-mint-panel';
import { waitForGrottoRuntime } from '@/components/mint/grotto-runtime';

export function MintClient({ embed, demo }: { embed: 'grotto' | null; demo: boolean }) {
  // Inside The Grotto (via the uploaded wrapper) API calls carry the runtime session (memory only).
  const [api] = useState(() => new ForgeApi(''));
  useEffect(() => {
    if (embed !== 'grotto') return;
    waitForGrottoRuntime().then(rt => api.setAuthorization(`Bearer ${rt.sessionId}`)).catch(() => {});
  }, [embed, api]);
  const demoAccounts = useMemo(() => (demo ? { steam: '76561197960287930', xbox: 'ForgeDemo' } : undefined), [demo]);

  if (embed === 'grotto') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto' }}>
        <ForgeGame api={api} MintPanel={GrottoMintPanel} headline="Forge your GAMER.ID" demo={demoAccounts} />
      </div>
    );
  }
  return (
    <WalletProviders>
      <ForgeGame api={api} MintPanel={WalletMintPanel} demo={demoAccounts} />
    </WalletProviders>
  );
}
