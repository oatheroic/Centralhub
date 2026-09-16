import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/auth-utils";

export type JobLike = {
  job_code: string;
  title: string;
  status: string;
  department_id?: string | null;
  reporter_name?: string | null;
  assignee_name?: string | null;
  machine_name?: string | null;
};

function parseStatuses(status: string): string[] {
  if (!status || status === "all") return [];
  return status.split(",").filter(Boolean);
}

function StatusMultiSelect({
  status, onStatus,
}: { status: string; onStatus: (v: string) => void }) {
  const selected = parseStatuses(status);
  const toggle = (k: string) => {
    const next = selected.includes(k) ? selected.filter((s) => s !== k) : [...selected, k];
    onStatus(next.length === 0 ? "all" : next.join(","));
  };
  const label =
    selected.length === 0
      ? "ทุกสถานะ"
      : selected.length === 1
        ? (STATUS_LABEL[selected[0]] ?? selected[0])
        : `เลือก ${selected.length} สถานะ`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="size-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <button
          type="button"
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent"
          onClick={() => onStatus("all")}
        >
          ทุกสถานะ
        </button>
        <div className="my-1 h-px bg-border" />
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
            <Checkbox checked={selected.includes(k)} onCheckedChange={() => toggle(k)} />
            <span className="text-sm">{v}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function JobFilters({
  search, onSearch, status, onStatus,
  depts, dept = "all", onDept,
}: {
  search: string; onSearch: (v: string) => void;
  status: string; onStatus: (v: string) => void;
  depts?: { id: string; name: string }[];
  dept?: string;
  onDept?: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="ค้นหารหัส / รายการ / ผู้แจ้ง / ผู้ซ่อม / เครื่องจักร"
          className="pl-8"
        />
      </div>
      <StatusMultiSelect status={status} onStatus={onStatus} />
      {depts && onDept && (
        <Select value={dept} onValueChange={onDept}>
          <SelectTrigger className="w-48"><SelectValue placeholder="ทุกสังกัดผู้ซ่อม" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสังกัดผู้ซ่อม</SelectItem>
            {depts.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function filterJobs<T extends JobLike>(
  jobs: T[], search: string, status: string, deptId: string = "all",
): T[] {
  const s = search.trim().toLowerCase();
  const statuses = parseStatuses(status);
  return jobs.filter((j) => {
    if (statuses.length > 0 && !statuses.includes(j.status)) return false;
    if (deptId !== "all" && (j.department_id ?? "") !== deptId) return false;
    if (!s) return true;
    return (
      j.job_code.toLowerCase().includes(s) ||
      j.title.toLowerCase().includes(s) ||
      (j.reporter_name?.toLowerCase().includes(s) ?? false) ||
      (j.assignee_name?.toLowerCase().includes(s) ?? false) ||
      (j.machine_name?.toLowerCase().includes(s) ?? false)
    );
  });
}

