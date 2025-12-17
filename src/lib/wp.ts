import fs from "node:fs/promises";
import path from "node:path";

const SITE = "https://canapalandia.com";

export type Entry =
  | {
      kind: "post" | "page";
      path: string; // es: "/cannabis-light-corte-giustizia-ue"
      link: string; // assoluto
      title: string;
      html: string;
      excerptHtml?: string;
      yoastHead?: string;
      yoastJson?: any;
      date?: string;
      categories?: number[];
      tags?: number[];
    }
  | {
      kind: "category" | "tag";
      path: string;
      link: string;
      name: string;
      description?: string;
      termId: number;
      count?: number;
    };

const toPath = (link: string) =>
  link.replace(SITE, "").replace(/\/+$/, "").trim() || "/";

export const toParams = (p: string) => {
  const clean = p.replace(/^\/+|\/+$/g, "");
  return clean ? clean.split("/") : [];
};

async function readJson<T>(rel: string): Promise<T> {
  const file = path.join(process.cwd(), "data", "wp", "out", rel);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

export async function loadWp() {
  const posts = await readJson<any[]>("posts.json");
  const pages = await readJson<any[]>("pages.json");
  const categories = await readJson<any[]>("categories.json");
  const tags = await readJson<any[]>("tags.json");

  const all: Entry[] = [];

  for (const p of posts) {
    all.push({
      kind: "post",
      path: toPath(p.link),
      link: p.link,
      title: p?.title?.rendered ?? "",
      html: p?.content?.rendered ?? "",
      excerptHtml: p?.excerpt?.rendered ?? "",
      yoastHead: p?.yoast_head ?? "",
      yoastJson: p?.yoast_head_json ?? null,
      date: p?.date,
      categories: p?.categories ?? [],
      tags: p?.tags ?? [],
    });
  }

  for (const p of pages) {
    all.push({
      kind: "page",
      path: toPath(p.link),
      link: p.link,
      title: p?.title?.rendered ?? "",
      html: p?.content?.rendered ?? "",
      excerptHtml: p?.excerpt?.rendered ?? "",
      yoastHead: p?.yoast_head ?? "",
      yoastJson: p?.yoast_head_json ?? null,
      date: p?.date,
    });
  }

  for (const c of categories) {
    all.push({
      kind: "category",
      path: toPath(c.link),
      link: c.link,
      name: c?.name ?? "",
      description: c?.description ?? "",
      termId: c?.id,
      count: c?.count,
    });
  }

  for (const t of tags) {
    all.push({
      kind: "tag",
      path: toPath(t.link),
      link: t.link,
      name: t?.name ?? "",
      description: t?.description ?? "",
      termId: t?.id,
      count: t?.count,
    });
  }

  // Collisioni path: page > post > term (safe)
  const weight = (k: Entry["kind"]) => (k === "page" ? 3 : k === "post" ? 2 : 1);
  const map = new Map<string, Entry>();
  for (const e of all) {
    if (e.path === "/") continue;
    const prev = map.get(e.path);
    if (!prev || weight(e.kind) > weight(prev.kind)) map.set(e.path, e);
  }

  const entries = [...map.values()];
  const postsOnly = all.filter((x) => x.kind === "post") as Extract<Entry, { kind: "post" }>[];
  return { entries, posts: postsOnly };
}
