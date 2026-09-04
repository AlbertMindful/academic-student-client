import { AlertCircle } from "lucide-react";

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
