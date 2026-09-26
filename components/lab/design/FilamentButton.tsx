"use client";

import { ChevronDown } from "lucide-react";
import { FilamentPicker } from "@/components/studio";
import { Dropdown, Icon, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FilamentCatalog } from "@/lib/config";
import { filamentHex } from "@/lib/prompts";
import type { PartColor } from "../PartColorField";

/** Compact filament chooser: the current swatch (and name), opening the real catalog in a dropdown. */
export function FilamentButton({
  catalog,
  value,
  onChange,
  label,
  compact,
  align = "start",
  children,
}: {
  catalog: FilamentCatalog | null;
  value: PartColor | null;
  onChange: (c: PartColor) => void;
  label: string;
  compact?: boolean;
  align?: "start" | "end";
  /** Custom trigger content (default: swatch + filament name). */
  children?: React.ReactNode;
}) {
  const filament = catalog?.filaments.find((f) => f.id === value?.filamentId);
  return (
    <Dropdown
      align={align}
      className="w-[min(24rem,calc(100vw-2rem))] p-4"
      trigger={(open, toggle) => (
        <button
          type="button"
          aria-expanded={open}
          aria-label={label}
          title={label}
          disabled={!catalog}
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-2 rounded-full text-left text-sm text-ink-strong transition hover:bg-surface disabled:opacity-50",
            compact ? "p-1" : "h-10 py-1 pr-3 pl-1.5 ring-1 ring-line-strong ring-inset",
          )}
        >
          {children ?? (
            <>
              <Swatch color={value?.hex ?? "#ffffff"} className="size-7" />
              {!compact && (
                <span className="min-w-0">
                  <span className="block max-w-36 truncate text-[13px] leading-tight font-medium">{filament?.name ?? value?.hex}</span>
                  {filament && <span className="block max-w-36 truncate text-[11px] leading-tight text-ink-muted">{filament.line}</span>}
                </span>
              )}
              {!compact && <Icon icon={ChevronDown} className="size-3.5 text-ink-muted" />}
            </>
          )}
        </button>
      )}
    >
      {(close) =>
        catalog && (
          <FilamentPicker
            catalog={catalog}
            selected={value?.filamentId ? [value.filamentId] : []}
            onToggle={(id) => {
              const f = catalog.filaments.find((x) => x.id === id);
              if (f) onChange({ filamentId: f.id, hex: filamentHex(f) });
              close();
            }}
          />
        )
      }
    </Dropdown>
  );
}
