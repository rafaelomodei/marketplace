import type { LabTool } from "../types";
import { bagTag } from "./bag-tag";
import { clipTopper } from "./clip";
import { keychain } from "./keychain";

/** Every Lab tool. Add a new one here: a folder with its .scad model and its definition. */
export const LAB_TOOLS: LabTool[] = [
  keychain,
  bagTag,
  clipTopper,
  {
    id: "topo-de-bolo",
    name: "Topo de bolo com nome",
    tagline: "Nome e idade com haste para espetar no bolo.",
    status: "soon",
    tags: ["1 ou 2 cores"],
  },
  {
    id: "porta-guardanapo",
    name: "Porta-guardanapo com nome",
    tagline: "Anel personalizado para mesa posta e eventos.",
    status: "soon",
    tags: ["Eventos"],
  },
];

export const findTool = (id: string) => LAB_TOOLS.find((t) => t.id === id);
