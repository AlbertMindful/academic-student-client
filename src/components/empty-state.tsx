import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium text-muted-foreground">
        {title ?? "暂无数据"}
      </p>
      {description && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
    </div>
  );
}
