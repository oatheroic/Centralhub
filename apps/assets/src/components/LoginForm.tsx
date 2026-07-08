import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setCurrentRole, type RoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { User, Lock } from "lucide-react";

export default function LoginForm() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !password.trim()) {
      toast.error("กรุณากรอกรหัสผู้ใช้และรหัสผ่าน");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("verify_role_login", {
      _role_code: code.trim().toUpperCase(),
      _password: password,
    });
    setLoading(false);
    if (error) {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
      return;
    }
    const row = (data as RoleInfo[] | null)?.[0];
    if (!row) {
      toast.error("รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    setCurrentRole(row.role_code, row);
    toast.success(`ยินดีต้อนรับ ${row.display_name}`);
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, #0b1a3a 0%, #04060f 55%, #000000 100%)",
      }}
    >
      {/* Animated grid background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.15) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />
      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-700/20 blur-3xl" />
      <div className="absolute top-10 right-10 w-40 h-40 rounded-full bg-red-500/10 blur-3xl" />

      <div
        className="relative w-full max-w-md rounded-2xl p-8 backdrop-blur-2xl border border-cyan-400/30 shadow-[0_0_60px_-10px_rgba(34,211,238,0.5)]"
        style={{ background: "rgba(10, 18, 40, 0.55)" }}
      >
        {/* Decorative corner accents */}
        <div className="absolute -top-px -left-px w-10 h-10 border-t-2 border-l-2 border-cyan-400 rounded-tl-2xl" />
        <div className="absolute -top-px -right-px w-10 h-10 border-t-2 border-r-2 border-cyan-400 rounded-tr-2xl" />
        <div className="absolute -bottom-px -left-px w-10 h-10 border-b-2 border-l-2 border-cyan-400 rounded-bl-2xl" />
        <div className="absolute -bottom-px -right-px w-10 h-10 border-b-2 border-r-2 border-cyan-400 rounded-br-2xl" />

        <div className="text-center mb-8">
          <h1
            className="text-4xl md:text-5xl font-black tracking-wider text-red-500 uppercase"
            style={{
              textShadow:
                "0 0 20px rgba(239,68,68,0.7), 0 0 40px rgba(239,68,68,0.4)",
            }}
          >
            BIG ONE GROUP
          </h1>
          <p
            className="mt-3 text-sm md:text-base font-bold text-cyan-300"
            style={{ textShadow: "0 0 10px rgba(34,211,238,0.6)" }}
          >
            ระบบบันทึกภายใน (Internal Recording System)
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 w-5 h-5 pointer-events-none" />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Username / รหัสผู้ใช้งาน"
              autoFocus
              autoComplete="username"
              className="pl-10 h-12 bg-slate-900/60 border-cyan-500/30 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:border-cyan-400 focus-visible:shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 w-5 h-5 pointer-events-none" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password / รหัสผ่าน"
              autoComplete="current-password"
              className="pl-10 h-12 bg-slate-900/60 border-cyan-500/30 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:border-cyan-400 focus-visible:shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-bold tracking-wide bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-white border-0 shadow-[0_0_20px_rgba(34,211,238,0.5)] hover:shadow-[0_0_35px_rgba(34,211,238,0.9)] transition-all duration-300"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "ล็อกอินเข้าสู่ระบบ / Login"}
          </Button>

          <div className="text-center pt-2">
            <a
              href="#"
              className="text-xs text-slate-400 hover:text-cyan-300 transition-colors"
            >
              Forgot password? / ลืมรหัสผ่าน?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
