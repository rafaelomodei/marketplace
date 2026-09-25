import type { LabTool } from "../../types";
import nameTag from "../../scad/name-tag.scad";
import { FIT_TIPS, nameTagFileName, nameTagHooks, nameTagParams, nameTagParts, validateNameTag } from "../shared/name-tag";
import model from "./keychain.scad";

const parts = nameTagParts({ label: "Base", color: "#FFFFFF" }, "#FC8CD5");
const shared = nameTagParams({
  textLabel: "Nome que vai no chaveiro",
  text: "Amália",
  font: "Pacifico",
  topHint: "Opcional — por exemplo a profissão. Em branco, o chaveiro fica com uma linha só.",
  printMode: "multi",
});

/**
 * Name keychain: raised name on a smooth contour base with a ring. Optional top line (e.g. a profession)
 * and icon, each in its own color — up to four filaments.
 */
export const keychain: LabTool = {
  id: "chaveiro",
  name: "Chaveiro com nome",
  tagline: "Nome em relevo com contorno suave e argola. Pode ter uma linha em cima (como a profissão) e um ícone, cada um com sua cor.",
  status: "ready",
  tags: ["Até 4 cores", "Sem suporte", "~20 min"],
  preview: "/lab/previews/chaveiro.png",
  source: `${nameTag}\n${model}`,
  parts,
  ...nameTagHooks(parts),
  presets: [
    { id: "nome", label: "Só o nome", values: { text: "Amália", font: "Pacifico" } },
    {
      id: "profissao",
      label: "Profissão e nome",
      values: { top_text: "Professora", top_font: "Satisfy", top_align: "right", text: "Débora", font: "Pacifico", icon: "heart", ring: "top" },
      colors: { base: "#F3E6CF", text: "#9575CD", top: "#C9AE85", icon: "#F06292" },
    },
    { id: "icone", label: "Nome e ícone", values: { text: "Theo", font: "Chewy", icon: "paw", icon_position: "after" }, colors: { text: "#4FA3E0" } },
  ],
  params: [
    ...shared.content,
    ...shared.size,
    {
      id: "ring",
      type: "choice",
      group: "Argola",
      label: "Posição da argola",
      default: "left",
      options: [
        { value: "left", label: "No começo" },
        { value: "right", label: "No fim" },
        { value: "top", label: "Em cima" },
        { value: "none", label: "Sem argola" },
      ],
    },
    ...shared.print,
    ...shared.advanced,
    { id: "ring_diameter", type: "number", group: "Argola", label: "Tamanho da argola", default: 9, min: 5, max: 20, step: 0.5, unit: "mm", advanced: true },
    { id: "hole_diameter", type: "number", group: "Argola", label: "Furo da argola", default: 4.5, min: 2, max: 15, step: 0.5, unit: "mm", advanced: true },
    { id: "ring_offset_y", type: "number", group: "Argola", label: "Subir ou descer a argola", default: 0, min: -15, max: 15, step: 0.5, unit: "mm", advanced: true },
  ],
  validate: (v) => {
    if (v.ring !== "none" && Number(v.ring_diameter) - Number(v.hole_diameter) < 2.4)
      return "O furo está grande demais para a argola: deixe pelo menos 1,2 mm de parede de cada lado.";
    return validateNameTag(v);
  },
  fileName: nameTagFileName("chaveiro"),
  printTips: [
    "Camada de 0,16 ou 0,2 mm, bico 0,4 mm, sem suporte.",
    "Com AMS: o 3MF já vem com cada parte separada (base, nome, texto de cima e ícone) — é só escolher o filamento de cada uma.",
    ...FIT_TIPS,
  ],
};
