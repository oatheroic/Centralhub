export type Announcement = {
  /** Bump this whenever the message changes, so it re-shows to users who dismissed an earlier one. */
  id: string;
  message: string;
};

// Set to a value to surface a dismissible banner on the landing page; leave
// null when there's nothing to announce. Demo placeholder below — swap the
// message (and bump the id) for a real announcement, or set to null.
export const announcement: Announcement | null = {
  id: "demo-1",
  message: "Welcome to Central Hub — this is a demo announcement banner.",
};
