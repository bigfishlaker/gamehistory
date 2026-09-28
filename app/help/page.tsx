import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help: find your Xbox, Steam and PSN IDs',
  description: 'How to find your Xbox gamertag, SteamID64 or custom URL, and PSN Online ID, and how to make a private Steam profile public.',
};


export default function HelpPage() {
  return (
    <div className="flex-1">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-3">How to Find Your Gaming IDs</h1>
          <p className="text-base text-zinc-400">
            Follow these guides to locate your platform identifiers and set privacy settings for full profile access.
          </p>
        </div>

        {/* Privacy Reassurance */}
        <div className="card p-6 mb-4">
          <div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 mb-2">This is safe</h2>
              <p className="text-zinc-300 mb-3">
                You never sign in or give us a password. We only use your public username or ID to read what your platform already shows publicly.
              </p>
              <p className="text-sm text-zinc-400">
                <span className="font-medium">Privacy:</span> Nothing is stored permanently. We temporarily cache public data to reduce API calls, but your profile and games remain on your platform.
              </p>
            </div>
          </div>
        </div>

        {/* Playtime Accuracy Note */}
        <div className="card p-6 mb-12">
          <div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 mb-2">About Playtime Hours</h2>
              <p className="text-zinc-300 mb-3">
                Hours may be incomplete for older games. Xbox 360 and older titles never recorded playtime, so those show as &quot;Playtime unknown&quot; and aren&apos;t counted in totals.
              </p>
              <p className="text-sm text-zinc-400">
                Some platforms also only report partial history. This is a limitation of the gaming platform APIs, not GAMER.ID.
              </p>
            </div>
          </div>
        </div>

        {/* Platform Guides */}
        <div className="space-y-12">
          {/* Steam Guide */}
          <section className="card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Steam</h2>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-5 mb-6">
              <div className="text-xs text-zinc-400 mb-3">Steam Profile URL Example</div>
              <div className="space-y-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 font-mono text-sm break-all">
                  <span className="text-zinc-400">steamcommunity.com</span>
                  <span className="text-zinc-100 font-semibold">/profiles/76561198012345678</span>
                </div>
                <div className="text-center text-zinc-400 text-xs">or</div>
                <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 font-mono text-sm break-all">
                  <span className="text-zinc-400">steamcommunity.com</span>
                  <span className="text-zinc-100 font-semibold">/id/yourcustomname</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Step number={1} title="Open Your Steam Profile">
                Visit your profile in the Steam app or on <span className="text-zinc-100">steamcommunity.com</span>
              </Step>
              <Step number={2} title="Find Your ID in the URL">
                Look at the address bar. You&apos;ll see either:
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li><span className="font-mono text-zinc-100 break-all">/profiles/76561198XXXXXXXXX</span> (17-digit SteamID64)</li>
                  <li><span className="font-mono text-zinc-100">/id/yourcustomname</span> (custom URL)</li>
                </ul>
              </Step>
              <Step number={3} title="Copy the ID or Full URL">
                Paste either format into the search field. Both work!
              </Step>
              <Step number={4} title="Set Game Details to Public">
                Settings → Privacy Settings → &quot;Game details&quot; = Public
                <div className="text-sm text-zinc-400 mt-1">This is needed for playtime hours to show.</div>
              </Step>
            </div>
          </section>

          {/* Xbox Guide */}
          <section className="card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Xbox</h2>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-5 mb-6">
              <div className="text-xs text-zinc-400 mb-3">Xbox Profile Example</div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-700" />
                  <div className="text-white font-semibold text-lg">PlayerName#5678</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Step number={1} title="Open Your Xbox Profile">
                Find it in the Xbox app, on <span className="text-zinc-100">xbox.com</span>, or on your console
              </Step>
              <Step number={2} title="Look for Your Gamertag">
                Your gamertag is displayed prominently on your profile
              </Step>
              <Step number={3} title="Include the Number Suffix">
                If your gamertag has a <span className="font-mono text-zinc-100">#1234</span> suffix, include it!
                <div className="text-sm text-zinc-400 mt-1">Example: PlayerName#5678</div>
              </Step>
            </div>
          </section>

          {/* PSN Guide */}
          <section className="card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">PlayStation Network</h2>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-5 mb-6">
              <div className="text-xs text-zinc-400 mb-3">PSN Profile Example</div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-700" />
                  <div>
                    <div className="text-white font-semibold text-lg">YourPSNName</div>
                    <div className="text-xs text-zinc-400">Online ID</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Step number={1} title="Find Your Online ID">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><span className="font-medium">PS5:</span> Settings → Users and Accounts → Account → Profile</li>
                  <li><span className="font-medium">PlayStation App:</span> Tap your profile icon</li>
                  <li><span className="font-medium">playstation.com:</span> View your profile</li>
                </ul>
              </Step>
              <Step number={2} title="Copy Your Online ID">
                Your Online ID is displayed at the top of your profile
              </Step>
              <Step number={3} title="Set Gaming History to Public">
                For playtime to show, set:
                <div className="text-sm text-zinc-400 mt-1">
                  Privacy Settings → Gaming History / Games → Anyone
                </div>
              </Step>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="btn btn-primary"
          >
            Add your accounts
          </Link>
        </div>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full border border-zinc-700 text-zinc-300 font-medium flex items-center justify-center text-xs tabular-nums">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-white font-medium mb-1">{title}</h3>
        <div className="text-sm text-zinc-400">{children}</div>
      </div>
    </div>
  );
}
