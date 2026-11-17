import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const cloudConfigured = Boolean(url && anon);
export const supabase = createClient(url ?? "http://localhost", anon ?? "anon");

export interface CloudGame {
  game_key: string;
  title: string;
  system: string;
  playtime_sec: number;
  last_played: string;
}

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function listCloudGames(): Promise<CloudGame[]> {
  const { data, error } = await supabase.from("games").select("*").order("last_played", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudGame[];
}

export async function upsertGame(g: { key: string; title: string; system: string }, addSeconds: number) {
  const user = await currentUser();
  if (!user) return;
  const { data } = await supabase
    .from("games")
    .select("playtime_sec")
    .eq("user_id", user.id)
    .eq("game_key", g.key)
    .maybeSingle();
  const { error } = await supabase.from("games").upsert({
    user_id: user.id,
    game_key: g.key,
    title: g.title,
    system: g.system,
    playtime_sec: (data?.playtime_sec ?? 0) + Math.round(addSeconds),
    last_played: new Date().toISOString(),
  });
  if (error) throw error;
}

const statePath = (uid: string, key: string) => `${uid}/${key}/state.bin`;

export async function uploadState(key: string, state: Uint8Array) {
  const user = await currentUser();
  if (!user) return;
  const { error } = await supabase.storage
    .from("saves")
    .upload(statePath(user.id, key), new Blob([state as BlobPart]), { upsert: true, contentType: "application/octet-stream" });
  if (error) throw error;
}

export async function downloadState(key: string): Promise<Blob | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase.storage.from("saves").download(statePath(user.id, key));
  if (error) return null; // noch kein Spielstand vorhanden
  return data;
}

export async function listAchievements(): Promise<{ code: string; unlocked_at: string }[]> {
  const { data, error } = await supabase.from("achievements").select("code, unlocked_at");
  if (error) throw error;
  return data ?? [];
}

export async function unlock(code: string) {
  const user = await currentUser();
  if (!user) return;
  await supabase.from("achievements").upsert({ user_id: user.id, code }, { onConflict: "user_id,code", ignoreDuplicates: true });
}
