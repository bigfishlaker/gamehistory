'use client';

import { useEffect, useMemo, useState, type ComponentType, type DragEvent } from 'react';
import type { LibraryGame, LibraryResponse } from '@/lib/nft/library';
import { nextTier, tierForHours } from '@/lib/nft/tier';
import { buildXIntentUrl } from '@/lib/share';
import { HoloCard, type HoloCardGame } from './holo-card';
import type { AccountsInput, ForgeApi, MintedCard } from './api';

export interface MintPanelProps {
  api: ForgeApi;
  accounts: AccountsInput;
  picks: string[];
  library: LibraryResponse;
  onMinted: (card: MintedCard) => void;
}

type PlatformId = keyof AccountsInput;
const PLATFORMS: Array<{ id: PlatformId; name: string; hint: string; color: string; placeholder: string }> = [
  { id: 'xbox', name: 'Xbox', hint: 'Gamertag', color: '#22c55e', placeholder: 'Gamertag' },
  { id: 'steam', name: 'Steam', hint: 'Profile link or ID', color: '#60a5fa', placeholder: 'steamcommunity.com/id/…' },
  { id: 'psn', name: 'PlayStation', hint: 'Online ID', color: '#3b82f6', placeholder: 'Online ID' },
  { id: 'epic', name: 'Epic / Fortnite', hint: 'Display name', color: '#e5e7eb', placeholder: 'Epic display name' },
];
const EMPTY: AccountsInput = { xbox: [], steam: [], psn: [], epic: [] };
const STEPS = ['Platforms', 'Top 6', 'Forge', 'Reveal'] as const;

/** Prefill from the accounts the visitor already uses on GAMER.ID (browser storage, same origin only). */
function savedAccounts(): Partial<Record<PlatformId, string>> {
  try {
    const raw = window.localStorage.getItem('gamerid:accounts:current:v1');
    const set = raw ? (JSON.parse(raw) as { accounts?: Array<{ platform: string; identifier: string }> }) : null;
    const out: Partial<Record<PlatformId, string>> = {};
    for (const a of set?.accounts ?? []) {
      if (['xbox', 'steam', 'psn', 'epic'].includes(a.platform) && typeof a.identifier === 'string' && !out[a.platform as PlatformId]) {
        out[a.platform as PlatformId] = a.identifier.slice(0, 100);
      }
    }
    return out;
  } catch {
    return {};
  }
}

const hours = (m: number) => Math.floor(m / 60);

/**
 * "Forge your ID": pick platforms -> drag your Top 6 into the slots -> forge (mint) -> reveal.
 * Host-agnostic: GAMER.ID passes a wallet MintPanel, the Grotto build a Grotto one.
 */
export function ForgeGame({ api, MintPanel, headline = 'Forge your GAMER.ID', demo }: {
  api: ForgeApi;
  MintPanel: ComponentType<MintPanelProps>;
  headline?: string;
  /** Start with these accounts filled in and loaded (used for demos/screenshots). */
  demo?: Partial<Record<PlatformId, string>>;
}) {
  const [step, setStep] = useState(0);
  const [on, setOn] = useState<Record<PlatformId, boolean>>({ xbox: false, steam: false, psn: false, epic: false });
  const [ids, setIds] = useState<Record<PlatformId, string>>({ xbox: '', steam: '', psn: '', epic: '' });
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>(Array(6).fill(null));
  const [over, setOver] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    const pre = demo ?? savedAccounts();
    const keys = Object.keys(pre) as PlatformId[];
    if (!keys.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from browser storage
    setOn(o => ({ ...o, ...Object.fromEntries(keys.map(k => [k, true])) }));
    setIds(v => ({ ...v, ...pre }));
  }, [demo]);

  const accounts: AccountsInput = useMemo(() => {
    const a: AccountsInput = { ...EMPTY, xbox: [], steam: [], psn: [], epic: [] };
    (Object.keys(on) as PlatformId[]).forEach(p => {
      if (on[p] && ids[p].trim()) a[p] = [ids[p].trim()];
    });
    return a;
  }, [on, ids]);
  const accountCount = Object.values(accounts).reduce((n, l) => n + l.length, 0);

  const byKey = useMemo(() => new Map((library?.games ?? []).map(g => [g.key, g])), [library]);
  const picks = slots.filter((s): s is string => !!s);
  const cardGames: (HoloCardGame | undefined)[] = slots.map(k => {
    const g = k ? byKey.get(k) : undefined;
    return g ? { title: g.title, cover: g.cover, hours: hours(g.minutes) } : undefined;
  });

  async function loadLibrary() {
    setLoading(true);
    setError(null);
    try {
      const lib = await api.library(accounts);
      setLibrary(lib);
      setSlots(Array(6).fill(null));
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const place = (key: string, index?: number) => {
    setSlots(prev => {
      const next = [...prev];
      const from = next.indexOf(key);
      const target = index ?? next.indexOf(null);
      if (target < 0) return prev;
      if (from >= 0) next[from] = next[target];
      next[target] = key;
      return next;
    });
  };
  const remove = (i: number) => setSlots(prev => prev.map((s, j) => (j === i ? null : s)));
  const autofill = () => setSlots((library?.games ?? []).slice(0, 6).map(g => g.key).concat(Array(6).fill(null)).slice(0, 6));

  const onDragStart = (e: DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = (e: DragEvent, i: number) => {
    e.preventDefault();
    setOver(null);
    const key = e.dataTransfer.getData('text/plain');
    if (key && byKey.has(key)) place(key, i);
  };

  const totalHours = hours(library?.totalMinutes ?? 0);
  const tier = tierForHours(totalHours);
  const nt = nextTier(totalHours);

  const handleMinted = (card: MintedCard) => {
    setMinted(card);
    setStep(3);
    setRevealed(false);
    window.setTimeout(() => setRevealed(true), 700);
  };

  const shareText = `I just forged my GAMER.ID: ${totalHours.toLocaleString('en-US')} hours, ${tier.name} tier. My Top 6 is locked in forever 👇`;

  return (
    <div className="gf-root">
      <div className="gf-wrap">
        <div className="gf-top">
          <div className="gf-brand">GAMER.ID · FORGE</div>
          <div className="gf-steps" aria-label="Progress">
            {STEPS.map((s, i) => (
              <span key={s} className={`gf-step${i === step ? ' is-on' : i < step ? ' is-done' : ''}`}>{i + 1}. {s}</span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <section>
            <h1 className="gf-h1">{headline}</h1>
            <p className="gf-sub">Pick your platforms, drag your all-time Top 6 into the slots and forge a soulbound holo card. Your Top 6 is locked forever; your hours and tier keep levelling up.</p>
            <div className="gf-panel">
              <div className="gf-platforms">
                {PLATFORMS.map(p => (
                  <button key={p.id} type="button" className={`gf-plat${on[p.id] ? ' is-on' : ''}`} style={{ ['--gf-plat' as string]: p.color }} onClick={() => setOn(o => ({ ...o, [p.id]: !o[p.id] }))} aria-pressed={on[p.id]}>
                    {p.name}
                    <small>{on[p.id] ? 'Selected' : p.hint}</small>
                  </button>
                ))}
              </div>
              {PLATFORMS.filter(p => on[p.id]).map(p => (
                <div className="gf-field" key={p.id}>
                  <label htmlFor={`gf-${p.id}`}>{p.name}</label>
                  <input id={`gf-${p.id}`} className="gf-input" placeholder={p.placeholder} value={ids[p.id]} maxLength={120} onChange={e => setIds(v => ({ ...v, [p.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && accountCount) void loadLibrary(); }} />
                </div>
              ))}
              <div className="gf-row" style={{ marginTop: 12 }}>
                <button type="button" className="gf-btn" disabled={!accountCount || loading} onClick={() => void loadLibrary()}>
                  {loading ? 'Loading your history…' : 'Load my library'}
                </button>
                <span className="gf-note">Public profiles only. Each game account can back one card at a time.</span>
              </div>
              {error && <div className="gf-err" role="alert">{error}</div>}
            </div>
          </section>
        )}

        {step === 1 && library && (
          <section className="gf-grid2">
            <div>
              <h1 className="gf-h1">Choose your Top 6</h1>
              <p className="gf-sub">Drag games into the slots (or tap to add). Slot 1 gets the gold border. This can never be changed after you forge.</p>
              <div className="gf-slots">
                {slots.map((key, i) => {
                  const g = key ? byKey.get(key) : undefined;
                  return (
                    <div
                      key={i}
                      className={`gf-slot${g ? ' is-filled' : ''}${over === i ? ' is-over' : ''}`}
                      onDragOver={e => { e.preventDefault(); setOver(i); }}
                      onDragLeave={() => setOver(o => (o === i ? null : o))}
                      onDrop={e => onDrop(e, i)}
                      draggable={!!g}
                      onDragStart={e => g && onDragStart(e, g.key)}
                      aria-label={g ? `Slot ${i + 1}: ${g.title}` : `Empty slot ${i + 1}`}
                    >
                      {g ? (
                        <>
                          {g.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={g.cover} alt="" />
                          ) : <span>{g.title.slice(0, 1)}</span>}
                          <span className="gf-slot-n">{i + 1}</span>
                          <button type="button" className="gf-slot-x" onClick={() => remove(i)} aria-label={`Remove ${g.title}`}>×</button>
                          <span className="gf-slot-t">{g.title}</span>
                        </>
                      ) : (
                        i + 1
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="gf-row" style={{ marginBottom: 12 }}>
                <button type="button" className="gf-btn is-ghost" onClick={autofill}>Auto-fill most played</button>
                <button type="button" className="gf-btn is-ghost" onClick={() => setStep(0)}>Change accounts</button>
                <button type="button" className="gf-btn" disabled={picks.length === 0} onClick={() => setStep(2)}>
                  {picks.length === 6 ? 'Forge this card →' : `Continue with ${picks.length} game${picks.length === 1 ? '' : 's'} →`}
                </button>
              </div>
              <div className="gf-lib">
                {library.games.map((g: LibraryGame) => (
                  <button
                    key={g.key}
                    type="button"
                    className={`gf-game${slots.includes(g.key) ? ' is-picked' : ''}`}
                    draggable
                    onDragStart={e => onDragStart(e, g.key)}
                    onClick={() => (slots.includes(g.key) ? remove(slots.indexOf(g.key)) : place(g.key))}
                    title={g.title}
                  >
                    {g.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.cover} alt="" loading="lazy" />
                    ) : <div className="gf-noimg">{g.title.slice(0, 1)}</div>}
                    <div className="gf-gt">{g.title}</div>
                    <div className="gf-gh">{hours(g.minutes).toLocaleString('en-US')}h</div>
                  </button>
                ))}
              </div>
              {library.errors.length > 0 && <p className="gf-note">Note: {library.errors[0]}</p>}
            </div>
            <aside>
              <HoloCard displayName={library.displayName} totalHours={totalHours} gameCount={library.gameCount} platforms={library.platforms} games={cardGames} />
              <p className="gf-note" style={{ textAlign: 'center', marginTop: 14 }}>
                {tier.name} tier{nt ? ` · ${nt.hoursLeft.toLocaleString('en-US')}h to ${nt.tier.name}` : ' · max tier'}
              </p>
            </aside>
          </section>
        )}

        {step === 2 && library && (
          <section className="gf-grid2">
            <div className="gf-center" style={{ alignItems: 'stretch', textAlign: 'left' }}>
              <h1 className="gf-h1">Forge it</h1>
              <p className="gf-sub">Your card is soulbound to your wallet (one per wallet). Hours, games and tier update from GAMER.ID; the Top 6 is locked in at mint.</p>
              <div className="gf-panel">
                <MintPanel api={api} accounts={accounts} picks={picks} library={library} onMinted={handleMinted} />
              </div>
              <div className="gf-row">
                <button type="button" className="gf-btn is-ghost" onClick={() => setStep(1)}>← Back to Top 6</button>
              </div>
            </div>
            <aside>
              <HoloCard displayName={library.displayName} totalHours={totalHours} gameCount={library.gameCount} platforms={library.platforms} games={cardGames} />
            </aside>
          </section>
        )}

        {step === 3 && library && minted && (
          <section className="gf-center">
            <h1 className="gf-h1">{revealed ? `GAMER.ID #${minted.tokenId.padStart(6, '0')}` : 'Forging…'}</h1>
            <div style={{ position: 'relative' }}>
              <div className={`gf-flip${revealed ? ' is-revealed' : ''}`}>
                <div className="gf-face"><div className="gf-cardback">GAMER.ID</div></div>
                <div className="gf-face is-back">
                  {imgOk ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={minted.image} alt="Your GAMER.ID card" style={{ width: '100%', height: '100%', borderRadius: 22 }} onError={() => setImgOk(false)} />
                  ) : (
                    <HoloCard displayName={library.displayName} totalHours={totalHours} gameCount={library.gameCount} platforms={library.platforms} games={cardGames} serial={`#${minted.tokenId.padStart(6, '0')}`} />
                  )}
                </div>
              </div>
              <div className="gf-burst" />
            </div>
            {revealed && (
              <div className="gf-row" style={{ justifyContent: 'center' }}>
                <a className="gf-btn is-x" href={buildXIntentUrl(shareText, minted.cardUrl)} target="_blank" rel="noopener noreferrer">Share on X</a>
                <a className="gf-btn is-ghost" href={minted.cardUrl} target="_blank" rel="noopener noreferrer">View card page</a>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
