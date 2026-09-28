import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Pooled hours, shared games and an account leaderboard across your Xbox, Steam and PlayStation accounts.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
