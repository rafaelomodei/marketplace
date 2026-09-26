import { notFound, redirect } from "next/navigation";
import { listCreations } from "@/lib/lab/creations";
import { findTool } from "@/lib/lab/tools";
import { CreationHistory } from "./CreationHistory";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const tool = findTool((await params).tool);
  return { title: `${tool?.name ?? "Lab"} · Lab` };
}

/** The tool's history ("Minhas criações"). Nothing made yet: straight to the editor. */
export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const tool = findTool((await params).tool);
  if (!tool || tool.status !== "ready") notFound();
  const creations = listCreations(tool.id);
  if (!creations.length) redirect(`/lab/${tool.id}/novo`);
  return <CreationHistory tool={{ id: tool.id, name: tool.name }} initial={creations} />;
}
