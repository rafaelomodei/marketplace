import { notFound } from "next/navigation";
import { LabEditor } from "@/components/lab";
import { findCreation } from "@/lib/lab/creations";
import { findTool } from "@/lib/lab/tools";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tool: string; creation: string }> };

export async function generateMetadata({ params }: Params) {
  const { tool, creation } = await params;
  return { title: `${findCreation(creation)?.name ?? "Criação"} · ${findTool(tool)?.name ?? "Lab"}` };
}

/** Reopens a saved piece in the editor, right where it was left. */
export default async function CreationPage({ params }: Params) {
  const p = await params;
  const tool = findTool(p.tool);
  const creation = findCreation(p.creation);
  if (!tool || tool.status !== "ready" || !creation || creation.tool !== tool.id) notFound();
  return <LabEditor toolId={tool.id} creation={creation} hasHistory />;
}
