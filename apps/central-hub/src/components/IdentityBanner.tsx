import { Avatar, Badge, Skeleton } from "@centralhub/ui";
import type { SessionUser } from "../lib/auth";

export function IdentityBanner({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size={32} />
        <div>
          <p className="text-sm font-medium text-text">{user.name}</p>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="success">{user.roles.join(", ")}</Badge>
        <a href="/auth/logout" className="text-xs text-text-muted hover:text-text">
          Log out
        </a>
      </div>
    </div>
  );
}

export function IdentityBannerSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}
