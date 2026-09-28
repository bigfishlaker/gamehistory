import type { Metadata } from 'next';
import { Suspense } from 'react';
import ProfileContent from './profile-content';
import { ProfileSkeleton } from '@/components/skeletons';

export const metadata: Metadata = {
  title: 'Gaming profile',
  description: 'Pooled playtime, every game played and a shareable Top 6/10/25/50 across Xbox, Steam and PlayStation.',
};

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}
