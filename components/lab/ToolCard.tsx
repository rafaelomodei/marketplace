import { ArrowRight, Backpack, CakeSlice, KeyRound, Paperclip, Ribbon, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, Icon, IconTile, type TileTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { LabTool } from "@/lib/lab/types";

const LOOK: Record<string, { icon: LucideIcon; tone: TileTone }> = {
  chaveiro: { icon: KeyRound, tone: "rose" },
  "etiqueta-de-bolsa": { icon: Backpack, tone: "sky" },
  "enfeite-de-clipe": { icon: Paperclip, tone: "mint" },
  "topo-de-bolo": { icon: CakeSlice, tone: "sun" },
  "porta-guardanapo": { icon: Ribbon, tone: "lilac" },
};

/** Icon and color of a tool, for places without a picture. */
export const toolLook = (id: string) => LOOK[id] ?? { icon: Wrench, tone: "neutral" as const };

/** Gallery card for a Lab tool; tools that are not ready yet show "Em breve". */
export function ToolCard({ tool }: { tool: LabTool }) {
  const look = toolLook(tool.id);
  const ready = tool.status === "ready";
  const body = (
    <>
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-card bg-surface ring-1 ring-line ring-inset">
        {tool.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tool.preview} alt="" className="size-full object-cover transition duration-700 group-hover:scale-[1.04]" />
        ) : (
          <div className={cn("transition duration-500", ready && "group-hover:scale-110")}>
            <IconTile icon={look.icon} tone={look.tone} size="lg" />
          </div>
        )}
        <div className="absolute top-3 left-3">{ready ? <Badge tone="accent" dot>Disponível</Badge> : <Badge>Em breve</Badge>}</div>
      </div>
      <div className="space-y-2 px-0.5">
        <div className="flex items-center gap-2 font-medium tracking-[-0.01em] text-ink-strong">
          {tool.name}
          {ready && <Icon icon={ArrowRight} className="opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
        </div>
        <p className="text-sm leading-relaxed text-ink-muted">{tool.tagline}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tool.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </div>
    </>
  );
  return ready ? (
    <Link href={`/lab/${tool.id}`} className="group block space-y-4">
      {body}
    </Link>
  ) : (
    <div className="space-y-4 opacity-70">{body}</div>
  );
}
