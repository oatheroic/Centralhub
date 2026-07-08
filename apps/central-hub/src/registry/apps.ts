import type { LucideIcon } from "lucide-react";
import { Boxes, DollarSign, LayoutGrid, Megaphone, ShieldCheck } from "lucide-react";

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
  /**
   * Only shows this entry to users whose session includes this Keycloak
   * role. Purely a discoverability affordance — the actual access gate is
   * always enforced server-side (Nginx role check), unaffected by this.
   */
  requiresRole?: string;
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
  {
    id: "assets",
    name: "Assets",
    department: "Operations",
    icon: Boxes,
    path: "/apps/assets/",
    description: "Asset purchase requests, registration, and transfers.",
  },
  {
    id: "admin",
    name: "Admin",
    department: "Platform",
    icon: ShieldCheck,
    path: "/apps/admin/",
    description: "Manage users, permissions, and sessions.",
    requiresRole: "admin",
  },
];
