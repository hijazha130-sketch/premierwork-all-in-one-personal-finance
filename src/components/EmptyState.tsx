import type { ReactNode } from "react";

/**
 * Warm, directive empty states (Section 8). A fresh install must look
 * intentional and always offer one obvious next action — never a broken grid.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-12">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-inset text-gold text-2xl">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      <p className="text-muted mt-2 max-w-sm">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
