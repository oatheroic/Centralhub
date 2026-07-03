import type { LucideIcon } from "lucide-react";
import { DollarSign, LayoutGrid, Megaphone } from "lucide-react";

export type AppRegistryEntry = {
  /** Matches apps/<id> and the app-<id> compose service name. */
  id: string;
  name: string;
  department: string;
  icon: LucideIcon;
  /** Gateway-relative access URL, e.g. "/apps/marketing/". */
  path: string;
  description?: string;
  /** Excludes this entry from the hub's own grid (used for central-hub itself). */
  hidden?: boolean;
};

export const appRegistry: AppRegistryEntry[] = [
  {
    id: "central-hub",
    name: "Central Hub",
    department: "Platform",
    icon: LayoutGrid,
    path: "/",
    hidden: true,
  },
  {
    id: "marketing",
    name: "Marketing",
    department: "Marketing",
    icon: Megaphone,
    path: "/apps/marketing/",
    description: "Campaign planning and brand assets.",
  },
  {
    id: "finance",
    name: "Finance",
    department: "Finance",
    icon: DollarSign,
    path: "/apps/finance/",
    description: "Budgets, forecasting and reporting.",
  },
];
