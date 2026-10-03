import type { MusicProvider, ProviderId } from "./types";
import { spotifyProvider } from "./spotify";
import { appleProvider } from "./apple";
import { youtubeProvider } from "./youtube";
import { deezerProvider } from "./deezer";

export const PROVIDERS: Record<ProviderId, MusicProvider> = {
  spotify: spotifyProvider,
  apple: appleProvider,
  youtube: youtubeProvider,
  deezer: deezerProvider,
};

export function provider(id: string): MusicProvider | null {
  return (PROVIDERS as Record<string, MusicProvider>)[id] ?? null;
}

export function providerStatus() {
  return (Object.values(PROVIDERS) as MusicProvider[]).map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.isConfigured(),
    capabilities: p.capabilities,
  }));
}
