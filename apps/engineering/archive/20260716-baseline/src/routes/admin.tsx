import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ClipboardList,
  Send,
  CheckCircle2,
  Users,
  BarChart3,
  Building2,
  UserPlus,
  Trash2,
  Pencil,
  Plus,
  LogOut,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  adminCreateUser, adminDeleteUser, adminUpdateUser,
} from "@/lib/admin-users.functions";
import { adminReleaseUserSession } from "@/lib/session.functions";
import { ROLE_LABEL, LEADER_DEPT_NAMES, STATUS_LABEL, type AppRole } from "@/lib/auth-utils";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "ADMIN — ระบบแจ้งซ่อม" }] }),
  component: () => (<RequireRole role="admin"><AdminPage /></RequireRole>),
});

type Dept = { id: string; name: string };
type MType = { id: string; name: string; department_id: string | null };
type Machine = { id: string; name: string; code: string | null; machine_type_id: string | null; repair_department_id: string | null };
type UserRow = {
  id: string; code: string; full_name: string;
  department_id: string | null; department_name: string | null; role: AppRole;
  allowed_repair_dept_ids: string[];
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
    const [{ data: jobsRows }, { data: usersRows }, { data: rolesRows }, { data: deptRows }, { data: mtRows }, { data: mRows }] =
      await Promise.all([
        supabase.from("repair_jobs").select("*, departments(name)")
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, code, full_name, department_id, allowed_repair_dept_ids, departments(name)").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("departments").select("*").order("name"),
        supabase.from("machine_types").select("*").order("name"),
        supabase.from("machines").select("*").order("name"),
      ]);
    const roleMap = new Map<string, AppRole>();
    rolesRows?.forEach((r) => roleMap.set(r.user_id, r.role as AppRole));
    const enrichedUsers: UserRow[] = (usersRows ?? []).map((u) => ({
      id: u.id, code: u.code, full_name: u.full_name,
      department_id: u.department_id,
      department_name: (u as unknown as { departments?: { name?: string } | null }).departments?.name ?? null,
      role: roleMap.get(u.id) ?? "reporter",
      allowed_repair_dept_ids: ((u as unknown as { allowed_repair_dept_ids?: string[] | null }).allowed_repair_dept_ids ?? []) as string[],
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
          <TabsTrigger value="setup"><Building2 className="size-4 mr-1" />แผนก/เครื่องจักร</TabsTrigger>
        </TabsList>

        <TabsContent value="status"><JobList jobs={filteredJobs(["pending_assign","in_progress","waiting_parts","external","awaiting_review"])} onView={setDetail} onEdit={setEditJob} reload={loadAll} depts={depts} /></TabsContent>
        <TabsContent value="done"><JobList jobs={filteredJobs(["completed"])} onView={setDetail} onEdit={setEditJob} reload={loadAll} depts={depts} /></TabsContent>

        <TabsContent value="stats">
          <AdminStats jobs={jobs} depts={depts} />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab users={users} depts={depts} reload={loadAll} />
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

function UsersTab({ users, depts, reload }: { users: UserRow[]; depts: Dept[]; reload: () => Promise<void> }) {
  const [role, setRole] = useState<AppRole>("reporter");
  const [deptId, setDeptId] = useState<string>("none");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [allowedRepairDeptIds, setAllowedRepairDeptIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const create = useServerFn(adminCreateUser);
  const update = useServerFn(adminUpdateUser);
  const del = useServerFn(adminDeleteUser);
  const kick = useServerFn(adminReleaseUserSession);

  const repairDeptChoices = depts.filter((d) => (LEADER_DEPT_NAMES as readonly string[]).includes(d.name));
  const toggleAllowed = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const restrictedDeptRoles: AppRole[] = ["leader", "repairer"];
  const deptOptionsFor = (r: AppRole) =>
    restrictedDeptRoles.includes(r)
      ? depts.filter((d) => (LEADER_DEPT_NAMES as readonly string[]).includes(d.name))
      : depts;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) { toast.error("กรอกข้อมูลให้ครบ"); return; }
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      await create({ data: {
        access_token: token,
        code: code.trim(),
        full_name: name.trim(),
        role,
        department_id: deptId === "none" ? null : deptId,
        allowed_repair_dept_ids: role === "reporter" ? allowedRepairDeptIds : [],
      }});
      toast.success("เพิ่มผู้ใช้งานสำเร็จ");
      setCode(""); setName(""); setAllowedRepairDeptIds([]);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("ลบผู้ใช้งานนี้?")) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      await del({ data: { access_token: token, id } });
      toast.success("ลบแล้ว");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    }
  };

  const onKick = async (u: UserRow) => {
    if (!confirm(`บังคับออกจากระบบรหัส ${u.code}?`)) return;
    try {
      await kick({ data: { user_id: u.id } });
      toast.success("บังคับออกจากระบบแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    if (!editUser.code.trim() || !editUser.full_name.trim()) {
      toast.error("กรอกข้อมูลให้ครบ"); return;
    }
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      await update({ data: {
        access_token: token,
        id: editUser.id,
        code: editUser.code.trim(),
        full_name: editUser.full_name.trim(),
        role: editUser.role,
        department_id: editUser.department_id,
        allowed_repair_dept_ids: editUser.role === "reporter" ? (editUser.allowed_repair_dept_ids ?? []) : [],
      }});
      toast.success("บันทึกแล้ว");
      setEditUser(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    }
  };

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4">
      <form onSubmit={submit} className="card-soft p-5 space-y-3 self-start">
        <h3 className="font-bold flex items-center gap-2"><UserPlus className="size-4" /> เพิ่มผู้ใช้งาน</h3>
        <div>
          <Label>ประเภทผู้ใช้งาน</Label>
          <Select value={role} onValueChange={(v) => { setRole(v as AppRole); setDeptId("none"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reporter">{ROLE_LABEL.reporter}</SelectItem>
              <SelectItem value="repairer">{ROLE_LABEL.repairer}</SelectItem>
              <SelectItem value="leader">{ROLE_LABEL.leader}</SelectItem>
              <SelectItem value="department_head">{ROLE_LABEL.department_head}</SelectItem>
              <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{role === "leader" ? "สังกัด (หัวหน้าผู้ซ่อม)" : role === "repairer" ? "สังกัดผู้ซ่อม" : "สังกัดแผนก"}</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— ไม่มี —</SelectItem>
              {deptOptionsFor(role).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {role === "reporter" && (
          <div className="space-y-1">
            <Label>กำหนดสังกัดผู้ซ่อมที่เลือกได้</Label>
            <div className="text-xs text-muted-foreground">ผู้แจ้งจะเห็นเฉพาะสังกัดที่ติ๊กไว้เท่านั้น (ไม่ติ๊กเลย = เห็นทั้งหมด)</div>
            <div className="flex flex-col gap-1 border rounded-lg p-2">
              {repairDeptChoices.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedRepairDeptIds.includes(d.id)}
                    onChange={() => setAllowedRepairDeptIds((cur) => toggleAllowed(cur, d.id))}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>รหัสผู้ใช้งาน</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัส" />
        </div>
        <div>
          <Label>ชื่อ-นามสกุล</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          <UserPlus className="size-4 mr-1" /> เพิ่ม
        </Button>
      </form>

      <div className="card-soft p-5">
        <h3 className="font-bold mb-3">รายชื่อผู้ใช้งาน ({users.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs border-b">
                <th className="py-2">รหัส</th>
                <th>ประเภท/สังกัด</th>
                <th>ชื่อ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{u.code}</td>
                  <td>
                    <span className="status-pill bg-brand-soft text-brand">
                      {ROLE_LABEL[u.role]}{u.department_name ? ` · ${u.department_name}` : ""}
                    </span>
                  </td>
                  <td>{u.full_name}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" title="บังคับออกจากระบบ" onClick={() => onKick(u)}>
                      <LogOut className="size-4 text-warning-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditUser({ ...u })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(u.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขผู้ใช้งาน</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-3">
              <div>
                <Label>ประเภทผู้ใช้งาน</Label>
                <Select
                  value={editUser.role}
                  onValueChange={(v) => setEditUser({ ...editUser, role: v as AppRole, department_id: null })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reporter">{ROLE_LABEL.reporter}</SelectItem>
                    <SelectItem value="repairer">{ROLE_LABEL.repairer}</SelectItem>
                    <SelectItem value="leader">{ROLE_LABEL.leader}</SelectItem>
                    <SelectItem value="department_head">{ROLE_LABEL.department_head}</SelectItem>
                    <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>สังกัด</Label>
                <Select
                  value={editUser.department_id ?? "none"}
                  onValueChange={(v) => setEditUser({ ...editUser, department_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่มี —</SelectItem>
                    {deptOptionsFor(editUser.role).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editUser.role === "reporter" && (
                <div className="space-y-1">
                  <Label>กำหนดสังกัดผู้ซ่อมที่เลือกได้</Label>
                  <div className="text-xs text-muted-foreground">ผู้แจ้งจะเห็นเฉพาะสังกัดที่ติ๊กไว้ (ไม่ติ๊กเลย = เห็นทั้งหมด)</div>
                  <div className="flex flex-col gap-1 border rounded-lg p-2">
                    {repairDeptChoices.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(editUser.allowed_repair_dept_ids ?? []).includes(d.id)}
                          onChange={() => setEditUser({
                            ...editUser,
                            allowed_repair_dept_ids: toggleAllowed(editUser.allowed_repair_dept_ids ?? [], d.id),
                          })}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>รหัสผู้ใช้งาน</Label>
                <Input value={editUser.code} onChange={(e) => setEditUser({ ...editUser, code: e.target.value })} />
              </div>
              <div>
                <Label>ชื่อ-นามสกุล</Label>
                <Input value={editUser.full_name} onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>ยกเลิก</Button>
            <Button onClick={saveEdit}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
