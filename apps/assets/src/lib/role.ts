import { useEffect, useState } from "react";

const KEY = "current_role_code";
const INFO_KEY = "current_role_info";

export type RoleInfo = {
  role_code: string;
  display_name: string;
  step_access: number[];
  is_admin: boolean;
};

export function getCurrentRole(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}

export function getCurrentRoleInfo(): RoleInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(INFO_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as RoleInfo; } catch { return null; }
}

export function setCurrentRole(code: string, info?: RoleInfo) {
  localStorage.setItem(KEY, code);
  if (info) localStorage.setItem(INFO_KEY, JSON.stringify(info));
  window.dispatchEvent(new Event("role-changed"));
}

export function logoutRole() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(INFO_KEY);
  window.dispatchEvent(new Event("role-changed"));
}

export function useCurrentRole() {
  const [role, setRole] = useState<string>(() => getCurrentRole());
  useEffect(() => {
    const h = () => setRole(getCurrentRole());
    window.addEventListener("role-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("role-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return role;
}

export function useCurrentRoleInfo() {
  const [info, setInfo] = useState<RoleInfo | null>(() => getCurrentRoleInfo());
  useEffect(() => {
    const h = () => setInfo(getCurrentRoleInfo());
    window.addEventListener("role-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("role-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return info;
}
