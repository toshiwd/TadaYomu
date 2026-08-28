export interface VersionManifest {
  version: string;
  apkUrl: string;
  releaseNotes: string;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function parseVersionManifest(text: string): VersionManifest {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, "").trim()) as Partial<VersionManifest>;
  if (!/^\d+\.\d+\.\d+$/.test(parsed.version ?? "")) {
    throw new Error("更新バージョンが不正です");
  }
  const apkUrl = new URL(parsed.apkUrl ?? "");
  if (apkUrl.protocol !== "https:" || apkUrl.hostname !== "github.com") {
    throw new Error("APKの配布URLが不正です");
  }
  if (!apkUrl.pathname.endsWith(".apk")) {
    throw new Error("APKの配布URLが不正です");
  }
  return {
    version: parsed.version!,
    apkUrl: apkUrl.toString(),
    releaseNotes: parsed.releaseNotes?.trim() || "安定性と使いやすさを改善しました",
  };
}
