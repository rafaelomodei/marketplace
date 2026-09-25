import { cn } from "@/lib/cn";

const FIELD =
  "w-full rounded-xl bg-canvas px-3.5 text-sm text-ink-strong ring-1 ring-line-strong ring-inset transition placeholder:text-ink-faint " +
  "hover:ring-ink-faint focus:ring-2 focus:ring-ink-strong focus:outline-none disabled:bg-surface";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "h-11", className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(FIELD, "py-2.5 leading-relaxed", className)} {...props} />;
}
