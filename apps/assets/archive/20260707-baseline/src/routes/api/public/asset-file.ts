import { createFileRoute } from "@tanstack/react-router";

function encodeObjectPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
}

export const Route = createFileRoute("/api/public/asset-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const path = new URL(request.url).searchParams.get("path") ?? "";
        if (!path || path.includes("..") || /^https?:/i.test(path)) {
          return new Response("Invalid file path", { status: 400 });
        }

        const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        if (!baseUrl) return new Response("File service is not configured", { status: 500 });

        const upstreamUrl = `${baseUrl}/storage/v1/object/public/asset-images/${encodeObjectPath(path)}`;
        const upstream = await fetch(upstreamUrl);
        if (!upstream.ok || !upstream.body) {
          return new Response("File not found", { status: upstream.status });
        }

        const headers = new Headers();
        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        const isPdf = contentType.includes("pdf") || path.toLowerCase().endsWith(".pdf");
        headers.set("content-type", contentType);
        headers.set("cache-control", "public, max-age=3600");
        headers.set("x-content-type-options", "nosniff");
        const filename = path.split("/").pop() ?? "file";
        headers.set(
          "content-disposition",
          isPdf
            ? `attachment; filename="${encodeURIComponent(filename)}"`
            : "inline",
        );

        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});