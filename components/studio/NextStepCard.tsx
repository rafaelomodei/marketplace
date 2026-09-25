import { ArrowRight, CircleCheck, Hourglass, Lightbulb } from "lucide-react";
import { Button, Card, Icon, IconTile, Progress } from "@/components/ui";
import type { NextStep } from "@/lib/workflow";

const ICONS = { action: Lightbulb, waiting: Hourglass, done: CircleCheck } as const;
const TONES = { action: "sun", waiting: "peach", done: "mint" } as const;

/** "What now?" banner: the single recommended action, so nobody has to learn the tool. */
export function NextStepCard({ next, onGo }: { next: NextStep; onGo: () => void }) {
  return (
    <Card tone="float" className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap sm:p-5">
      <IconTile icon={ICONS[next.tone]} tone={TONES[next.tone]} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium tracking-[-0.01em] text-ink-strong">{next.title}</p>
        <p className="text-sm text-ink-muted">{next.description}</p>
        {next.tone === "waiting" && <Progress className="mt-2 max-w-sm" />}
      </div>
      {next.cta && (
        <Button variant={next.tone === "action" ? "primary" : "secondary"} onClick={onGo} className="w-full sm:w-auto">
          {next.cta} <Icon icon={ArrowRight} />
        </Button>
      )}
    </Card>
  );
}
