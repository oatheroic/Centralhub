import { useState } from "react";
import { Button, Input, useToast } from "@centralhub/ui";

// The one Phase 1 notification producer with no existing admin action to
// piggyback a side-effect onto (permission grants/session revoke already
// have their own buttons/panels) — see services/auth-gateway's
// routes/adminAnnouncements.ts. Deliberately minimal: title + body, fans
// out to every user immediately, no draft/schedule/audience-targeting step.
export function AnnouncementsPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  async function handleSend() {
    if (!title.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/auth/admin/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, link: link.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast.show({ tone: "success", title: "Announcement sent" });
      setTitle("");
      setBody("");
      setLink("");
    } catch (err) {
      toast.show({ tone: "danger", title: "Couldn't send announcement", description: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="max-w-xl space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text">Announce</h2>
        <p className="text-text-muted">
          Sends a notification to every user's notification bell immediately. There's no
          draft or schedule step — this goes out as soon as you click Send.
        </p>
      </header>

      <div className="space-y-3">
        <div>
          <label htmlFor="announce-title" className="mb-1 block text-sm font-medium text-text">
            Title
          </label>
          <Input
            id="announce-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Planned maintenance this weekend"
          />
        </div>
        <div>
          <label htmlFor="announce-body" className="mb-1 block text-sm font-medium text-text">
            Body (optional)
          </label>
          <textarea
            id="announce-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Any additional detail..."
          />
        </div>
        <div>
          <label htmlFor="announce-link" className="mb-1 block text-sm font-medium text-text">
            Link (optional)
          </label>
          <Input
            id="announce-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/apps/marketing/"
          />
        </div>
        <Button onClick={handleSend} disabled={!title.trim() || sending}>
          {sending ? "Sending..." : "Send to everyone"}
        </Button>
      </div>
    </section>
  );
}
