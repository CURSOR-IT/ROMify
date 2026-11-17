import { ROM_LIMIT, currentUser, supabase } from "./cloud";

export interface CatalogRom {
  id: string;
  title: string;
  system: string;
  description: string | null;
  author: string;
  license: string;
  filename: string;
  file_path: string;
  cover_path: string | null;
  size: number;
  created_at: string;
}

export const LICENSES = [
  "CC0 (gemeinfrei)",
  "CC BY 4.0",
  "CC BY-SA 4.0",
  "MIT",
  "GPL-3.0",
  "Eigenwerk, freie Weitergabe erlaubt",
];

export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const { data } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
}

export async function listCatalog(): Promise<CatalogRom[]> {
  const { data, error } = await supabase.from("catalog_roms").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CatalogRom[];
}

/** Signierte Cover-URLs (1 Stunde gültig), eine Abfrage für alle. */
export async function coverUrls(items: CatalogRom[]): Promise<Map<string, string>> {
  const withCover = items.filter((i) => i.cover_path);
  const out = new Map<string, string>();
  if (!withCover.length) return out;
  const { data } = await supabase.storage.from("catalog").createSignedUrls(
    withCover.map((i) => i.cover_path!),
    3600,
  );
  for (const row of data ?? []) {
    const item = withCover.find((i) => i.cover_path === row.path);
    if (item && row.signedUrl) out.set(item.id, row.signedUrl);
  }
  return out;
}

export async function downloadCatalogRom(rom: CatalogRom, onProgress?: (fraction: number) => void): Promise<Blob> {
  if (onProgress) {
    // Streaming-Download über eine kurzlebige signierte URL, damit ein Fortschritt angezeigt werden kann.
    try {
      const signed = await supabase.storage.from("catalog").createSignedUrl(rom.file_path, 300);
      if (signed.data?.signedUrl) {
        const res = await fetch(signed.data.signedUrl);
        if (res.ok && res.body) {
          const total = Number(res.headers.get("content-length")) || rom.size;
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            onProgress(Math.min(1, got / total));
          }
          return new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
        }
      }
    } catch {
      /* Fallback unten */
    }
  }
  const { data, error } = await supabase.storage.from("catalog").download(rom.file_path);
  if (error || !data) throw error ?? new Error("Download fehlgeschlagen");
  return data;
}

export interface UploadInput {
  title: string;
  system: string;
  author: string;
  license: string;
  description: string;
  rom: File;
  cover?: File;
}

export async function adminUpload(i: UploadInput) {
  if (i.rom.size > ROM_LIMIT) {
    throw new Error(`Datei zu groß (${(i.rom.size / 1048576).toFixed(0)} MB). Im kostenlosen Tarif sind max. 50 MB erlaubt.`);
  }
  const id = crypto.randomUUID();
  const romPath = `${id}/rom.bin`;
  const coverPath = i.cover ? `${id}/cover` : null;
  const bucket = supabase.storage.from("catalog");
  const up = await bucket.upload(romPath, i.rom, { contentType: "application/octet-stream" });
  if (up.error) throw up.error;
  if (i.cover && coverPath) {
    const c = await bucket.upload(coverPath, i.cover, { contentType: i.cover.type || "image/png" });
    if (c.error) {
      await bucket.remove([romPath]);
      throw c.error;
    }
  }
  const { error } = await supabase.from("catalog_roms").insert({
    id,
    title: i.title,
    system: i.system,
    description: i.description || null,
    author: i.author,
    license: i.license,
    filename: i.rom.name,
    file_path: romPath,
    cover_path: coverPath,
    size: i.rom.size,
  });
  if (error) {
    await bucket.remove([romPath, ...(coverPath ? [coverPath] : [])]);
    throw error;
  }
}

export async function adminDelete(rom: CatalogRom) {
  await supabase.storage.from("catalog").remove([rom.file_path, ...(rom.cover_path ? [rom.cover_path] : [])]);
  const { error } = await supabase.from("catalog_roms").delete().eq("id", rom.id);
  if (error) throw error;
}

export async function reportRom(romId: string, reason: string) {
  const { error } = await supabase.from("catalog_reports").insert({ rom_id: romId, reason });
  if (error) throw error;
}

export interface Report {
  id: string;
  rom_id: string;
  reason: string;
  created_at: string;
}

export async function listReports(): Promise<Report[]> {
  const { data, error } = await supabase.from("catalog_reports").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as Report[];
}

export async function dismissReport(id: string) {
  await supabase.from("catalog_reports").delete().eq("id", id);
}
