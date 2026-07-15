import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Send,
  CheckCircle2,
  Users,
  BarChart3,
  Building2,
  KeyRound,
  Trash2,
  Pencil,
  Plus,
  Radio,
  History,
  Briefcase,
  Award,
  Clock,
  ShieldCheck,
  Crown,
  Megaphone,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RoleRulesPanel from "@/components/RoleRulesPanel";
import { STATUS_LABEL, LEADER_DEPT_NAMES, ROLE_LABEL, type AppRole } from "@/lib/auth-utils";

type Dept = { id: string; name: string };
type MType = { id: string; name: string; department_id: string | null };
type Machine = { id: string; name: string; code: string | null; machine_type_id: string | null; repair_department_id: string | null };
// Provisioned automatically on first login (see ensure_profile() RPC, called
// from useAuth) — no longer created/edited by an admin here. Role and
// department come from CentralHub's attribute rules + per-user overrides
// (see RoleRulesPanel below), not a per-profile field an admin sets.
type UserRow = {
  id: string; code: string; full_name: string;
  department_id: string | null; department_name: string | null;
  last_seen_at: string | null;
};
type Job = JobDetail & {
  reporter_name?: string; assignee_name?: string; dept_name?: string; machine_name?: string;
};

function AdminPage() {
  const [tab, setTab] = useState("status");
  const [stats, setStats] = useState({ pending: 0, doing: 0, done: 0, users: 0 });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [mtypes, setMtypes] = useState<MType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [detail, setDetail] = useState<Job | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);

  const loadAll = async () => {
    const [{ data: jobsRows }, { data: usersRows }, { data: deptRows }, { data: mtRows }, { data: mRows }] =
      await Promise.all([
        supabase.from("repair_jobs").select("*, departments(name)")
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, code, full_name, department_id, last_seen_at, departments(name)").order("created_at"),
        supabase.from("departments").select("*").order("name"),
        supabase.from("machine_types").select("*").order("name"),
        supabase.from("machines").select("*").order("name"),
      ]);
    const enrichedUsers: UserRow[] = (usersRows ?? []).map((u) => ({
      id: u.id, code: u.code, full_name: u.full_name,
      department_id: u.department_id,
      department_name: (u as unknown as { departments?: { name?: string } | null }).departments?.name ?? null,
      last_seen_at: (u as unknown as { last_seen_at?: string | null }).last_seen_at ?? null,
    }));
    const profMap = new Map<string, string>();
    enrichedUsers.forEach((u) => profMap.set(u.id, u.full_name));
    const machMap = new Map<string, string>();
    (mRows ?? []).forEach((m) => machMap.set(m.id, m.code ? `${m.name} (${m.code})` : m.name));
    const enrichedJobs: Job[] = (jobsRows ?? []).map((j) => ({
      ...(j as unknown as JobDetail),
      reporter_name: profMap.get(j.reporter_id) ?? "-",
      assignee_name: j.assigned_to ? (profMap.get(j.assigned_to) ?? "-") : "-",
      dept_name: (j as unknown as { departments?: { name?: string } | null }).departments?.name ?? undefined,
      machine_name: j.machine_id ? machMap.get(j.machine_id) : undefined,
    }));
    setJobs(enrichedJobs);
    setUsers(enrichedUsers);
    setDepts(deptRows ?? []);
    setMtypes(mtRows ?? []);
    setMachines(mRows ?? []);
    setStats({
      pending: enrichedJobs.filter((j) => j.status === "pending_assign").length,
      doing: enrichedJobs.filter((j) => ["in_progress", "waiting_parts", "external"].includes(j.status)).length,
      done: enrichedJobs.filter((j) => j.status === "completed").length,
      users: enrichedUsers.length,
    });
  };

  useEffect(() => { loadAll(); }, []);

  const filteredJobs = (statuses: string[]) =>
    jobs.filter((j) => statuses.includes(j.status));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={<Send />} label="กำลังดำเนินการ" value={stats.doing} tone="brand" />
        <StatCard icon={<CheckCircle2 />} label="เสร็จสิ้น" value={stats.done} tone="success" />
        <StatCard icon={<Users />} label="ผู้ใช้งาน" value={stats.users} tone="brand" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border w-full justify-start overflow-x-auto">
          <TabsTrigger value="status">สถานะงาน</TabsTrigger>
          <TabsTrigger value="done">เสร็จสิ้น</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="size-4 mr-1" />สถิติ</TabsTrigger>
          <TabsTrigger value="users"><Users className="size-4 mr-1" />ผู้ใช้งาน</TabsTrigger>
          <TabsTrigger value="access"><KeyRound className="size-4 mr-1" />สิทธิ์การเข้าถึง</TabsTrigger>
          <TabsTrigger value="setup"><Building2 className="size-4 mr-1" />แผนก/เครื่องจักร</TabsTrigger>
        </TabsList>

        <TabsContent value="status"><JobList jobs={filteredJobs(["pending_assign","in_progress","waiting_parts","external","awaiting_review"])} onView={setDetail} onEdit={setEditJob} reload={loadAll} depts={depts} /></TabsContent>
        <TabsContent value="done"><JobList jobs={filteredJobs(["completed"])} onView={setDetail} onEdit={setEditJob} reload={loadAll} depts={depts} /></TabsContent>

        <TabsContent value="stats">
          <AdminStats jobs={jobs} depts={depts} />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab users={users} />
        </TabsContent>
        <TabsContent value="access">
          <RoleRulesPanel />
        </TabsContent>
        <TabsContent value="setup">
          <SetupTab depts={depts} mtypes={mtypes} machines={machines} reload={loadAll} />
        </TabsContent>
      </Tabs>

      <JobDetailDialog job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} allowPdf />
      <EditJobDialog job={editJob} onClose={() => setEditJob(null)} reload={loadAll} />
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "brand" | "warning" | "success" }) {
  const toneCls = tone === "warning" ? "bg-warning/30 text-warning-foreground" :
                  tone === "success" ? "bg-success/30 text-success-foreground" :
                  "bg-brand-soft text-brand";
  return (
    <div className="card-soft p-4 flex items-center gap-3">
      <div className={`size-11 rounded-xl grid place-items-center ${toneCls}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function JobList({ jobs, onView, onEdit, reload, depts }: {
  jobs: Job[]; onView: (j: Job) => void; onEdit: (j: Job) => void; reload: () => Promise<void>;
  depts?: Dept[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dept, setDept] = useState("all");
  const onDelete = async (id: string) => {
    if (!confirm("ลบงานซ่อมนี้? ข้อมูลทั้งหมดจะหายถาวร")) return;
    const { error } = await supabase.from("repair_jobs").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("ลบแล้ว"); await reload(); }
  };
  const filtered = filterJobs(jobs, search, status, dept);
  return (
    <div className="space-y-2">
      <JobFilters
        search={search} onSearch={setSearch}
        status={status} onStatus={setStatus}
        depts={depts} dept={dept} onDept={setDept}
      />
      {filtered.length === 0 && <div className="card-soft p-10 text-center text-muted-foreground">ไม่มีรายการ</div>}
      {filtered.map((j) => (
        <div key={j.id} className="card-soft p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-brand">{j.job_code}</span>
              <StatusBadge status={j.status} />
              {j.dept_name && <span>· {j.dept_name}</span>}
            </div>
            <div className="font-semibold mt-0.5">{j.title}</div>
            {j.description && <div className="text-sm text-muted-foreground line-clamp-1">{j.description}</div>}
            <div className="text-xs text-muted-foreground mt-1">
              ผู้แจ้ง: {j.reporter_name ?? "-"} · ผู้ซ่อม: {j.assignee_name ?? "-"} · {new Date(j.created_at).toLocaleString("th-TH")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => onView(j)}>ดูรายละเอียด</Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(j)}><Pencil className="size-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(j.id)}><Trash2 className="size-4 text-destructive" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditJobDialog({ job, onClose, reload }: {
  job: Job | null; onClose: () => void; reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("pending_assign");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (job) {
      setTitle(job.title);
      setDescription(job.description ?? "");
      setStatus(job.status);
    }
  }, [job]);

  const save = async () => {
    if (!job) return;
    if (!title.trim()) { toast.error("กรอกชื่อรายการ"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("repair_jobs").update({
        title: title.trim(),
        description: description.trim() || null,
        status: status as "pending_assign" | "in_progress" | "waiting_parts" | "external" | "awaiting_review" | "completed",
      }).eq("id", job.id);
      if (error) throw error;
      toast.success("บันทึกแล้ว");
      onClose();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แก้ไขงานซ่อม {job?.job_code}</DialogTitle>
        </DialogHeader>
        {job && (
          <div className="space-y-3">
            <div>
              <Label>ชื่อรายการ</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>รายละเอียด</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
            <div>
              <Label>สถานะ</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} disabled={busy}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Users are provisioned automatically on first CentralHub login
// (ensure_profile() RPC, called from useAuth) and their engineering role
// comes from CentralHub's attribute rules + per-user overrides (see the
// "สิทธิ์การเข้าถึง" / RoleRulesPanel tab), not a field set here — still no
// create/edit/delete actions (those belonged to the app's own now-retired
// Supabase-Auth login), but "who's here" is now a live, useful view instead
// of a bare table: an "online now" pass (last_seen_at within the last
// heartbeat window — see useAuth.tsx's 3-minute refresh) with full
// CentralHub attributes, and a separate login-history pass for everyone
// ever provisioned, sorted by recency.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type CentralAttrs = { department: string; position: string; jobLevel: string };
type KeycloakUser = { id: string; name: string; email: string };

function timeAgo(iso: string | null): string {
  if (!iso) return "ไม่เคยเข้าใช้งาน";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "เมื่อสักครู่";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} วันที่แล้ว`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} เดือนที่แล้ว`;
  return `${Math.floor(month / 12)} ปีที่แล้ว`;
}

function isOnline(lastSeenAt: string | null): boolean {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

// Small "live" pulse — same pattern as a browser tab's own recording/live
// indicator: a soft expanding ring behind a solid dot reads as "active"
// far more clearly than a static badge ever could.
function OnlineDot() {
  return (
    <span className="relative flex size-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-success" />
    </span>
  );
}

type RuleRow = { roleCode: string; department: string | null; position: string | null; jobLevel: string | null };
type OverrideRow = { userSub: string; roleCode: string };

const ROLE_ICON: Record<AppRole, React.ReactNode> = {
  admin: <ShieldCheck className="size-3" />,
  leader: <Crown className="size-3" />,
  department_head: <Building2 className="size-3" />,
  repairer: <Wrench className="size-3" />,
  reporter: <Megaphone className="size-3" />,
};

// Same precedence rules-only logic as auth-gateway's resolveRoleCode()
// (an override wins, else the most-specific matching rule) — computed here
// client-side from the same two admin endpoints RoleRulesPanel already
// calls, purely for display ("what is this person acting as in this app
// right now"), not as a security decision. Deliberately skips the
// CentralHub-admin-guarantee check (would need a per-user admin-role
// lookup with no bulk endpoint) — a display simplification, not a gap in
// the actual enforcement, which still happens server-side regardless.
function resolveLocalRole(
  attrs: CentralAttrs | undefined,
  overrideRoleCode: string | undefined,
  rules: RuleRow[],
): string | null {
  if (overrideRoleCode) return overrideRoleCode;
  if (!attrs) return null;
  let best: { roleCode: string; specificity: number } | null = null;
  for (const rule of rules) {
    const criteria: [string | null, string][] = [
      [rule.department, attrs.department],
      [rule.position, attrs.position],
      [rule.jobLevel, attrs.jobLevel],
    ];
    if (!criteria.every(([want, have]) => want === null || want === have)) continue;
    const specificity = criteria.filter(([want]) => want !== null).length;
    if (!best || specificity > best.specificity) best = { roleCode: rule.roleCode, specificity };
  }
  return best?.roleCode ?? null;
}

function RoleBadge({ roleCode }: { roleCode: string | null }) {
  if (!roleCode) {
    return <span className="text-xs text-muted-foreground">— ยังไม่มีบทบาท —</span>;
  }
  const known = roleCode in ROLE_LABEL;
  return (
    <span className="status-pill bg-brand-soft text-brand inline-flex items-center gap-1 font-medium">
      {known ? ROLE_ICON[roleCode as AppRole] : <KeyRound className="size-3" />}
      {known ? ROLE_LABEL[roleCode as AppRole] : roleCode}
    </span>
  );
}

function AttrBadges({ attrs }: { attrs?: CentralAttrs }) {
  if (!attrs) return <span className="text-xs text-muted-foreground">— ไม่มีข้อมูล —</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <span className="status-pill bg-brand-soft text-brand inline-flex items-center gap-1">
        <Building2 className="size-3" />{attrs.department}
      </span>
      <span className="status-pill bg-muted text-foreground inline-flex items-center gap-1">
        <Briefcase className="size-3" />{attrs.position}
      </span>
      <span className="status-pill bg-warning/30 text-warning-foreground inline-flex items-center gap-1">
        <Award className="size-3" />{attrs.jobLevel}
      </span>
    </div>
  );
}

// NOTE: /auth/admin/users(/attributes) require CentralHub's own Keycloak
// "admin" realm role (see requireAdmin.ts), not this app's resolved
// role_code — the two happen to coincide for dev-admin (both a realm admin
// and rule-resolved to engineering's "admin"), but aren't guaranteed to in
// general. A user who reaches this page via a rule/override granting
// engineering's "admin" role_code without holding the CentralHub realm
// role would see these two fetches 403 (attrs/kcUsers just stay empty —
// the rest of the tab still renders). Not fixed here; flagging rather than
// silently assuming the two always line up.
function UsersTab({ users }: { users: UserRow[] }) {
  const [tab, setTab] = useState("online");
  const [attrsMap, setAttrsMap] = useState<Record<string, CentralAttrs>>({});
  const [kcUsers, setKcUsers] = useState<KeycloakUser[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  useEffect(() => {
    (async () => {
      const [attrsRes, usersRes, rulesRes, overridesRes] = await Promise.all([
        fetch("/auth/admin/users/attributes", { credentials: "same-origin" }),
        fetch("/auth/admin/users", { credentials: "same-origin" }),
        fetch("/auth/admin/apps/engineering/role-rules", { credentials: "same-origin" }),
        fetch("/auth/admin/apps/engineering/role-overrides", { credentials: "same-origin" }),
      ]);
      if (attrsRes.ok) setAttrsMap(await attrsRes.json());
      if (usersRes.ok) setKcUsers(await usersRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (overridesRes.ok) setOverrides(await overridesRes.json());
    })();
  }, []);

  const emailFor = (id: string) => kcUsers.find((u) => u.id === id)?.email ?? null;
  const roleFor = (id: string) =>
    resolveLocalRole(attrsMap[id], overrides.find((o) => o.userSub === id)?.roleCode, rules);

  const online = useMemo(
    () => users.filter((u) => isOnline(u.last_seen_at))
      .sort((a, b) => new Date(b.last_seen_at!).getTime() - new Date(a.last_seen_at!).getTime()),
    [users],
  );
  const history = useMemo(
    () => [...users].sort((a, b) => {
      if (!a.last_seen_at) return 1;
      if (!b.last_seen_at) return -1;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    }),
    [users],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<Radio />} label="ออนไลน์ตอนนี้" value={online.length} tone="success" />
        <StatCard icon={<Users />} label="ผู้ใช้งานทั้งหมด" value={users.length} tone="brand" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border">
          <TabsTrigger value="online"><Radio className="size-4 mr-1" />ออนไลน์ตอนนี้</TabsTrigger>
          <TabsTrigger value="history"><History className="size-4 mr-1" />ประวัติการเข้าใช้งาน</TabsTrigger>
        </TabsList>

        <TabsContent value="online">
          <div className="card-soft p-5">
            <p className="text-xs text-muted-foreground mb-3">
              ผู้ใช้งานที่มีการเชื่อมต่อภายใน 5 นาทีที่ผ่านมา (อัปเดตอัตโนมัติทุก 3 นาทีขณะเปิดแอปค้างไว้)
            </p>
            <div className="space-y-2">
              {online.map((u) => (
                <div key={u.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <OnlineDot />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      {u.full_name}
                      <span className="font-mono text-xs text-muted-foreground font-normal">{u.code}</span>
                      <RoleBadge roleCode={roleFor(u.id)} />
                    </div>
                    {emailFor(u.id) && <div className="text-xs text-muted-foreground">{emailFor(u.id)}</div>}
                    <div className="mt-1"><AttrBadges attrs={attrsMap[u.id]} /></div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Clock className="size-3" />{timeAgo(u.last_seen_at)}
                  </div>
                </div>
              ))}
              {online.length === 0 && (
                <div className="py-10 text-center text-muted-foreground">ไม่มีผู้ใช้งานออนไลน์ในขณะนี้</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="card-soft p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground text-xs border-b">
                    <th className="py-2">สถานะ</th>
                    <th>รหัส</th>
                    <th>ชื่อ</th>
                    <th>บทบาทในระบบนี้</th>
                    <th>แผนก/ตำแหน่ง/ระดับ (CentralHub)</th>
                    <th>เข้าใช้งานล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 align-top">
                      <td className="py-2.5">
                        {isOnline(u.last_seen_at)
                          ? <OnlineDot />
                          : <span className="inline-block size-2.5 rounded-full bg-muted-foreground/30" />}
                      </td>
                      <td className="py-2.5 font-mono">{u.code}</td>
                      <td className="py-2.5">{u.full_name}</td>
                      <td className="py-2.5"><RoleBadge roleCode={roleFor(u.id)} /></td>
                      <td className="py-2.5"><AttrBadges attrs={attrsMap[u.id]} /></td>
                      <td className="py-2.5">
                        <div>{timeAgo(u.last_seen_at)}</div>
                        {u.last_seen_at && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(u.last_seen_at).toLocaleString("th-TH")}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">ยังไม่มีผู้ใช้งานเข้าสู่ระบบ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SetupTab({ depts, mtypes, machines, reload }:
  { depts: Dept[]; mtypes: MType[]; machines: Machine[]; reload: () => Promise<void> }
) {
  const [deptName, setDeptName] = useState("");
  const [mtName, setMtName] = useState("");
  const [mtDeptId, setMtDeptId] = useState<string>("none");
  const [openTypeId, setOpenTypeId] = useState<string | null>(null);
  const [machName, setMachName] = useState("");
  const [machRepairDeptId, setMachRepairDeptId] = useState<string>("none");

  const repairDeptChoices = depts.filter((d) => (LEADER_DEPT_NAMES as readonly string[]).includes(d.name));

  const addDept = async () => {
    if (!deptName.trim()) return;
    const { error } = await supabase.from("departments").insert({ name: deptName.trim() });
    if (error) toast.error(error.message); else { setDeptName(""); await reload(); toast.success("เพิ่มแผนกแล้ว"); }
  };
  const addMt = async () => {
    if (!mtName.trim()) return;
    const { error } = await supabase.from("machine_types").insert({
      name: mtName.trim(),
      department_id: mtDeptId === "none" ? null : mtDeptId,
    });
    if (error) toast.error(error.message);
    else { setMtName(""); setMtDeptId("none"); await reload(); toast.success("เพิ่มประเภทแล้ว"); }
  };
  const addMach = async () => {
    if (!openTypeId) return;
    if (!machName.trim()) { toast.error("กรอกชื่อเครื่อง"); return; }
    const { error } = await supabase.from("machines").insert({
      name: machName.trim(),
      machine_type_id: openTypeId,
      repair_department_id: machRepairDeptId === "none" ? null : machRepairDeptId,
    });
    if (error) toast.error(error.message);
    else {
      setMachName(""); setMachRepairDeptId("none"); setOpenTypeId(null);
      await reload(); toast.success("เพิ่มเครื่องจักรแล้ว");
    }
  };

  const updateMachRepairDept = async (id: string, value: string) => {
    const { error } = await supabase.from("machines").update({
      repair_department_id: value === "none" ? null : value,
    }).eq("id", id);
    if (error) toast.error(error.message); else { await reload(); toast.success("อัปเดตสังกัดผู้ซ่อมแล้ว"); }
  };

  const del = async (table: "departments" | "machine_types" | "machines", id: string) => {
    if (!confirm("ลบรายการนี้?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message); else await reload();
  };

  const openType = mtypes.find((t) => t.id === openTypeId) ?? null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card-soft p-5 space-y-3">
        <h3 className="font-bold">แผนก / สังกัด</h3>
        <div className="flex gap-2">
          <Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="ชื่อแผนก" />
          <Button onClick={addDept}><Plus className="size-4" /></Button>
        </div>
        <ul className="text-sm divide-y">
          {depts.map((d) => (
            <li key={d.id} className="flex justify-between items-center py-2">
              {d.name}
              <Button variant="ghost" size="icon" onClick={() => del("departments", d.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card-soft p-5 space-y-3">
        <h3 className="font-bold">ประเภทเครื่อง</h3>
        <div className="space-y-2">
          <Input value={mtName} onChange={(e) => setMtName(e.target.value)} placeholder="เช่น เตาอบ, แอร์" />
          <div className="flex gap-2">
            <Select value={mtDeptId} onValueChange={setMtDeptId}>
              <SelectTrigger><SelectValue placeholder="แผนกที่รับผิดชอบ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุแผนก —</SelectItem>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={addMt}><Plus className="size-4" /></Button>
          </div>
        </div>
        <ul className="text-sm divide-y">
          {mtypes.map((t) => {
            const list = machines.filter((m) => m.machine_type_id === t.id);
            const deptName = depts.find((d) => d.id === t.department_id)?.name;
            return (
              <li key={t.id} className="py-2 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.name}</div>
                    {deptName && <div className="text-xs text-muted-foreground">แผนก: {deptName}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => { setOpenTypeId(t.id); setMachName(""); }}>
                      <Plus className="size-4 mr-1" /> เพิ่มเครื่อง
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => del("machine_types", t.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {list.length > 0 && (
                  <ul className="pl-3 border-l-2 border-brand-soft divide-y">
                    {list.map((m) => {
                      const rDept = depts.find((d) => d.id === m.repair_department_id)?.name;
                      return (
                        <li key={m.id} className="flex justify-between items-center py-1.5 text-sm gap-2">
                          <div className="min-w-0">
                            <div>{m.name}</div>
                            <div className="text-xs text-muted-foreground">
                              สังกัดผู้ซ่อม: {rDept ?? "— ไม่ระบุ —"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Select
                              value={m.repair_department_id ?? "none"}
                              onValueChange={(v) => updateMachRepairDept(m.id, v)}
                            >
                              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="สังกัดผู้ซ่อม" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                                {repairDeptChoices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" onClick={() => del("machines", m.id)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={!!openTypeId} onOpenChange={(o) => !o && setOpenTypeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มเครื่องจักร / อุปกรณ์{openType ? ` — ${openType.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ชื่อเครื่อง *</Label>
              <Input value={machName} onChange={(e) => setMachName(e.target.value)} placeholder="เช่น HP-01 (1A)" />
            </div>
            <div className="space-y-1">
              <Label>สังกัดผู้ซ่อม</Label>
              <Select value={machRepairDeptId} onValueChange={setMachRepairDeptId}>
                <SelectTrigger><SelectValue placeholder="เลือกสังกัดผู้ซ่อม" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {repairDeptChoices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">งานที่ผู้แจ้งเลือกเครื่องนี้จะถูกส่งให้สังกัดผู้ซ่อมที่กำหนด</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTypeId(null)}>ยกเลิก</Button>
            <Button onClick={addMach}><Plus className="size-4 mr-1" /> เพิ่ม</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(k: string) {
  const [y, m] = k.split("-");
  return `${TH_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
}

function AdminStats({ jobs, depts }: { jobs: Job[]; depts: Dept[] }) {
  const months = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => s.add(monthKey(j.created_at)));
    return Array.from(s).sort().reverse();
  }, [jobs]);
  const [month, setMonth] = useState<string>("all");
  const [deptId, setDeptId] = useState<string>("all");

  const filtered = useMemo(() => jobs.filter((j) => {
    if (month !== "all" && monthKey(j.created_at) !== month) return false;
    if (deptId !== "all" && (j.department_id ?? "") !== deptId) return false;
    return true;
  }), [jobs, month, deptId]);

  const byDept = useMemo(() => {
    const map = new Map<string, Job[]>();
    filtered.forEach((j) => {
      const k = j.department_id ?? "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(j);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const total = filtered.length;
  const done = filtered.filter((j) => j.status === "completed").length;
  const doing = filtered.filter((j) => ["in_progress","waiting_parts","external","awaiting_review"].includes(j.status)).length;
  const pending = filtered.filter((j) => j.status === "pending_assign").length;

  return (
    <div className="space-y-4">
      <div className="card-soft p-4 flex flex-wrap gap-2 items-center">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกเดือน</SelectItem>
            {months.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกแผนก</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">รวม {total} งาน</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<ClipboardList />} label="งานทั้งหมด" value={total} tone="brand" />
        <StatCard icon={<ClipboardList />} label="รอจ่ายงาน" value={pending} tone="warning" />
        <StatCard icon={<Send />} label="กำลังดำเนินการ" value={doing} tone="brand" />
        <StatCard icon={<CheckCircle2 />} label="เสร็จสิ้น" value={done} tone="success" />
      </div>

      <div className="card-soft p-5">
        <h3 className="font-bold mb-3">แยกตามแผนก</h3>
        {byDept.length === 0 && <div className="text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {byDept.map(([k, list]) => {
            const name = depts.find((d) => d.id === k)?.name ?? "— ไม่ระบุ —";
            const d = list.filter((j) => j.status === "completed").length;
            const w = list.filter((j) => ["in_progress","waiting_parts","external","awaiting_review"].includes(j.status)).length;
            const p = list.filter((j) => j.status === "pending_assign").length;
            return (
              <div key={k} className="border rounded-xl p-3">
                <div className="font-semibold mb-2">{name}</div>
                <div className="text-xs text-muted-foreground mb-2">รวม {list.length} งาน</div>
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className="status-pill bg-warning/30">รอจ่าย {p}</span>
                  <span className="status-pill bg-brand-soft text-brand">กำลังทำ {w}</span>
                  <span className="status-pill bg-success/30">เสร็จ {d}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
