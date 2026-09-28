'use client';

import { useState } from 'react';

interface PlaytimeInfoTooltipProps {
  isLegacy?: boolean;
}

export function PlaytimeInfoTooltip({ isLegacy = false }: PlaytimeInfoTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const message = isLegacy
    ? 'Xbox 360 and older titles never recorded playtime data.'
    : 'Hours may be incomplete for older games. Xbox 360 and older titles never recorded playtime, and some platforms only report partial history.';

  return (
    <div className="relative inline-block">
      {/* Not a button: it sits inside a clickable game card (no nested controls). The
          explanation is exposed to screen readers via the label and shown on hover. */}
      <span
        role="img"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center justify-center text-zinc-400"
        aria-label={`Playtime information: ${message}`}
      >
        <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 z-50 pointer-events-none">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 shadow-lg">
            {message}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-zinc-800"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
