import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  GraduationCap,
  HeartPulse,
  Landmark,
  LayoutGrid,
  Mail,
  Megaphone,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";

// Maps an app row's DB-stored `icon` string (see
// services/auth-gateway/src/apps.ts) to an actual component — an app's
// icon field isn't serializable, so the registry only ever carries a name.
// Must stay in sync with apps/admin/src/lib/icons.ts's ICON_OPTIONS (the
// admin Apps tab's picker only offers names from that list) — LayoutGrid
// is the fallback for any unrecognized key regardless, so a typo'd or
// not-yet-added icon name never breaks the dashboard.
export const ICONS: Record<string, LucideIcon> = {
  Archive,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  GraduationCap,
  HeartPulse,
  Landmark,
  LayoutGrid,
  Mail,
  Megaphone,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wrench,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? ICONS.LayoutGrid;
}
