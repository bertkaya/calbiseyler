"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { useT } from "./LangProvider";

export function RemixButton({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { t } = useT();
  return (
    <button className="btn btn-primary" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await api<{ playlist: { id: string } }>(`/api/share/${shareId}/remix`, { method: "POST" }); router.push(`/playlist/${r.playlist.id}`); }
      finally { setBusy(false); }
    }}>{t("share.remix")}</button>
  );
}
