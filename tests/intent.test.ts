import { describe, expect, it } from "vitest";
import { parseIntentRules } from "../src/lib/ai/intent-rules";
import { planEdit } from "../src/lib/ai/edit-rules";
import { understand } from "../src/lib/ai/intent";
import { defaultBrief } from "../src/lib/engine/brief";

describe("rule-based intent parser (TR/EN)", () => {
  it("Example 1 — 2 saatlik eller havaya eski Türkçe şarkılar", () => {
    const r = parseIntentRules("2 saatlik eller havaya eski Türkçe şarkılar.");
    expect(r.patch.durationMin).toBe(120);
    expect(r.patch.turkishShare).toBe(1);
    expect(r.patch.energy).toBe(9);
    expect(r.patch.nostalgia).toBeGreaterThanOrEqual(8);
    expect(r.patch.eraTo).toBeLessThanOrEqual(2006);
    expect(r.patch.activity).toBe("party");
  });

  it("Example 2 — rakı sofrası with calm start", () => {
    const r = parseIntentRules("3 saatlik rakı sofrası. Türkçe. Herkes eşlik etsin. İlk başta sakin sonra coşsun.");
    expect(r.patch.activity).toBe("raki");
    expect(r.patch.durationMin).toBe(180);
    expect(r.patch.singalong).toBe(true);
    expect(["peak_late", "party_curve"]).toContain(r.patch.flow);
    expect(r.patch.genres).toEqual(expect.arrayContaining(["tsm", "thm"]));
    expect(r.patch.moods ?? []).not.toContain("chill");
  });

  it("Example 3 — 90'lar Türkçe pop ama çok cheesy olmasın (soft avoid)", () => {
    const r = parseIntentRules("90'lar Türkçe pop ama çok cheesy olmasın.");
    expect(r.patch.eraFrom).toBe(1990);
    expect(r.patch.eraTo).toBe(1999);
    expect(r.patch.eraStrict).toBe(true);
    expect(r.patch.genres).toContain("tr-pop");
    expect(r.patch.avoidTags).toContain("cheesy");
    expect(r.patch.exclude?.tags ?? []).not.toContain("cheesy");
  });

  it("Example 4 — wedding 4 hours", () => {
    const r = parseIntentRules("Bana düğünde ilk dans sonrası başlayacak 4 saatlik playlist yap.");
    expect(r.patch.activity).toBe("wedding");
    expect(r.patch.durationMin).toBe(240);
    expect(r.patch.explicit).toBe(false);
  });

  it("Example 5 — road trip, mixed language, gradual rise", () => {
    const r = parseIntentRules("2 saatlik road trip. Türkçe + yabancı karışık. Enerji giderek artsın.");
    expect(r.patch.turkishShare).toBe(0.5);
    expect(r.patch.flow).toBe("gradual_rise");
    expect(r.patch.activity).toBe("driving");
  });

  it("Example 8 — Tarkan kalsın ama Sezen Aksu olmasın", () => {
    const r = parseIntentRules("Tarkan kalsın ama Sezen Aksu olmasın");
    expect(r.patch.include?.artists).toContain("Tarkan");
    expect(r.patch.exclude?.artists).toContain("Sezen Aksu");
  });

  it("Example 9 — Beni şaşırt", () => {
    const r = parseIntentRules("Beni şaşırt.");
    expect(r.patch.discovery).toBeGreaterThanOrEqual(40);
    expect(r.signals.surprise).toBe(true);
  });

  it("soft vs hard negation for genres", () => {
    expect(parseIntentRules("arabesk olmasın").patch.exclude?.genres).toContain("arabesk");
    expect(parseIntentRules("çok arabesk olmayan bir liste").patch.avoidGenres).toContain("arabesk");
  });

  it("does not read 'popüler' as the pop genre", () => {
    const r = parseIntentRules("2 saatlik eski TSM THM popüler mutlu şarkılar");
    expect(r.patch.genres).toEqual(expect.arrayContaining(["tsm", "thm"]));
    expect(r.patch.genres).not.toContain("tr-pop");
    expect(r.patch.popularity).toBe(9);
  });

  it("dinner then party → calm first segment", () => {
    const r = parseIntentRules("Cumartesi akşamı arkadaşlar geliyor. 4 saat Türkçe olsun. İlk başta yemek yiyeceğiz, sonra içkiler başlayacak, gece ilerledikçe ortam coşsun.");
    expect(r.patch.activity).toBe("party");
    expect(r.patch.segments?.[0]).toMatchObject({ startMin: 0, delta: -2.5 });
    expect(r.patch.durationMin).toBe(240);
  });

  it("English requests", () => {
    const r = parseIntentRules("1 hour of 80s rock for a workout, no explicit");
    expect(r.lang).toBe("en");
    expect(r.patch.durationMin).toBe(60);
    expect(r.patch.eraFrom).toBe(1980);
    expect(r.patch.activity).toBe("workout");
  });

  it("exact duration", () => {
    const r = parseIntentRules("tam 2 saat türkçe pop");
    expect(r.patch.durationStrict).toBe(true);
  });
});

describe("question planner — AI yormasın", () => {
  it("asks nothing when the request is clear", async () => {
    const r = await understand("2 saatlik 90'lar Türkçe pop, yüksek enerjili, parti için.");
    expect(r.questions).toHaveLength(0);
  });
  it("asks about era for vague nostalgia", async () => {
    const r = await understand("2 saatlik Türkçe nostaljik playlist.");
    expect(r.questions.map((q) => q.id)).toContain("era");
  });
});

describe("natural-language edits", () => {
  const brief = { ...defaultBrief(), durationMin: 120, eraFrom: 1990, eraTo: 1999 };
  it("İlk 30 dakika biraz daha sakin olsun → calm segment", () => {
    const p = planEdit("İlk 30 dakika biraz daha sakin olsun.", brief, []);
    expect(p.patch.segments?.[0]).toMatchObject({ startMin: 0, endMin: 30 });
    expect(p.patch.segments?.[0].delta).toBeLessThan(0);
    expect(p.patch.energy).toBeUndefined();
  });
  it("Biraz daha 2000'ler → widen era", () => {
    const p = planEdit("Biraz daha 2000'ler", brief, []);
    expect(p.patch.eraTo).toBeGreaterThanOrEqual(2005);
  });
  it("%30 daha nostaljik", () => {
    const p = planEdit("Bunun %30 daha nostaljik versiyonunu yap", brief, []);
    expect(p.patch.nostalgia).toBeGreaterThan(brief.nostalgia);
  });
  it("remove a track by title", () => {
    const p = planEdit("Şımarık'ı çıkar", brief, [{ id: "cat:tarkan--simarik", title: "Şımarık", artist: "Tarkan" }]);
    expect(p.removeTrackIds).toContain("cat:tarkan--simarik");
  });
  it("daha modern", () => {
    const p = planEdit("Bu playlisti al ve daha modern yap", brief, []);
    expect(p.notes).toContain("more_modern");
    expect(p.patch.eraTo).toBeGreaterThan(1999);
  });
});
