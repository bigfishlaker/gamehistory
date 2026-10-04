'use client';

import '@/components/mint/forge.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { gamerIdCardAbi } from '@/lib/nft/abi';
import { voucherFromJson, type MintVoucherJson } from '@/lib/nft/voucher';
import type { Top6Entry } from '@/lib/nft/top6';
import type { CardSnapshot } from '@/lib/nft/mint-service';
import { chainById } from '@/lib/nft/chains';
import { WalletProviders } from '@/components/mint/wallet-providers';
import { HoloCard } from '@/components/mint/holo-card';
import { mintErrorText } from '@/components/mint/wallet-mint-panel';

interface PayVoucher {
  id: string; chainId: number; contract: `0x${string}`; voucher: MintVoucherJson; top6Json: string; top6: Top6Entry[];
  signature: `0x${string}`; price: string; symbol: string; snapshot: CardSnapshot; expiresAt: number;
}

function Pay({ id }: { id: string }) {
  const [v, setV] = useState<PayVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'wallet' | 'mining' | 'done'>('idle');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: v?.chainId });
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, []);

  useEffect(() => {
    fetch(`/api/nft/voucher/${encodeURIComponent(id)}`).then(async r => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'This link has expired');
      setV(b);
    }).catch(e => setError((e as Error).message));
  }, [id]);

  async function pay() {
    if (!v) return;
    setError(null);
    try {
      setStatus('wallet');
      const mv = voucherFromJson(v.voucher);
      const hash = await writeContractAsync({ chainId: v.chainId, address: v.contract, abi: gamerIdCardAbi, functionName: 'mint', args: [mv, v.top6Json, v.signature], value: mv.price });
      setStatus('mining');
      await client!.waitForTransactionReceipt({ hash });
      const r = await fetch('/api/nft/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: hash }) }).then(x => x.json()).catch(() => null);
      setTokenId(r?.cards?.[0]?.tokenId ?? null);
      setStatus('done');
    } catch (e) {
      setError(mintErrorText(e));
      setStatus('idle');
    }
  }

  const chain = v ? chainById(v.chainId) : undefined;
  const expired = v && now ? v.expiresAt < now : false;
  return (
    <div className="gf-root">
      <div className="gf-wrap gf-grid2">
        <div>
          <div className="gf-brand">GAMER.ID · PAY FOR A CARD</div>
          <h1 className="gf-h1">{status === 'done' ? 'Card forged!' : 'Pay for a GAMER.ID Card'}</h1>
          {error && <div className="gf-err" role="alert">{error}</div>}
          {v && (
            <div className="gf-panel gf-mintbox">
              <div className="gf-price">{Number(v.price).toFixed(4)} {v.symbol}<small>($5)</small></div>
              <div className="gf-kv"><span>Card goes to</span><b>{v.voucher.to.slice(0, 8)}…{v.voucher.to.slice(-6)}</b></div>
              <div className="gf-kv"><span>Network</span><b>{chain?.name ?? v.chainId}</b></div>
              <div className="gf-kv"><span>Price locked until</span><b>{new Date(v.expiresAt).toLocaleTimeString()}</b></div>
              {status === 'done' ? (
                <>
                  <p>Done. Head back to The Grotto: your card appears there in a few seconds.</p>
                  {tokenId && <Link className="gf-btn is-ghost" href={`/mint/card/${tokenId}`}>View card #{tokenId.padStart(6, '0')}</Link>}
                </>
              ) : expired ? (
                <p className="gf-err">This price lock expired. Start again in the game to get a fresh one.</p>
              ) : !isConnected ? (
                <ConnectButton label="Connect a wallet to pay" />
              ) : chainId !== v.chainId ? (
                <button type="button" className="gf-btn" onClick={() => switchChainAsync({ chainId: v.chainId }).catch(e => setError(mintErrorText(e)))}>Switch to {chain?.name}</button>
              ) : (
                <button type="button" className="gf-btn" disabled={status !== 'idle'} onClick={() => void pay()}>
                  {status === 'wallet' ? 'Confirm in your wallet…' : status === 'mining' ? 'Forging…' : `Pay ${Number(v.price).toFixed(4)} ${v.symbol}`}
                </button>
              )}
              <p className="gf-note">Anyone can pay; the card is always minted to the wallet above and is soulbound.</p>
            </div>
          )}
        </div>
        <aside>
          {v && (
            <HoloCard displayName={v.snapshot.displayName} totalHours={Math.floor(v.snapshot.totalMinutes / 60)} gameCount={v.snapshot.gameCount} platforms={v.snapshot.platforms} games={v.top6.map(g => ({ title: g.t, cover: g.c, hours: g.h }))} />
          )}
        </aside>
      </div>
    </div>
  );
}

export function PayClient({ id }: { id: string }) {
  return (
    <WalletProviders>
      <Pay id={id} />
    </WalletProviders>
  );
}
