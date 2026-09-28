import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What GAMER.ID stores (only public account IDs, cached briefly) and what stays in your browser.',
};

export default function PrivacyPage() {
  return (
    <div className="flex-1 text-zinc-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-8">Privacy Policy</h1>
        
        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Overview</h2>
            <p>
              GAMER.ID is a gaming profile aggregator that displays publicly available gaming data from Xbox, Steam, PlayStation Network and Fortnite (Epic Games). We take your privacy seriously and are committed to transparency about what data we collect and how we use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Data We Collect</h2>
            
            <h3 className="text-base font-semibold text-white mt-6 mb-3">Public Gaming Profiles</h3>
            <p className="mb-3">
              When you search for a gaming profile, we fetch publicly available data from third-party gaming platforms:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Xbox: Gamertag, avatar, game library, achievements, playtime (via OpenXBL API)</li>
              <li>Steam: Display name, avatar, game library, achievements, playtime (via Steam Web API)</li>
              <li>PlayStation: PSN ID, avatar, game library, achievements (via unofficial PSN API)</li>
              <li>Epic Games / Fortnite: Epic display name, account ID and public Battle Royale stats (via the unofficial fortnite-api.com)</li>
            </ul>
            <p className="mt-3">
              This data is already public and accessible to anyone. We simply aggregate it in one place.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-3">Profile Pictures</h3>
            <p>
              If you upload a custom profile picture, it is stored only in your browser&apos;s localStorage. We do not upload or store profile pictures on our servers.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-3">IP Addresses</h3>
            <p>
              We temporarily track IP addresses solely for rate limiting to prevent abuse. IP addresses are:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Used only for rate limit counters</li>
              <li>Not logged permanently</li>
              <li>Not associated with specific profile lookups</li>
              <li>Automatically cleared after the rate limit window expires</li>
            </ul>

            <h3 className="text-base font-semibold text-white mt-6 mb-3">Analytics & Cookies</h3>
            <p>
              We count visits anonymously so we know whether people use the site. We use Vercel Web Analytics, which sets no cookies, and a simple page-view counter of our own. The counter stores only daily totals, page paths, the referring website&apos;s hostname and a salted, daily-rotating hash for counting unique visitors. Raw IP addresses are never stored, and the counts are deleted after 90 days.
            </p>
            <p className="mt-3">
              We do not use tracking pixels, advertising, or third-party cookies, and we set no cookies on visitors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Data We Do NOT Collect</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Personal information (email, phone, address)</li>
              <li>Payment information</li>
              <li>Browsing history</li>
              <li>Search history or lookup logs with identifiable information</li>
              <li>Device fingerprints</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">How We Use Data</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>To display gaming profiles and statistics as requested</li>
              <li>To cache API responses temporarily (6 hours) to improve performance</li>
              <li>To prevent abuse through rate limiting</li>
            </ul>
            <p className="mt-3">
              We do not sell, rent, or share your data with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Third-Party Services</h2>
            <p className="mb-3">
              We rely on the following third-party APIs to fetch gaming data:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>OpenXBL</strong> (<a href="https://xbl.io" className="text-link" target="_blank" rel="noopener noreferrer">xbl.io</a>) - Xbox profile data
              </li>
              <li>
                <strong>Steam Web API</strong> (<a href="https://steamcommunity.com/dev" className="text-link" target="_blank" rel="noopener noreferrer">steamcommunity.com/dev</a>) - Steam profile data
              </li>
              <li>
                <strong>PlayStation Network</strong> (unofficial API via psn-api npm package) - PSN profile data
              </li>
              <li>
                <strong>fortnite-api.com</strong> (<a href="https://fortnite-api.com" className="text-link" target="_blank" rel="noopener noreferrer">fortnite-api.com</a>, unofficial) - Fortnite Battle Royale stats for an Epic display name
              </li>
            </ul>
            <p className="mt-3">
              Each service has its own terms of service and privacy policy. By using GAMER.ID, you acknowledge that we fetch data from these services on your behalf.
            </p>
            <p className="mt-3 text-zinc-400">
              <strong>Note:</strong> The PSN integration uses an unofficial API and is not endorsed by Sony. Use of PSN features is at your own risk and may violate Sony&apos;s Terms of Service.
            </p>
            <p className="mt-3 text-zinc-400">
              <strong>Note:</strong> Fortnite stats come from fortnite-api.com, an unofficial third-party service that is not affiliated with or endorsed by Epic Games. Only stats a player has made public (Show on Career Leaderboard) are available; results are cached for 15 minutes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Data Retention</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Profile and game data: Cached for 6 hours, then automatically deleted</li>
              <li>Rate limit counters: Automatically cleared after the time window expires (1 hour)</li>
              <li>Profile pictures: Stored in your browser indefinitely until you clear localStorage</li>
              <li>Your looked-up accounts and recent lookups: Stored only in your browser (localStorage) so you can continue later. Use &quot;Forget these accounts&quot; or clear site data to remove them</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Your Rights</h2>
            <p className="mb-3">
              Since we only display publicly available data and don&apos;t store personal information, there is no &quot;account&quot; to delete. However:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You can clear your uploaded profile picture by clearing your browser&apos;s localStorage</li>
              <li>You can set your gaming profiles to private on the respective platforms to prevent lookups</li>
              <li>Cached data automatically expires after 6 hours</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Security</h2>
            <p>
              We implement security best practices including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>HTTPS encryption for all connections</li>
              <li>Rate limiting to prevent abuse</li>
              <li>Input validation to prevent injection attacks</li>
              <li>Content Security Policy (CSP) headers</li>
              <li>Secure API key storage (server-side only, never exposed to clients)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. Changes will be posted on this page with an updated &quot;Last Updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Contact</h2>
            <p>
              If you have questions about this privacy policy or how we handle data, please create an issue on our{' '}
              <a href="https://github.com/bigfishlaker/gamehistory" className="text-link" target="_blank" rel="noopener noreferrer">
                GitHub repository
              </a>.
            </p>
          </section>

          <section className="text-sm text-zinc-400 border-t border-zinc-800 pt-8">
            <p>Last Updated: September 27, 2026</p>
          </section>
        </div>
      </div>
    </div>
  );
}
