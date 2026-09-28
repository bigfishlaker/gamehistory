/** Layout-shaped placeholders shown while /p and /dashboard load. */

function Bar({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ProfileSkeleton() {
  return (
    <div className="flex-1" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading profile…</span>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-hidden="true">
        <Bar className="mb-6 h-9 w-44" />
        <div className="mb-3 flex items-center justify-between">
          <Bar className="h-4 w-36" />
          <Bar className="h-10 w-32" />
        </div>
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="card flex items-center gap-3 p-3">
              <Bar className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2"><Bar className="h-4 w-2/3" /><Bar className="h-3 w-1/3" /></div>
            </div>
          ))}
        </div>
        <div className="mb-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-3">
            <div className="card flex items-center gap-4 p-5"><Bar className="h-16 w-16 rounded-full" /><div className="flex-1 space-y-2"><Bar className="h-5 w-2/3" /><Bar className="h-3 w-1/2" /></div></div>
            {[0, 1, 2].map(i => <div key={i} className="card space-y-2 p-4"><Bar className="h-3 w-24" /><Bar className="h-7 w-32" /></div>)}
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Bar className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-4">{[0, 1].map(i => <div key={i} className="card space-y-2 p-4"><Bar className="h-3 w-16" /><Bar className="h-7 w-28" /></div>)}</div>
            <Bar className="h-6 w-44" />
            {[0, 1, 2, 3, 4].map(i => <Bar key={i} className="h-12 w-full" />)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <Bar key={i} className="aspect-[3/4] w-full" />)}
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading dashboard…</span>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-hidden="true">
        <Bar className="mb-3 h-9 w-48" />
        <Bar className="mb-8 h-4 w-72 max-w-full" />
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="card space-y-2 p-5"><Bar className="h-3 w-20" /><Bar className="h-7 w-24" /></div>)}
        </div>
        <div className="card mb-8 space-y-4 p-5">
          <Bar className="h-5 w-40" />
          {[0, 1, 2].map(i => <div key={i} className="space-y-2"><Bar className="h-3 w-full" /><Bar className="h-1.5 w-full" /></div>)}
        </div>
        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {[0, 1].map(i => <div key={i} className="card space-y-3 p-5"><Bar className="h-5 w-32" />{[0, 1, 2].map(j => <Bar key={j} className="h-4 w-full" />)}</div>)}
        </div>
        <div className="card space-y-3 p-5"><Bar className="h-5 w-40" />{[0, 1, 2, 3, 4].map(i => <Bar key={i} className="h-10 w-full" />)}</div>
      </div>
    </div>
  );
}
