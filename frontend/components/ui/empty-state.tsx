import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = React.ComponentProps<"div"> & {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
};

function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/30 p-5 text-left",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
