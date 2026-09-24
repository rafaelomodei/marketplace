import { handle } from "@/lib/api";
import { filamentCatalog, marketplaces } from "@/lib/config";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => ({ filaments: filamentCatalog(), marketplaces: marketplaces() }));
