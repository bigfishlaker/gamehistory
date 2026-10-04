'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeFunctionData, erc20Abi } from 'viem';
import type { MintPanelProps } from './forge-game';
import type { ForgeApi, MintConfigResponse, VoucherResponse } from './api';
import { submitGrottoScore, waitForGrottoRuntime, type GrottoRuntimeConfig } from './grotto-runtime';
import { ERC20_APPROVE_SELECTOR, fetchRelayPolicy, policyAllows, RelayError, requestGrottoTx, type RelayPolicy } from './grotto-relay';
import { discoverWallets, payNativeMint, walletErrorMessage, type InjectedWallet } from './injected-wallet';

type Method = 'grotto' | 'wallet' | 'link';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Retries `confirm` until the mint tx is mined (TX_PENDING -> 404). */
async function confirmWhenMined(api: ForgeApi, txHash: string, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const { cards } = await api.confirm(txHash);
      if (cards[0]) return cards[0];
    } catch (e) {
      if ((e as { code?: string }).code !== 'TX_PENDING') throw e;
    }
    await sleep(2500);
  }
  throw new Error('Still waiting for the network. Your card will appear here once the transaction lands.');
}

/**
 * Pay + mint inside The Grotto. The card always goes to the player's Grotto wallet (from Grotto's
 * own session, verified by our server). Three ways to pay, best first:
 *  1. Grotto wallet: one zero-value USDC `approve` through the Grotto host transaction relay, then
 *     our gas-only relayer calls `mintWithAllowance`. Needs a Grotto-approved relay policy for this
 *     build (the relay refuses value transfers and caps gas at 100k, so `mint` itself can't go through it).
 *  2. A browser wallet available inside the game frame (EIP-6963 / window.ethereum): `mint` + HERESY.
 *  3. Pay link: any wallet on another tab or device; this screen polls until the card exists.
 */
export function GrottoMintPanel({ api, accounts, picks, library, onMinted }: MintPanelProps) {
  const [rt, setRt] = useState<GrottoRuntimeConfig | null>(null);
  const [player, setPlayer] = useState<{ wallet: string; displayName: string | null; tokenId: string | null } | null>(null);
  const [cfg, setCfg] = useState<MintConfigResponse | null>(null);
  const [policy, setPolicy] = useState<RelayPolicy | null>(null);
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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
        const [p, c, pol, ws] = await Promise.all([
          api.grottoSession(),
          api.config().catch(() => ({ open: false }) as MintConfigResponse),
          fetchRelayPolicy(r),
          discoverWallets(),
        ]);
        if (cancelled) return;
        setPlayer(p);
        setCfg(c);
        setPolicy(pol);
        setWallets(ws);
      })
      .catch(e => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const finish = useCallback((tokenId: string) => {
    if (done.current) return;
    done.current = true;
    if (rt) void submitGrottoScore(rt, Math.floor(library.totalMinutes / 60), 'hours', { tokenId });
    onMinted(api.cardUrls(tokenId));
  }, [api, rt, library.totalMinutes, onMinted]);

  // Whatever the method, poll Grotto-session once a voucher exists (covers pay-link and slow confirms).
  useEffect(() => {
    if (!voucher) return;
    const id = window.setInterval(async () => {
      const p = await api.grottoSession().catch(() => null);
      if (p?.tokenId) {
        window.clearInterval(id);
        finish(p.tokenId);
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [voucher, api, finish]);

  if (error && !player) return <div className="gf-err" role="alert">{error}</div>;
  if (!rt || !player || !cfg) return <p className="gf-note">Connecting to The Grotto…</p>;
  if (player.tokenId) {
    return (
      <div className="gf-mintbox">
        <p>You already have GAMER.ID #{player.tokenId.padStart(6, '0')} on this Grotto wallet.</p>
        <button type="button" className="gf-btn" onClick={() => onMinted(api.cardUrls(player.tokenId!))}>Show my card</button>
      </div>
    );
  }

  const token = cfg.payToken ?? null;
  const grottoPayReady = !!(token && cfg.relay && policyAllows(policy, token.address, ERC20_APPROVE_SELECTOR));

  async function run(m: Method, wallet?: InjectedWallet) {
    setBusy(true);
    setError(null);
    setMethod(m);
    try {
      setStatus('Locking your price…');
      const v = await api.voucher(accounts, picks, m === 'grotto' ? 'token' : 'native');
      setVoucher(v);
      if (m === 'link') {
        setStatus(null);
        return;
      }
      if (m === 'grotto') {
        setStatus(`Approve ${v.price} ${v.symbol} in your Grotto wallet…`);
        const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [v.contract, BigInt(v.voucher.price)] });
        await requestGrottoTx({ to: v.voucher.payToken, data }, {
          chainId: v.chainId,
          onStatus: s => s === 'sent' && setStatus('Approval sent. Forging your card…'),
        });
        let txHash: string | null = null;
        for (let i = 0; i < 30 && !txHash; i++) {
          try {
            txHash = (await api.relayMint(v.id)).txHash;
          } catch (e) {
            if ((e as { code?: string }).code !== 'ALLOWANCE_PENDING') throw e;
            await sleep(2000);
          }
        }
        if (!txHash) throw new Error('Your approval has not landed yet. This screen keeps checking.');
        setStatus('Forging your card…');
        finish((await confirmWhenMined(api, txHash)).tokenId);
        return;
      }
      if (!wallet) throw new Error('Pick a wallet');
      setStatus(`Confirm the payment in ${wallet.name}…`);
      const txHash = await payNativeMint(wallet, {
        chainId: v.chainId, chainName: cfg!.chainName ?? 'The Grotto', symbol: cfg!.symbol ?? v.symbol, rpcUrl: cfg!.rpcUrl ?? '', explorer: cfg!.explorer ?? null,
      }, v);
      setStatus('Payment sent. Forging your card…');
      finish((await confirmWhenMined(api, txHash)).tokenId);
    } catch (e) {
      setStatus(null);
      setError(e instanceof RelayError
        ? (e.code === 'rejected' ? 'You cancelled in your Grotto wallet.' : e.code === 'insufficient_funds' ? `Not enough ${token?.symbol ?? 'funds'} or gas in your Grotto wallet.` : e.message)
        : m === 'wallet' ? walletErrorMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const priceLine = voucher ? <small>= {Number(voucher.price).toFixed(voucher.pay === 'token' ? 2 : 4)} {voucher.symbol}</small> : null;
  return (
    <div className="gf-mintbox">
      <span className="gf-pill">Grotto wallet {player.wallet.slice(0, 6)}…{player.wallet.slice(-4)}</span>
      <div className="gf-price">$5{priceLine}</div>
      <div className="gf-kv"><span>Card goes to</span><b>your Grotto wallet</b></div>
      <div className="gf-kv"><span>Top 6</span><b>{picks.length} (locked forever)</b></div>

      {status && <p className="gf-note" role="status">{status}</p>}

      {!busy && !(method === 'link' && voucher) && (
        <div className="gf-paylist">
          {grottoPayReady ? (
            <button type="button" className="gf-btn" disabled={!picks.length} onClick={() => void run('grotto')}>
              Pay $5 {token!.symbol} with my Grotto wallet
            </button>
          ) : (
            <p className="gf-note">Paying straight from your Grotto wallet is not switched on for this game yet.</p>
          )}
          {wallets.map(w => (
            <button key={w.id} type="button" className={grottoPayReady ? 'gf-btn is-ghost' : 'gf-btn'} disabled={!picks.length} onClick={() => void run('wallet', w)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI wallet icon */}
              {w.icon && <img src={w.icon} alt="" width={18} height={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />}
              Pay with {w.name}
            </button>
          ))}
          <button type="button" className="gf-btn is-ghost" disabled={!picks.length} onClick={() => void run('link')}>
            Pay from another tab or phone
          </button>
        </div>
      )}

      {method === 'link' && voucher && (
        <>
          <a className="gf-btn" href={voucher.payUrl} target="_blank" rel="noopener noreferrer">Open the pay page →</a>
          <p className="gf-note">
            Pay from any wallet on {voucher.chainId === 36463 ? 'The Grotto' : 'the test network'} (or send the link to your phone):{' '}
            <span className="gf-link">{voucher.payUrl}</span>. This screen updates by itself when your card is forged.
          </p>
        </>
      )}
      {error && <div className="gf-err" role="alert">{error}</div>}
    </div>
  );
}
