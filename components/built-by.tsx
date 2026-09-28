import Image from 'next/image';

export const CREATOR_HANDLE = '@D_Scramble';
export const CREATOR_URL = 'https://x.com/D_Scramble';

/** "Built by @D_Scramble" credit with avatar, linking to the creator's X profile in a new tab. */
export function BuiltBy({ className = '' }: { className?: string }) {
  return (
    <a
      href={CREATOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex min-h-11 items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors ${className}`}
    >
      <Image
        src="/dscramble-avatar.jpg"
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] rounded-full border border-zinc-800 object-cover"
      />
      <span>
        Built by{' '}
        <span className="font-medium text-zinc-100 underline decoration-zinc-700 underline-offset-4 group-hover:decoration-zinc-300">
          {CREATOR_HANDLE}
        </span>
      </span>
    </a>
  );
}
