'use client';

import { useState } from 'react';
import type { Platform } from '@/lib/types';

interface PlatformHelpModalProps {
  platform: Platform;
  isOpen: boolean;
  onClose: () => void;
}

export function PlatformHelpModal({ platform, isOpen, onClose }: PlatformHelpModalProps) {
  if (!isOpen) return null;

  const guides = {
    steam: {
      title: 'How to Find Your Steam ID',
      steps: [
        {
          number: 1,
          title: 'Open Your Steam Profile',
          description: 'Visit your profile in the Steam app or on steamcommunity.com',
        },
        {
          number: 2,
          title: 'Find Your ID in the URL',
          description: 'Look at the address bar. You\'ll see either:\n• /profiles/76561198XXXXXXXXX (17-digit SteamID64)\n• /id/yourcustomname (custom URL)',
        },
        {
          number: 3,
          title: 'Copy the ID or Full URL',
          description: 'Paste either format into the search field. Both work!',
        },
        {
          number: 4,
          title: 'Set Game Details to Public',
          description: 'Settings → Privacy Settings → "Game details" = Public\nThis is needed for playtime hours to show.',
        },
      ],
    },
    xbox: {
      title: 'How to Find Your Xbox Gamertag',
      steps: [
        {
          number: 1,
          title: 'Open Your Xbox Profile',
          description: 'Find it in the Xbox app, on xbox.com, or on your console',
        },
        {
          number: 2,
          title: 'Look for Your Gamertag',
          description: 'Your gamertag is displayed prominently on your profile',
        },
        {
          number: 3,
          title: 'Include the Number Suffix',
          description: 'If your gamertag has a #1234 suffix, include it!\nExample: PlayerName#5678',
        },
      ],
    },
    epic: {
      title: 'How to Find Your Epic Display Name (Fortnite)',
      steps: [
        {
          number: 1,
          title: 'Find Your Display Name',
          description: 'Fortnite: open the main menu, your name is shown at the top right\nepicgames.com: Account → Account Settings → Display Name',
        },
        {
          number: 2,
          title: 'Enter It Exactly',
          description: 'Use your Epic display name (not your email). Spaces and symbols count.',
        },
        {
          number: 3,
          title: 'Make Your Stats Public',
          description: 'Fortnite: Settings → Account and Privacy → turn on "Show on Career Leaderboard"\nStats come from fortnite-api.com (unofficial) and cover Battle Royale only.',
        },
      ],
    },
    psn: {
      title: 'How to Find Your PSN Online ID',
      steps: [
        {
          number: 1,
          title: 'Find Your Online ID',
          description: 'PS5: Settings → Users and Accounts → Account → Profile\nPlayStation App: Tap your profile icon\nplaystation.com: View your profile',
        },
        {
          number: 2,
          title: 'Copy Your Online ID',
          description: 'Your Online ID is displayed at the top of your profile',
        },
        {
          number: 3,
          title: 'Set Gaming History to Public',
          description: 'For playtime to show, set:\nPrivacy Settings → Gaming History / Games → Anyone',
        },
      ],
    },
  };

  const guide = guides[platform];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{guide.title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Privacy Reassurance */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100 mb-1">This is safe</p>
                <p className="text-sm text-zinc-400">
                  You never sign in or give us a password. We only use your public username or ID to read what your platform already shows publicly.
                </p>
              </div>
            </div>
          </div>

          {/* Platform Mockup */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-6">
            {platform === 'steam' && <SteamMockup />}
            {platform === 'xbox' && <XboxMockup />}
            {platform === 'psn' && <PSNMockup />}
          </div>

          {/* Steps */}
          <div className="space-y-6">
            {guide.steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex-shrink-0 w-7 h-7 rounded-full border border-zinc-700 text-zinc-300 font-medium flex items-center justify-center text-xs tabular-nums">
                  {step.number}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-1">{step.title}</h3>
                  <p className="text-sm text-zinc-400 whitespace-pre-line">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Privacy Note */}
          <div className="pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-400">
              <span className="font-medium">Privacy:</span> Nothing is stored permanently. We temporarily cache public data to reduce API calls, but your profile and games remain on your platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SteamMockup() {
  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-400 mb-2">Steam Profile URL (stylized mockup)</div>
      <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-sm">
        <span className="text-zinc-400">steamcommunity.com</span>
        <span className="text-emerald-400 font-semibold relative">
          /profiles/76561198012345678
          <svg className="absolute -right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
          </svg>
          <span className="absolute -bottom-6 left-0 text-xs text-emerald-400 whitespace-nowrap">17-digit SteamID64</span>
        </span>
      </div>
      <div className="text-center text-zinc-400 text-xs">or</div>
      <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-sm">
        <span className="text-zinc-400">steamcommunity.com</span>
        <span className="text-emerald-400 font-semibold relative">
          /id/yourcustomname
          <svg className="absolute -right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
          </svg>
          <span className="absolute -bottom-6 left-0 text-xs text-emerald-400 whitespace-nowrap">Custom URL</span>
        </span>
      </div>
    </div>
  );
}

function XboxMockup() {
  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-400 mb-2">Xbox Profile (stylized mockup)</div>
      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-zinc-700" />
          <div>
            <div className="relative inline-block">
              <div className="text-white font-semibold text-lg">PlayerName#5678</div>
              <div className="absolute -inset-1 border border-emerald-500/70 rounded" />
              <svg className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="absolute -bottom-6 left-0 text-xs text-emerald-400 whitespace-nowrap">Your gamertag</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-zinc-400 mt-4">Include the #number suffix if present</div>
      </div>
    </div>
  );
}

function PSNMockup() {
  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-400 mb-2">PlayStation Profile (stylized mockup)</div>
      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-zinc-700" />
          <div>
            <div className="relative inline-block">
              <div className="text-white font-semibold text-lg">YourPSNName</div>
              <div className="absolute -inset-1 border border-emerald-500/70 rounded" />
              <svg className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="absolute -bottom-6 left-0 text-xs text-emerald-400 whitespace-nowrap">Online ID</span>
            </div>
            <div className="text-xs text-zinc-400 mt-5">Settings → Users and Accounts → Profile</div>
          </div>
        </div>
      </div>
    </div>
  );
}
