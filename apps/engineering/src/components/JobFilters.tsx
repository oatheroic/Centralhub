import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุกสถานะ</SelectItem>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  return jobs.filter((j) => {
    if (status !== "all" && j.status !== status) return false;
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
