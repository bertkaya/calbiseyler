"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

export function RemixButton({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-primary" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await api<{ playlist: { id: string } }>(`/api/share/${shareId}/remix`, { method: "POST" }); router.push(`/playlist/${r.playlist.id}`); }
      finally { setBusy(false); }
    }}>✨ Remix this</button>
  );
}
