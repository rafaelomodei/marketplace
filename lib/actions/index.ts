import { HttpError } from "../products";
import { describeAction, runAction, type Action } from "./define";
import * as g from "./generation";
import * as p from "./products";
import * as l from "./listing";

export { defineAction, describeAction, runAction, type Action } from "./define";
export * from "./generation";
export * from "./products";
export * from "./listing";

/**
 * Every studio operation, keyed by its stable name. The API routes call these, and a future
 * MCP server only needs to register one tool per entry (see docs/mcp.md).
 */
const ALL = [
  p.listProductsAction,
  p.getProductAction,
  p.getNextStepAction,
  p.createProductAction,
  p.updateProductAction,
  p.moveProductAction,
  p.addImagesAction,
  p.deleteImageAction,
  l.updateFactsAction,
  l.generateListingAction,
  l.listListingVersionsAction,
  l.editListingAction,
  l.validatePreparationAction,
  l.approveListingAction,
  l.exportListingAction,
  l.suggestProductFactsAction,
  l.getProductFactsSuggestionsAction,
  g.getCatalogAction,
  g.updateCodexSettingsAction,
  g.generateImagesAction,
  g.getJobAction,
  g.cancelJobAction,
  g.dismissJobAction,
  g.retryJobAction,
  g.reviewImageAction,
  g.reframeImageAction,
  g.correctImageAction,
  g.exportImagesAction,
] as unknown as Action[];

export const ACTIONS: Record<string, Action> = Object.fromEntries(ALL.map((a) => [a.name, a]));

export const listActions = () => ALL.map(describeAction);

export async function callAction(name: string, input: unknown) {
  const action = ACTIONS[name];
  if (!action) throw new HttpError(404, `Ação desconhecida: ${name}`);
  return runAction(action, input);
}
