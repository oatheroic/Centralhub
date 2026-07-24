import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-soft p-8 max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">ไม่พบหน้านี้</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          หน้าที่คุณมองหาไม่มีอยู่ หรือถูกย้ายไปแล้ว
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-soft p-8 max-w-md text-center">
        <h1 className="text-xl font-semibold">เกิดข้อผิดพลาด</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            ลองใหม่
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm">หน้าแรก</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ระบบแจ้งซ่อม Big One Group" },
      { name: "description", content: "ระบบแจ้งซ่อม Tap. Track. Fix" },
      { property: "og:title", content: "ระบบแจ้งซ่อม Big One Group" },
      { name: "twitter:title", content: "ระบบแจ้งซ่อม Big One Group" },
      { property: "og:description", content: "ระบบแจ้งซ่อม Tap. Track. Fix" },
      { name: "twitter:description", content: "ระบบแจ้งซ่อม Tap. Track. Fix" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/NKRsLFLJpkfN8vQQ4nCzAG5RFCm1/social-images/social-1780647095854-รร.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/NKRsLFLJpkfN8vQQ4nCzAG5RFCm1/social-images/social-1780647095854-รร.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
