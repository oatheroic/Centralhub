const KEY = "chub_recent_apps";
const MAX_ENTRIES = 4;

type RecentEntry = { id: string; ts: number };

function readEntries(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordAppOpen(id: string) {
  const entries = readEntries().filter((e) => e.id !== id);
  entries.unshift({ id, ts: Date.now() });
  window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function getRecentAppIds(): string[] {
  return readEntries()
    .sort((a, b) => b.ts - a.ts)
    .map((e) => e.id);
}
