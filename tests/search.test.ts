import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEARCH_MAX_QUERY_LENGTH,
  normalizeSearchText,
  postHref,
  readSearchQuery,
  searchPosts,
  searchablePosts,
  tokenizeSearchQuery,
} from "../src/lib/search.ts";

/** Entry minimale con i soli campi letti da `src/lib/search.ts` e dai gate editoriali. */
function post(id: string, data: Record<string, unknown> = {}, body = ""): any {
  return {
    id,
    body,
    data: {
      title: id,
      description: "",
      tags: [],
      category: "cannabis-news-it",
      slug: id,
      publishDate: new Date("2026-01-01T08:00:00Z"),
      status: "ready",
      ...data,
    },
  };
}

const NOW = new Date("2026-10-19T12:00:00Z");

const collection = [
  post("decreto-sicurezza-canapa", {
    title: "Decreto sicurezza e canapa light: cosa cambia",
    description: "Le novità del decreto sicurezza per la filiera.",
    tags: ["normativa"],
    publishDate: new Date("2026-05-10T08:00:00Z"),
  }),
  post("perche-il-cbd-non-sballa", {
    title: "Perché il CBD non è psicoattivo",
    description: "Effetti del cannabidiolo spiegati semplice.",
    category: "cbd-alimentazione",
    publishDate: new Date("2026-03-01T08:00:00Z"),
  }),
  post(
    "bioplastiche-canapa",
    { title: "Materiali sostenibili e ambiente", publishDate: new Date("2026-02-01T08:00:00Z") },
    'import Box from "../Box.astro";\n\nLe <strong>bioplastiche</strong> di [canapa](https://example.com/marketing) sono compostabili.',
  ),
  post("efsa-cbd-novel-food", {
    title: "EFSA CBD: what changes for novel food",
    description: "The September opinions explained.",
    category: "cbd-and-nutrition",
    publishDate: new Date("2026-10-07T08:00:00Z"),
  }),
  post("hemp-terpenes", {
    title: "Hemp terpenes: what they are",
    category: "hemp-sustainability",
    publishDate: new Date("2026-09-01T08:00:00Z"),
  }),
  post("legacy-en-quarantined", {
    title: "Old hemp article under review",
    language: "en",
    category: "",
    editorialStatus: "legacy-review",
  }),
  post("bozza-cbd", { title: "Bozza CBD", draft: true }),
  post("cbd-futuro", { title: "CBD dal futuro", publishDate: new Date("2027-01-01T08:00:00Z") }),
  post("cbd-non-pronto", { title: "CBD non pronto", status: "draft" }),
];

const itPosts = searchablePosts(collection, "it", NOW);
const enPosts = searchablePosts(collection, "en", NOW);
const ids = (entries: Array<{ id: string }>) => entries.map((entry) => entry.id);
const search = (posts: any[], query: string) => ids(searchPosts(posts, tokenizeSearchQuery(query)));

describe("normalizeSearchText", () => {
  it("rimuove accenti, maiuscole e punteggiatura (apostrofi tipografici inclusi)", () => {
    assert.equal(normalizeSearchText("Perché l’EFSA?"), "perche l efsa");
    assert.equal(normalizeSearchText("  CANNABIDIOLO—È  legale!! "), "cannabidiolo e legale");
    // Accenti interni alla parola: senza rimozione dei segni combinanti diventerebbe "cre me".
    assert.equal(normalizeSearchText("Crème brûlée"), "creme brulee");
  });

  it("ritorna stringa vuota per input non testuali", () => {
    assert.equal(normalizeSearchText(undefined), "");
    assert.equal(normalizeSearchText(null), "");
    assert.equal(normalizeSearchText(42), "");
  });
});

describe("readSearchQuery", () => {
  const read = (search: string) => readSearchQuery(new URL(`https://canapalandia.com/cerca/${search}`));

  it("legge q, compatta gli spazi e accetta s come fallback WordPress", () => {
    assert.equal(read("?q=%20decreto%20%20%20sicurezza%20"), "decreto sicurezza");
    assert.equal(read("?s=cbd"), "cbd");
    assert.equal(read("?q=terpeni&s=cbd"), "terpeni");
  });

  it("gestisce query assente o vuota", () => {
    assert.equal(read(""), "");
    assert.equal(read("?q="), "");
    assert.equal(read("?q=%20%20"), "");
  });

  it("tronca le query troppo lunghe", () => {
    const query = read(`?q=${"a".repeat(500)}`);
    assert.equal(query.length, SEARCH_MAX_QUERY_LENGTH);
  });

  it("decodifica i caratteri speciali senza alterarli (l'escape HTML lo fa Astro)", () => {
    assert.equal(read("?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E"), "<script>alert(1)</script>");
    assert.equal(read("?q=perch%C3%A9"), "perché");
  });
});

describe("tokenizeSearchQuery", () => {
  it("scarta parole di una lettera e duplicati", () => {
    assert.deepEqual(tokenizeSearchQuery("CBD e cbd a canapa"), ["cbd", "canapa"]);
  });

  it("ritorna nessun token per query vuote, troppo corte o di sola punteggiatura", () => {
    assert.deepEqual(tokenizeSearchQuery(""), []);
    assert.deepEqual(tokenizeSearchQuery("a"), []);
    assert.deepEqual(tokenizeSearchQuery("!!! ??? <>"), []);
  });

  it("limita il numero di token", () => {
    assert.equal(tokenizeSearchQuery("uno due tre quattro cinque sei sette otto nove dieci").length, 8);
  });

  it("riduce un payload HTML a parole innocue", () => {
    assert.deepEqual(tokenizeSearchQuery('"><svg onload=alert(1)>'), ["svg", "onload", "alert"]);
  });
});

describe("searchablePosts (gate editoriale e lingua)", () => {
  it("IT: solo articoli italiani pubblicati, dal più recente", () => {
    assert.deepEqual(ids(itPosts), ["decreto-sicurezza-canapa", "perche-il-cbd-non-sballa", "bioplastiche-canapa"]);
  });

  it("EN: solo articoli inglesi pubblicati, esclusa la quarantena legacy-review", () => {
    assert.deepEqual(ids(enPosts), ["efsa-cbd-novel-food", "hemp-terpenes"]);
  });

  it("esclude bozze, contenuti futuri e non pronti", () => {
    const all = [...ids(itPosts), ...ids(enPosts)];
    for (const hidden of ["bozza-cbd", "cbd-futuro", "cbd-non-pronto", "legacy-en-quarantined"]) {
      assert.ok(!all.includes(hidden), hidden);
    }
  });
});

describe("searchPosts", () => {
  it("trova per titolo, descrizione e categoria (query positive IT)", () => {
    assert.deepEqual(search(itPosts, "decreto sicurezza"), ["decreto-sicurezza-canapa"]);
    assert.deepEqual(search(itPosts, "cannabidiolo"), ["perche-il-cbd-non-sballa"]);
  });

  it("ignora accenti e maiuscole in entrambe le direzioni", () => {
    assert.deepEqual(search(itPosts, "perche"), ["perche-il-cbd-non-sballa"]);
    assert.deepEqual(search(itPosts, "PERCHÉ"), ["perche-il-cbd-non-sballa"]);
  });

  it("cerca nel corpo ripulito da MDX/HTML e accetta prefissi", () => {
    assert.deepEqual(search(itPosts, "bioplast"), ["bioplastiche-canapa"]);
  });

  it("non indicizza import MDX, tag HTML e URL (query negative)", () => {
    assert.deepEqual(search(itPosts, "strong"), []);
    assert.deepEqual(search(itPosts, "marketing"), []);
    assert.deepEqual(search(itPosts, "astro"), []);
  });

  it("non trova sottostringhe a metà parola", () => {
    assert.deepEqual(search(itPosts, "plastiche"), []);
  });

  it("richiede tutte le parole della query", () => {
    assert.deepEqual(search(itPosts, "decreto bioplastiche"), []);
  });

  it("ordina per pertinenza: titolo prima del solo corpo", () => {
    assert.deepEqual(search(itPosts, "canapa"), ["decreto-sicurezza-canapa", "bioplastiche-canapa"]);
  });

  it("zero risultati e nessun token restituiscono un elenco vuoto", () => {
    assert.deepEqual(search(itPosts, "zzzqqq"), []);
    assert.deepEqual(search(itPosts, "a"), []);
  });

  it("separa i locali: una query inglese non pesca articoli italiani e viceversa", () => {
    assert.deepEqual(search(enPosts, "efsa"), ["efsa-cbd-novel-food"]);
    assert.deepEqual(search(itPosts, "efsa"), []);
    assert.deepEqual(search(enPosts, "decreto"), []);
    assert.deepEqual(search(enPosts, "hemp"), ["hemp-terpenes"]);
  });
});

describe("postHref", () => {
  it("usa lo slug pubblico canonico /blog/<slug>/ per entrambi i locali", () => {
    assert.equal(postHref(itPosts[0]), "/blog/decreto-sicurezza-canapa/");
    assert.equal(postHref(enPosts[0]), "/blog/efsa-cbd-novel-food/");
    assert.equal(postHref(post("id-interno", { slug: " slug-pubblico " })), "/blog/slug-pubblico/");
  });
});
