"use client";
/**
 * Apple MusicKit JS v3 loader + authorize flow.
 * Docs: https://developer.apple.com/documentation/musickitjs
 */
import { api } from "./api";

interface MusicKitInstance { authorize(): Promise<string>; storefrontId?: string; unauthorize(): Promise<void> }
interface MusicKitGlobal { configure(o: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance> | MusicKitInstance; getInstance(): MusicKitInstance }
declare global { interface Window { MusicKit?: MusicKitGlobal } }

let loading: Promise<MusicKitGlobal> | null = null;

function loadScript(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  loading ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MusicKit load timeout")), 15000);
    document.addEventListener("musickitloaded", () => { clearTimeout(timer); window.MusicKit ? resolve(window.MusicKit) : reject(new Error("MusicKit missing")); }, { once: true });
    const s = document.createElement("script");
    s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    s.async = true;
    s.dataset.webComponents = "";
    s.onerror = () => { clearTimeout(timer); loading = null; reject(new Error("Could not load MusicKit JS")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Apple's sign-in, then stores the Music User Token server-side. */
export async function connectAppleMusic(): Promise<void> {
  const { developerToken, appName } = await api<{ developerToken: string; appName: string }>("/api/auth/apple/token");
  const MK = await loadScript();
  const music = await MK.configure({ developerToken, app: { name: appName, build: "1.0.0" } });
  const musicUserToken = await music.authorize();
  if (!musicUserToken) throw new Error("Apple Music authorization was cancelled");
  await api("/api/auth/apple/connect", { method: "POST", body: { musicUserToken, storefront: music.storefrontId } });
}
