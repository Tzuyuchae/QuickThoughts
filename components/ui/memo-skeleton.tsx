// components/memo-skeleton.tsx
export function MemoSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="pb-2">
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
      <div>
        <div className="space-y-2">
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-5/6 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}