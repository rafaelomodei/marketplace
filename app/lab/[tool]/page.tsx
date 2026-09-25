import { notFound } from "next/navigation";
import { ToolWorkbench } from "@/components/lab";
import { findTool, LAB_TOOLS } from "@/lib/lab/tools";

export const generateStaticParams = () => LAB_TOOLS.filter((t) => t.status === "ready").map((t) => ({ tool: t.id }));

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const tool = findTool((await params).tool);
  return { title: `${tool?.name ?? "Lab"} · Lab` };
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const tool = findTool((await params).tool);
  if (!tool || tool.status !== "ready") notFound();
  return <ToolWorkbench toolId={tool.id} />;
}
