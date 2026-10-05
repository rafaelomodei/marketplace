import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

const TONES = {
  info: { box: "bg-sky/50 text-ink", icon: Info },
  success: { box: "bg-success-soft text-success", icon: CircleCheck },
  warning: { box: "bg-warning-soft text-warning", icon: TriangleAlert },
  danger: { box: "bg-danger-soft text-danger", icon: CircleAlert },
} as const;

export function Alert({
  tone = "info",
  children,
  onClose,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-card px-4 py-3 text-sm", t.box, className)}>
      <Icon icon={t.icon} className="mt-0.5" />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button type="button" aria-label="Fechar" onClick={onClose} className="opacity-60 hover:opacity-100">
          <Icon icon={X} />
        </button>
      )}
    </div>
  );
}
