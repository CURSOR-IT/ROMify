// Liest Metadaten direkt aus dem ROM-Header (Titel, Code, Hersteller, Region, Version, ...).
// Alles läuft lokal im Browser, die Datei wird dafür nicht hochgeladen.

export interface RomInfo {
  core?: string; // Emulator-Core, z. B. "gba"
  consoleLabel?: string; // z. B. "Game Boy Color"
  title?: string;
  code?: string;
  maker?: string;
  region?: string;
  version?: string;
  headerOk: boolean;
  size: number;
  sha1: string;
  details: [string, string][];
  notes: string[];
  iconRgba?: Uint8ClampedArray; // 32x32 RGBA (nur Nintendo DS)
}

const EXT_CORE: Record<string, string> = {
  nds: "nds", z64: "n64", n64: "n64", v64: "n64", gba: "gba", gb: "gb", gbc: "gb", nes: "nes",
  sfc: "snes", smc: "snes", md: "segaMD", gen: "segaMD", sms: "segaMS", gg: "segaGG", iso: "psx", cue: "psx", pbp: "psx",
};

export function coreFromName(name: string): string | undefined {
  return EXT_CORE[name.split(".").pop()?.toLowerCase() ?? ""];
}

const MAKERS: Record<string, string> = {
  "01": "Nintendo", "08": "Capcom", "13": "Electronic Arts", "18": "Hudson Soft", "29": "Seta", "31": "Nintendo",
  "32": "Bandai", "33": "Ocean / Acclaim", "34": "Konami", "41": "Ubisoft", "4F": "Eidos", "50": "Absolute",
  "51": "Acclaim", "52": "Activision", "54": "Konami", "56": "LJN", "5D": "Midway", "5G": "Majesco", "60": "Titus",
  "64": "LucasArts", "67": "Ocean", "69": "Electronic Arts", "6S": "TDK Mediactive", "70": "Infogrames", "78": "THQ",
  "7D": "Vivendi", "8P": "Sega", "A4": "Konami", "AF": "Namco", "B2": "Bandai", "BL": "MTO", "C3": "Square Enix",
  "DA": "Tomy", "E9": "Natsume", "EB": "Atlus", "G9": "D3 Publisher",
};

const REGION: Record<string, string> = {
  J: "Japan", E: "USA", P: "Europa", D: "Deutschland", F: "Frankreich", I: "Italien", S: "Spanien", U: "Australien",
  K: "Korea", C: "China", H: "Niederlande", X: "Europa", Y: "Europa", Z: "Europa", A: "Asien", O: "International",
  W: "Skandinavien", V: "Skandinavien", "7": "Beta",
};

const SNES_REGION: Record<number, string> = {
  0: "Japan", 1: "USA", 2: "Europa", 3: "Skandinavien", 6: "Frankreich", 7: "Niederlande", 8: "Spanien",
  9: "Deutschland", 10: "Italien", 11: "China", 13: "Korea", 15: "Kanada", 16: "Brasilien", 17: "Australien",
};

const CONSOLE_LABEL: Record<string, string> = {
  nds: "Nintendo DS", n64: "Nintendo 64", gba: "Game Boy Advance", gb: "Game Boy", nes: "NES", snes: "SNES",
  segaMD: "Sega Mega Drive", segaMS: "Sega Master System", segaGG: "Sega Game Gear", psx: "PlayStation",
};

async function bytes(file: Blob, start: number, len: number): Promise<Uint8Array> {
  if (start < 0 || start >= file.size) return new Uint8Array(0);
  return new Uint8Array(await file.slice(start, Math.min(file.size, start + len)).arrayBuffer());
}

function ascii(b: Uint8Array): string {
  let s = "";
  for (const c of b) {
    if (c === 0) break;
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : " ";
  }
  return s.replace(/\s+/g, " ").trim();
}

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const printable = (s: string) => /^[\x20-\x7e]+$/.test(s);
const makerName = (code: string) => {
  const c = code.trim();
  if (!c || c === "00" || !printable(c)) return undefined;
  return MAKERS[c.toUpperCase()] ?? `Herstellercode ${c}`;
};
const kb = (n: number) => (n >= 1024 ? `${n / 1024} MB` : `${n} KB`);

async function sha1Hex(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Parsed = Partial<Omit<RomInfo, "size" | "sha1" | "notes" | "details">> & { details?: [string, string][]; notes?: string[] };

/* ---- Game Boy Advance ---- */
async function parseGba(f: Blob): Promise<Parsed> {
  const b = await bytes(f, 0, 0xc0);
  if (b.length < 0xc0 || b[0xb2] !== 0x96) return { headerOk: false, notes: ["GBA-Header nicht erkannt."] };
  const code = ascii(b.slice(0xac, 0xb0));
  return {
    headerOk: true,
    title: ascii(b.slice(0xa0, 0xac)),
    code,
    maker: makerName(ascii(b.slice(0xb0, 0xb2))),
    region: REGION[code[3] ?? ""],
    version: `1.${b[0xbc]}`,
  };
}

/* ---- Game Boy / Game Boy Color ---- */
const GB_TYPE: Record<number, string> = {
  0: "nur ROM", 1: "MBC1", 2: "MBC1 + RAM", 3: "MBC1 + RAM + Akku", 5: "MBC2", 6: "MBC2 + Akku", 0x0f: "MBC3 + Uhr + Akku",
  0x10: "MBC3 + Uhr + RAM + Akku", 0x11: "MBC3", 0x12: "MBC3 + RAM", 0x13: "MBC3 + RAM + Akku", 0x19: "MBC5",
  0x1a: "MBC5 + RAM", 0x1b: "MBC5 + RAM + Akku", 0x1c: "MBC5 + Rumble", 0x1e: "MBC5 + RAM + Akku + Rumble",
};
async function parseGb(f: Blob): Promise<Parsed> {
  const b = await bytes(f, 0x100, 0x50);
  if (b.length < 0x50 || b[4] !== 0xce || b[5] !== 0xed || b[6] !== 0x66 || b[7] !== 0x66) {
    return { headerOk: false, notes: ["Game-Boy-Header nicht erkannt."] };
  }
  const cgb = b[0x43] === 0x80 || b[0x43] === 0xc0;
  const title = ascii(b.slice(0x34, cgb ? 0x3f : 0x44));
  const old = b[0x4b];
  const maker = old === 0x33 ? makerName(ascii(b.slice(0x44, 0x46))) : old === 0x01 ? "Nintendo" : undefined;
  return {
    headerOk: true,
    consoleLabel: cgb ? "Game Boy Color" : "Game Boy",
    title,
    maker,
    region: b[0x4a] === 0 ? "Japan" : "Weltweit",
    version: `1.${b[0x4c]}`,
    details: [
      ["Modul-Typ", GB_TYPE[b[0x47]] ?? `0x${b[0x47].toString(16)}`],
      ["ROM-Größe", kb(32 << b[0x48])],
    ],
  };
}

/* ---- NES (iNES) ---- */
async function parseNes(f: Blob): Promise<Parsed> {
  const b = await bytes(f, 0, 16);
  if (b.length < 16 || b[0] !== 0x4e || b[1] !== 0x45 || b[2] !== 0x53 || b[3] !== 0x1a) {
    return { headerOk: false, notes: ["iNES-Header nicht erkannt."] };
  }
  const mapper = (b[7] & 0xf0) | (b[6] >> 4);
  return {
    headerOk: true,
    details: [
      ["Mapper", String(mapper)],
      ["Programm-ROM", kb(b[4] * 16)],
      ["Grafik-ROM", b[5] ? kb(b[5] * 8) : "RAM"],
      ["Akku-Speicher", b[6] & 2 ? "ja" : "nein"],
      ["Format", (b[7] & 0x0c) === 8 ? "NES 2.0" : "iNES"],
    ],
    notes: ["NES-ROMs enthalten keinen Titel, bitte den Titel selbst eintragen."],
  };
}

/* ---- SNES ---- */
async function parseSnes(f: Blob): Promise<Parsed> {
  const copier = f.size % 1024 === 512 ? 512 : 0;
  for (const [base, map] of [[0x7fc0, "LoROM"], [0xffc0, "HiROM"], [0x40ffc0, "ExHiROM"]] as const) {
    const b = await bytes(f, base + copier, 0x30);
    if (b.length < 0x30) continue;
    const complement = (b[0x1c] | (b[0x1d] << 8)) + (b[0x1e] | (b[0x1f] << 8));
    const title = ascii(b.slice(0, 21));
    if (complement === 0xffff && title.length > 0) {
      return {
        headerOk: true,
        title,
        region: SNES_REGION[b[0x19]],
        version: `1.${b[0x1b]}`,
        details: [["Speicherlayout", map], ["ROM-Größe", kb(1 << b[0x17])]],
      };
    }
  }
  return { headerOk: false, notes: ["SNES-Header nicht erkannt."] };
}

/* ---- Sega Mega Drive ---- */
async function parseMd(f: Blob): Promise<Parsed> {
  const b = await bytes(f, 0x100, 0x100);
  if (b.length < 0xf3 || ascii(b.slice(0, 4)) !== "SEGA") return { headerOk: false, notes: ["Mega-Drive-Header nicht erkannt."] };
  const overseas = ascii(b.slice(0x50, 0x80));
  const domestic = ascii(b.slice(0x20, 0x50));
  const reg = ascii(b.slice(0xf0, 0xf3));
  const names = [...reg].map((c) => ({ J: "Japan", U: "USA", E: "Europa" })[c]).filter(Boolean);
  return {
    headerOk: true,
    title: overseas || domestic,
    code: ascii(b.slice(0x80, 0x8e)),
    maker: ascii(b.slice(0x10, 0x20)).replace(/^\(C\)/i, "").replace(/^\(c\)/i, "").trim() || undefined,
    region: names.join(" / ") || undefined,
  };
}

/* ---- Sega Master System / Game Gear ---- */
async function parseSms(f: Blob): Promise<Parsed> {
  for (const base of [0x7ff0, 0x3ff0, 0x1ff0]) {
    const b = await bytes(f, base, 16);
    if (b.length === 16 && ascii(b.slice(0, 8)) === "TMR SEGA") {
      const r = b[15] >> 4;
      const region = ({ 3: "Japan", 4: "Export", 5: "Japan", 6: "Export", 7: "International" } as Record<number, string>)[r];
      const code = ((b[14] >> 4) * 10000 + (b[13] >> 4) * 1000 + (b[13] & 15) * 100 + (b[12] >> 4) * 10 + (b[12] & 15)).toString();
      return { headerOk: true, region, code, version: `1.${b[14] & 15}`, consoleLabel: r >= 5 ? "Sega Game Gear" : "Sega Master System" };
    }
  }
  return { headerOk: false, notes: ["Master-System/Game-Gear-Header nicht erkannt."] };
}

/* ---- Nintendo 64 (z64 / v64 / n64) ---- */
async function parseN64(f: Blob): Promise<Parsed> {
  const raw = await bytes(f, 0, 0x40);
  if (raw.length < 0x40) return { headerOk: false, notes: ["N64-Header nicht erkannt."] };
  const b = raw.slice();
  const m = ((raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]) >>> 0;
  let order = "z64 (Big Endian)";
  if (m === 0x37804012) {
    order = "v64 (Byte-getauscht)";
    for (let i = 0; i + 1 < b.length; i += 2) [b[i], b[i + 1]] = [raw[i + 1], raw[i]];
  } else if (m === 0x40123780) {
    order = "n64 (Little Endian)";
    for (let i = 0; i + 3 < b.length; i += 4) {
      b[i] = raw[i + 3]; b[i + 1] = raw[i + 2]; b[i + 2] = raw[i + 1]; b[i + 3] = raw[i];
    }
  } else if (m !== 0x80371240) return { headerOk: false, notes: ["N64-Header nicht erkannt."] };
  const code = ascii(b.slice(0x3b, 0x3f));
  return {
    headerOk: true,
    title: ascii(b.slice(0x20, 0x34)),
    code,
    region: REGION[String.fromCharCode(b[0x3e])],
    version: `1.${b[0x3f]}`,
    details: [["Byte-Reihenfolge", order]],
  };
}

/* ---- Nintendo DS (inkl. Banner mit Titel und Icon) ---- */
async function parseNds(f: Blob): Promise<Parsed> {
  const h = await bytes(f, 0, 0x200);
  if (h.length < 0x200) return { headerOk: false, notes: ["NDS-Header nicht erkannt."] };
  const code = ascii(h.slice(0x0c, 0x10));
  const out: Parsed = {
    headerOk: /^[A-Z0-9]{4}$/.test(code),
    title: ascii(h.slice(0, 12)),
    code,
    maker: makerName(ascii(h.slice(0x10, 0x12))),
    region: REGION[code[3] ?? ""],
    version: `1.${h[0x1e]}`,
    details: [["Gerätetyp", h[0x12] === 0 ? "Nintendo DS" : h[0x12] === 2 ? "DS + DSi" : "DSi"]],
  };
  const bo = u32(h, 0x68);
  if (bo && bo + 0x840 <= f.size) {
    const bn = await bytes(f, bo, 0x840);
    // Titel (UTF-16LE), Sprachen: 0 JP, 1 EN, 2 FR, 3 DE, ...
    for (const lang of [1, 3, 0]) {
      const raw = bn.slice(0x240 + lang * 0x100, 0x240 + (lang + 1) * 0x100);
      const text = new TextDecoder("utf-16le").decode(raw).replace(/\0.*$/s, "").trim();
      if (text) {
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          out.maker = out.maker ?? lines[lines.length - 1];
          out.title = lines.slice(0, -1).join(": ");
        } else out.title = lines[0];
        break;
      }
    }
    // Icon: 32x32, 4 Bit, 16 Farben (BGR555), Kacheln à 8x8
    const pal = new Uint16Array(16);
    for (let i = 0; i < 16; i++) pal[i] = bn[0x220 + i * 2] | (bn[0x221 + i * 2] << 8);
    const rgba = new Uint8ClampedArray(32 * 32 * 4);
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const byte = bn[0x20 + (ty * 4 + tx) * 32 + y * 4 + (x >> 1)];
            const n = x & 1 ? byte >> 4 : byte & 15;
            const c = pal[n];
            const o = ((ty * 8 + y) * 32 + tx * 8 + x) * 4;
            rgba[o] = ((c & 31) * 255) / 31;
            rgba[o + 1] = (((c >> 5) & 31) * 255) / 31;
            rgba[o + 2] = (((c >> 10) & 31) * 255) / 31;
            rgba[o + 3] = n === 0 ? 0 : 255;
          }
        }
      }
    }
    out.iconRgba = rgba;
  } else (out.notes ??= []).push("Kein Banner (Titel/Icon) gefunden.");
  return out;
}

/* ---- PlayStation (nur ISO: Name des Datenträgers) ---- */
async function parsePsx(f: Blob, name: string): Promise<Parsed> {
  if (!/\.iso$/i.test(name)) return { headerOk: false, notes: ["Bei PlayStation-Abbildern (cue/pbp) bitte die Angaben selbst eintragen."] };
  const b = await bytes(f, 0x8000, 0x60);
  if (b.length < 0x48 || ascii(b.slice(1, 6)) !== "CD001") return { headerOk: false, notes: ["ISO-Header nicht erkannt."] };
  return { headerOk: true, title: ascii(b.slice(0x28, 0x48)).replace(/_/g, " ") || undefined };
}

/** Liest Header-Infos aus einer ROM-Datei. Wirft nie, Unbekanntes landet in `notes`. */
export async function readRomInfo(file: File): Promise<RomInfo> {
  const core = coreFromName(file.name);
  const info: RomInfo = { core, headerOk: false, size: file.size, sha1: "", details: [], notes: [] };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (ext === "zip" || ext === "7z") {
      info.notes.push("Archive (.zip/.7z) können hier nicht gelesen werden, bitte die Angaben selbst eintragen.");
    } else if (!core) {
      info.notes.push("Dateityp nicht erkannt, bitte Konsole selbst wählen.");
    } else {
      const parse = { gba: parseGba, gb: parseGb, nes: parseNes, snes: parseSnes, segaMD: parseMd, segaMS: parseSms, segaGG: parseSms, n64: parseN64, nds: parseNds } as Record<string, (f: Blob) => Promise<Parsed>>;
      const p = core === "psx" ? await parsePsx(file, file.name) : await parse[core](file);
      Object.assign(info, { ...p, details: p.details ?? [], notes: p.notes ?? [] });
      info.consoleLabel = p.consoleLabel ?? CONSOLE_LABEL[core];
      if (p.consoleLabel?.includes("Game Gear")) info.core = "segaGG";
      else if (p.consoleLabel?.includes("Master System")) info.core = "segaMS";
    }
    info.sha1 = await sha1Hex(file);
  } catch (e) {
    info.notes.push("Header konnte nicht gelesen werden: " + (e as Error).message);
  }
  return info;
}

/** Macht aus einem rohen Dateinamen und Header-Titel einen lesbaren Titel. */
export function tidyTitle(raw: string | undefined, filename: string): string {
  let t = (raw ?? "").replace(/_/g, " ").trim();
  if (!t || t.length < 2) t = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  if (t === t.toUpperCase() && /[A-Z]{3,}/.test(t)) t = t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return t;
}
