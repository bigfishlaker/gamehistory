'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { useState, type ReactNode } from 'react';
import { RainbowKitProvider, connectorsForWallets, darkTheme, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import type { Chain } from 'viem';
import { chainById, fuji, grotto, localFork } from '@/lib/nft/chains';

const APP_NAME = 'GAMER.ID';

function chains(): [Chain, ...Chain[]] {
  const primary = chainById(Number(process.env.NEXT_PUBLIC_NFT_CHAIN_ID)) ?? fuji;
  const others = [grotto, fuji, ...(process.env.NODE_ENV !== 'production' ? [localFork] : [])].filter(c => c.id !== primary.id);
  return [primary, ...others];
}

function makeConfig() {
  const list = chains();
  const transports = Object.fromEntries(list.map(c => [c.id, http()]));
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (projectId) {
    return getDefaultConfig({ appName: APP_NAME, projectId, chains: list, transports, ssr: true });
  }
  // No WalletConnect project id yet: browser-extension wallets only (no relay connections).
  const connectors = connectorsForWallets(
    [{ groupName: 'Browser wallet', wallets: [injectedWallet] }],
    { appName: APP_NAME, projectId: 'unset' },
  );
  return createConfig({ chains: list, transports, connectors, ssr: true });
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const [config] = useState(makeConfig);
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#7c5cff', borderRadius: 'large' })} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
