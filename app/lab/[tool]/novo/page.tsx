import { notFound } from "next/navigation";
import { LabEditor } from "@/components/lab";
import { listCreations } from "@/lib/lab/creations";
import { findTool } from "@/lib/lab/tools";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const tool = findTool((await params).tool);
  return { title: `Nova · ${tool?.name ?? "Lab"} · Lab` };
}

type Props = { params: Promise<{ tool: string }>; searchParams: Promise<{ exemplo?: string }> };

/**
 * A new piece, saved to the history on the first change. The first one of a tool starts from the sample (so people see
 * what it makes); the next ones start empty. `?exemplo` always opens the sample.
 */
export default async function NewCreationPage({ params, searchParams }: Props) {
  const tool = findTool((await params).tool);
  if (!tool || tool.status !== "ready") notFound();
  const hasHistory = listCreations(tool.id).length > 0;
  const sample = !hasHistory || (await searchParams).exemplo !== undefined;
  return <LabEditor toolId={tool.id} hasHistory={hasHistory} from={sample ? "sample" : "blank"} />;
}
