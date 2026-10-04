/**
 * GAMER.ID Forge as a standalone Grotto game (static build: index.html + app.js + app.css).
 * Same game as gamer-id.vercel.app/mint; the card is minted to the player's Grotto wallet.
 * API_BASE is baked in at build time (GROTTO_API_BASE, default https://gamer-id.vercel.app).
 */
import '../../components/mint/forge.css';
import { createRoot } from 'react-dom/client';
import { ForgeGame } from '../../components/mint/forge-game';
import { GrottoMintPanel } from '../../components/mint/grotto-mint-panel';
import { ForgeApi } from '../../components/mint/api';
import { isEmbedded, waitForGrottoRuntime } from '../../components/mint/grotto-runtime';

declare const __API_BASE__: string;

const api = new ForgeApi(__API_BASE__);
waitForGrottoRuntime()
  .then(rt => api.setAuthorization(`Bearer ${rt.sessionId}`))
  .catch(() => {
    /* outside The Grotto the forge still works up to the mint step */
  });

const root = document.getElementById('root')!;
createRoot(root).render(
  <>
    {!isEmbedded() && (
      <div style={{ background: '#2a1d00', color: '#ffd27a', padding: '8px 12px', fontSize: 13, textAlign: 'center' }}>
        Open this game on The Grotto to mint to your Grotto wallet.
      </div>
    )}
    <ForgeGame api={api} MintPanel={GrottoMintPanel} headline="Forge your GAMER.ID" />
  </>,
);
