import type { LabTool } from "../../types";
import nameTag from "../../scad/name-tag.scad";
import { FIT_TIPS, nameTagFileName, nameTagHooks, nameTagParams, nameTagParts, validateNameTag } from "../shared/name-tag";
import model from "./bag-tag.scad";

const parts = nameTagParts({ label: "Etiqueta e alça", color: "#7E57C2" }, "#FFFFFF");
const shared = nameTagParams({
  textLabel: "Nome que vai na etiqueta",
  text: "Rafael",
  font: "Titan One",
  topHint: "Opcional — por exemplo a turma ou a escola. Em branco, a etiqueta fica com uma linha só.",
  // Like the original idea: letters printed apart and pressed into the recessed base, no AMS needed.
  printMode: "single",
});

/**
 * Bag / backpack name tag with a built-in flexible strap and snap pin: wrap the strap around a handle
 * or zipper pull and press the hole onto the pin. No metal ring needed.
 */
export const bagTag: LabTool = {
  id: "etiqueta-de-bolsa",
  name: "Etiqueta de bolsa com alça",
  tagline: "Nome para mochila, bolsa ou mala, com alça flexível e fecho de pressão impressos junto — sem argola de metal.",
  status: "ready",
  tags: ["Letras de encaixe", "Fecho impresso", "Sem suporte"],
  preview: "/lab/previews/etiqueta-de-bolsa.png",
  source: `${nameTag}\n${model}`,
  parts,
  ...nameTagHooks(parts),
  presets: [
    { id: "nome", label: "Só o nome", values: { text: "Rafael", font: "Titan One" } },
    {
      id: "escola",
      label: "Turma e nome",
      values: { top_text: "Turma 3B", top_font: "Chewy", top_align: "left", text: "Lucas", font: "Titan One", icon: "book", strap_side: "right" },
      colors: { base: "#4FA3E0", text: "#FFFFFF", top: "#FDDE04", icon: "#FFFFFF" },
    },
    { id: "icone", label: "Nome e ícone", values: { text: "Emma", font: "Chewy", icon: "heart" }, colors: { base: "#F8BBD0", text: "#FFFFFF", icon: "#E91E63" } },
  ],
  params: [
    ...shared.content,
    ...shared.size,
    {
      id: "strap_side",
      type: "choice",
      group: "Alça",
      label: "De que lado sai a alça",
      default: "left",
      options: [
        { value: "left", label: "Esquerda" },
        { value: "right", label: "Direita" },
      ],
    },
    {
      id: "strap_length",
      type: "number",
      group: "Alça",
      label: "Comprimento da alça",
      hint: "Tem que dar a volta na alça da mochila e voltar até o pino.",
      default: 100,
      min: 50,
      max: 180,
      step: 5,
      unit: "mm",
    },
    ...shared.print,
    ...shared.advanced,
    { id: "strap_width", type: "number", group: "Alça", label: "Largura da alça", default: 9, min: 6, max: 16, step: 0.5, unit: "mm", advanced: true },
    {
      id: "strap_thickness",
      type: "number",
      group: "Alça",
      label: "Espessura da alça",
      hint: "Mais fina dobra mais fácil; mais grossa dura mais.",
      default: 1.2,
      min: 0.6,
      max: 2.4,
      step: 0.2,
      unit: "mm",
      advanced: true,
    },
    { id: "pin_distance", type: "number", group: "Fecho", label: "Distância do pino até a etiqueta", default: 14, min: 8, max: 40, step: 1, unit: "mm", advanced: true },
    { id: "pin_diameter", type: "number", group: "Fecho", label: "Grossura do pino", default: 3.2, min: 2, max: 5, step: 0.2, unit: "mm", advanced: true },
    {
      id: "snap_grip",
      type: "number",
      group: "Fecho",
      label: "Firmeza do fecho",
      hint: "Quanto a cabeça do pino é maior que o furo. Maior = trava mais firme, mas é mais difícil de fechar.",
      default: 1,
      min: 0.4,
      max: 2,
      step: 0.1,
      unit: "mm",
      advanced: true,
    },
    { id: "snap_clearance", type: "number", group: "Fecho", label: "Folga do furo no pino", default: 0.3, min: 0, max: 1, step: 0.05, unit: "mm", advanced: true },
  ],
  validate: (v) => {
    if (Number(v.strap_width) - (Number(v.pin_diameter) + Number(v.snap_clearance)) < 3)
      return "O furo do fecho está grande demais para a alça: deixe pelo menos 1,5 mm de alça de cada lado dele.";
    if (Number(v.strap_length) < Number(v.pin_distance) + 30) return "A alça está curta demais para dar a volta e chegar até o pino.";
    if (Number(v.strap_thickness) >= Number(v.base_thickness)) return "A alça precisa ser mais fina que a base da etiqueta.";
    return validateNameTag(v);
  },
  fileName: nameTagFileName("etiqueta"),
  printTips: [
    "PLA ou PETG (PETG aguenta mais dobras na alça). Camada de 0,2 mm, bico 0,4 mm, 3 paredes, 15% de preenchimento, sem suporte.",
    "Imprima a etiqueta com a alça deitada na mesa, do jeito que o arquivo sai. Se a ponta da alça levantar, use uma aba (brim).",
    "Para fechar: passe a alça em volta da alça da mochila e pressione o furo no pino até travar.",
    ...FIT_TIPS,
    "O fecho é para acessórios leves — não use como ponto de segurança.",
  ],
};
