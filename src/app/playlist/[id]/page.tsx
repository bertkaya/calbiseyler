import { Suspense } from "react";
import { PlaylistStudio } from "@/components/PlaylistStudio";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="skeleton section" style={{ height: 320 }} />}>
      <PlaylistStudio id={id} />
    </Suspense>
  );
}
