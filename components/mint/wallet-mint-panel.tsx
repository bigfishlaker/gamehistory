'use client';

import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient, useSignMessage, useSwitchChain, useWriteContract } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { gamerIdCardAbi } from '@/lib/nft/abi';
import { voucherFromJson } from '@/lib/nft/voucher';
import type { MintPanelProps } from './forge-game';
import type { VoucherResponse } from './api';

type Phase = 'idle' | 'signin' | 'voucher' | 'confirm-wallet' | 'mining' | 'recording';
const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  signin: 'Sign the message in your wallet to prove it is yours…',
  voucher: 'Checking your accounts and locking your price…',
  'confirm-wallet': 'Confirm the mint in your wallet…',
  mining: 'Forging on-chain…',
  recording: 'Almost there…',
};

/** Friendly text for contract reverts and wallet errors. */
export function mintErrorText(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk(x => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    const map: Record<string, string> = {
      AlreadyHasCard: 'This wallet already has a GAMER.ID Card.',
      AccountAlreadyLinked: 'One of these game accounts is already on another card.',
      VoucherExpired: 'Your price lock expired. Try again for a fresh quote.',
      BadNonce: 'This mint was already used. Try again.',
      EnforcedPause: 'Minting is paused right now.',
    };
    if (name && map[name]) return map[name];
    if (/user (rejected|denied)/i.test(e.message)) return 'You cancelled in your wallet.';
    if (/insufficient funds/i.test(e.message)) return 'Not enough funds in this wallet for the price plus gas.';
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

export function WalletMintPanel({ api, accounts, picks, onMinted }: MintPanelProps) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof api.config>> | null>(null);
  const [quote, setQuote] = useState<{ price: string; symbol: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  const publicClient = usePublicClient({ chainId: cfg?.chainId });

  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg({ open: false }));
    api.quote().then(setQuote).catch(() => setQuote(null));
  }, [api]);

  if (!cfg) return <p className="gf-note">Loading…</p>;
  if (!cfg.open || !cfg.chainId || !cfg.contract) return <p className="gf-note">GAMER.ID Cards are not open yet. Check back soon.</p>;

  const wrongChain = isConnected && chainId !== cfg.chainId;

  async function forge() {
    if (!address || !cfg?.chainId || !cfg.contract) return;
    setError(null);
    try {
      // 1. SIWE (skipped while the session cookie is valid for this wallet)
      setPhase('signin');
      const { nonce, address: session } = await api.siweNonce();
      if (session?.toLowerCase() !== address.toLowerCase()) {
        const message = createSiweMessage({
          domain: window.location.host, address, uri: window.location.origin, version: '1', chainId: cfg.chainId, nonce,
          statement: 'Sign in to GAMER.ID to forge your card. This does not cost anything.',
          issuedAt: new Date(), expirationTime: new Date(Date.now() + 10 * 60 * 1000),
        });
        const signature = await signMessageAsync({ message });
        await api.siweVerify(message, signature);
      }
      // 2. Voucher (server checks accounts + Top 6, quotes the price, signs)
      setPhase('voucher');
      const v = voucher && voucher.voucher.to.toLowerCase() === address.toLowerCase() && Number(voucher.voucher.deadline) * 1000 > Date.now() + 60_000
        ? voucher
        : await api.voucher(accounts, picks);
      setVoucher(v);
      // 3. Mint
      setPhase('confirm-wallet');
      const mv = voucherFromJson(v.voucher);
      const hash = await writeContractAsync({ chainId: cfg.chainId, address: v.contract, abi: gamerIdCardAbi, functionName: 'mint', args: [mv, v.top6Json, v.signature], value: mv.price });
      setPhase('mining');
      await publicClient!.waitForTransactionReceipt({ hash });
      setPhase('recording');
      let card = null;
      for (let i = 0; i < 5 && !card; i++) {
        card = await api.confirm(hash).then(r => r.cards[0]).catch(() => null);
        if (!card) await new Promise(r => setTimeout(r, 1500));
      }
      onMinted(card ?? api.cardUrls('0'));
    } catch (e) {
      setError(mintErrorText(e));
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  return (
    <div className="gf-mintbox">
      <div className="gf-price">
        $5{quote && <small>≈ {Number(quote.price).toFixed(4)} {quote.symbol}</small>}
      </div>
      <div className="gf-kv"><span>Network</span><b>{cfg.chainName}</b></div>
      <div className="gf-kv"><span>Top 6</span><b>{picks.length} game{picks.length === 1 ? '' : 's'} (locked forever)</b></div>
      <div className="gf-kv"><span>Card</span><b>Soulbound · 1 per wallet</b></div>
      {!isConnected ? (
        <ConnectButton label="Connect wallet to forge" />
      ) : wrongChain ? (
        <button type="button" className="gf-btn" onClick={() => switchChainAsync({ chainId: cfg.chainId! }).catch(e => setError(mintErrorText(e)))}>
          Switch to {cfg.chainName}
        </button>
      ) : (
        <>
          <button type="button" className="gf-btn" disabled={busy || !picks.length} onClick={() => void forge()}>
            {busy ? PHASE_LABEL[phase] : `Forge my card · $5`}
          </button>
          <div className="gf-row" style={{ justifyContent: 'space-between' }}>
            <span className="gf-note">Minting to {address?.slice(0, 6)}…{address?.slice(-4)}</span>
            <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          </div>
        </>
      )}
      {error && <div className="gf-err" role="alert">{error}</div>}
      <p className="gf-note">Price is quoted in {cfg.symbol} and locked for 15 minutes. Gas on {cfg.chainName} is a fraction of a cent.</p>
    </div>
  );
}
