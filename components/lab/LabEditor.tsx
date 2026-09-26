import type { LabCreation } from "@/lib/lab/creations";
import type { StartFrom } from "@/lib/lab/params";
import { findTool } from "@/lib/lab/tools";
import { DesignWorkbench } from "./design/DesignWorkbench";
import { ToolWorkbench } from "./ToolWorkbench";

/**
 * The editor of a Lab tool, new (`creation` empty) or reopening a saved piece. Tools that start from a drawing open the
 * full-screen editor; the others, the form with the 3D preview. `hasHistory`: the tool has saved pieces (where "back" goes).
 * `from`: a new piece starts from the sample or empty.
 */
export function LabEditor(props: { toolId: string; creation?: LabCreation | null; hasHistory: boolean; from?: StartFrom }) {
  const svg = findTool(props.toolId)?.params?.some((p) => p.type === "svg");
  return svg ? <DesignWorkbench {...props} /> : <ToolWorkbench {...props} />;
}
