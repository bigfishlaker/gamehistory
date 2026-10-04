'use client';

import { useEffect, useRef, useState } from 'react';
import type { MintPanelProps } from './forge-game';
import type { VoucherResponse } from './api';
import { submitGrottoScore, waitForGrottoRuntime, type GrottoRuntimeConfig } from './grotto-runtime';

/**
 * Inside The Grotto: the card goes to the player's Grotto wallet (from Grotto's own session,
 * verified by our server). Grotto games cannot ask the embedded wallet to pay (the host relay
 * forces value = 0 and caps gas at 100k), so payment happens on a GAMER.ID page with any wallet.
 */
export function GrottoMintPanel({ api, accounts, picks, library, onMinted }: MintPanelProps) {
  const [rt, setRt] = useState<GrottoRuntimeConfig | null>(null);
  const [player, setPlayer] = useState<{ wallet: string; displayName: string | null; tokenId: string | null } | null>(null);
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;
    waitForGrottoRuntime()
      .then(async r => {
        if (cancelled) return;
        api.setAuthorization(`Bearer ${r.sessionId}`);
        setRt(r);
        const p = await api.grottoSession();
        if (!cancelled) setPlayer(p);
      })
      .catch(e => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Poll for the mint once a voucher exists (the payment happens in another tab/device).
  useEffect(() => {
    if (!voucher) return;
    const id = window.setInterval(async () => {
      const p = await api.grottoSession().catch(() => null);
      if (p?.tokenId && !done.current) {
        done.current = true;
        window.clearInterval(id);
        if (rt) void submitGrottoScore(rt, Math.floor(library.totalMinutes / 60), 'hours', { tokenId: p.tokenId });
        onMinted(api.cardUrls(p.tokenId));
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [voucher, api, rt, library.totalMinutes, onMinted]);

  if (error) return <div className="gf-err" role="alert">{error}</div>;
  if (!rt || !player) return <p className="gf-note">Connecting to The Grotto…</p>;
  if (player.tokenId) {
    return (
      <div className="gf-mintbox">
        <p>You already have GAMER.ID #{player.tokenId.padStart(6, '0')} on this Grotto wallet.</p>
        <button type="button" className="gf-btn" onClick={() => onMinted(api.cardUrls(player.tokenId!))}>Show my card</button>
      </div>
    );
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      setVoucher(await api.voucher(accounts, picks));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gf-mintbox">
      <span className="gf-pill">Grotto wallet {player.wallet.slice(0, 6)}…{player.wallet.slice(-4)}</span>
      <div className="gf-price">$5{voucher && <small>= {Number(voucher.price).toFixed(4)} {voucher.symbol}</small>}</div>
      <div className="gf-kv"><span>Card goes to</span><b>your Grotto wallet</b></div>
      <div className="gf-kv"><span>Top 6</span><b>{picks.length} (locked forever)</b></div>
      {!voucher ? (
        <button type="button" className="gf-btn" disabled={busy || !picks.length} onClick={() => void prepare()}>
          {busy ? 'Locking your price…' : 'Forge my card · $5'}
        </button>
      ) : (
        <>
          <a className="gf-btn" href={voucher.payUrl} target="_blank" rel="noopener noreferrer">Pay with a wallet →</a>
          <p className="gf-note">
            Opens GAMER.ID in a new tab. Pay from any wallet on {voucher.chainId === 36463 ? 'The Grotto' : 'the test network'} (or send the link to your phone):{' '}
            <span className="gf-link">{voucher.payUrl}</span>. This screen updates by itself when your card is forged.
          </p>
        </>
      )}
      {error && <div className="gf-err" role="alert">{error}</div>}
    </div>
  );
}
