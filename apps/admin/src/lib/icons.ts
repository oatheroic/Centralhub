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

// The picker's own offering — must stay in sync with
// apps/central-hub/src/lib/icons.ts's ICONS map, or a name picked here
// would silently render as the dashboard's LayoutGrid fallback instead of
// what was actually chosen.
export const ICON_OPTIONS: { name: string; Icon: LucideIcon }[] = [
  { name: "Archive", Icon: Archive },
  { name: "BarChart3", Icon: BarChart3 },
  { name: "Boxes", Icon: Boxes },
  { name: "Briefcase", Icon: Briefcase },
  { name: "Building2", Icon: Building2 },
  { name: "Calendar", Icon: Calendar },
  { name: "ClipboardList", Icon: ClipboardList },
  { name: "DollarSign", Icon: DollarSign },
  { name: "FileText", Icon: FileText },
  { name: "GraduationCap", Icon: GraduationCap },
  { name: "HeartPulse", Icon: HeartPulse },
  { name: "Landmark", Icon: Landmark },
  { name: "LayoutGrid", Icon: LayoutGrid },
  { name: "Mail", Icon: Mail },
  { name: "Megaphone", Icon: Megaphone },
  { name: "Package", Icon: Package },
  { name: "ShieldCheck", Icon: ShieldCheck },
  { name: "ShoppingCart", Icon: ShoppingCart },
  { name: "Truck", Icon: Truck },
  { name: "Users", Icon: Users },
  { name: "Warehouse", Icon: Warehouse },
  { name: "Wrench", Icon: Wrench },
];

const BY_NAME: Record<string, LucideIcon> = Object.fromEntries(ICON_OPTIONS.map((o) => [o.name, o.Icon]));

export function iconFor(name: string): LucideIcon {
  return BY_NAME[name] ?? LayoutGrid;
}
