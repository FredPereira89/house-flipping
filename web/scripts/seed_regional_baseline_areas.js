// Populates areas.district/freguesia/idealistaUrl for a bounded set of
// districts, so ingest/enqueue_baselines.py has real Idealista URLs to
// enqueue baseline-capture jobs against.
//
// Source data: evaristopae/dataset-divisoes-admin-portugal (LAU1
// municipality + LAU2 freguesia tables), the same dataset an earlier,
// unscoped run of this idea used to seed ALL of Portugal's 3,181
// freguesias -- see HANDOFF.md §4c for why that was reverted. This
// version is scoped to named districts only (via --districts) and,
// critically, MERGES into existing areas rows instead of blindly
// inserting new ones: the 92 existing AML areas already have leads
// pointing at their `id` via sourcing_leads.area_id, and area_price_
// baselines joins on that same id. Creating a *second* row for a
// freguesia that already has an AML row (e.g. "Cascais e Estoril") would
// mean baseline prices land on a row no lead is actually attached to,
// silently breaking the hot-lead discount calculation for exactly the
// areas real leads live in.
//
// Usage:
//   node scripts/seed_regional_baseline_areas.js --districts=Lisboa,Setubal,Santarem,Portalegre           (dry run, default)
//   node scripts/seed_regional_baseline_areas.js --districts=Lisboa,Setubal,Santarem,Portalegre --apply   (writes)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_URL =
  "https://raw.githubusercontent.com/evaristopae/dataset-divisoes-admin-portugal/master/DATASET_PORTUGAL/S02_DADOS.sql";

// The 18 real municípios of the Área Metropolitana de Lisboa -- i.e.
// exactly the concelhos the existing 92 `areas` rows (seeded from
// config.json) were meant to cover. A DICOFRE freguesia is only ever
// considered a MERGE candidate against an existing row if its concelho is
// in this set. This is what stops same-name collisions elsewhere in
// Portugal (e.g. Rio Maior's own "São Sebastião", or Santiago do Cacém's
// own "Alvalade") from being silently matched against the AML row of the
// same name and overwriting it with the wrong idealista_url.
const AML_MUNICIPALITIES = new Set(
  [
    "Alcochete", "Almada", "Amadora", "Barreiro", "Cascais", "Lisboa",
    "Loures", "Mafra", "Moita", "Montijo", "Odivelas", "Oeiras", "Palmela",
    "Seixal", "Sesimbra", "Setúbal", "Sintra", "Vila Franca de Xira",
  ].map((m) => slugify(m)),
);

// Hand-verified corrections for real freguesias whose DICOFRE name
// doesn't line up with config.json's spelling closely enough for
// slugify() to match, checked one at a time against a manual review pass
// rather than trusting a fuzzier automatic match:
//   - "Algirão-Mem Martins" in config.json is a typo for the real Sintra
//     freguesia "Algueirão-Mem Martins".
const KNOWN_ALIAS_CORRECTIONS = new Map([
  ["algueirao-mem-martins", "algirao-mem-martins"],
]);

// DICOFRE names union freguesias as "União das freguesias de/do/da X" and
// sometimes wraps a single-parish name in the municipality's own name,
// e.g. "Setúbal (São Sebastião)" -- config.json (and this project's
// existing area names) use neither convention. Both are stripped/unwrapped
// before comparing, so "União das freguesias de Cascais e Estoril" can
// match the existing "Cascais e Estoril" area, and "Setúbal (São
// Sebastião)" can match the existing "São Sebastião" area.
function normalizeFreguesiaName(name, municipio) {
  let n = name.replace(/^União das freguesias d[aeo]s? /i, "");
  const wrapped = n.match(new RegExp(`^${escapeRegex(municipio)}\\s*\\((.+)\\)$`, "i"));
  if (wrapped) return [n, wrapped[1]];
  return [n];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Idealista's own hyphenated convention drops DICOFRE's bureaucratic
// prefix ("União das freguesias de X") AND its municipality-wrap
// ("Abrantes (São Vicente e São João) e Alferrarede") entirely -- real
// ad text for that exact freguesia is just "São Vicente - São João -
// Alferrarede", no "Abrantes", no parens. normalizeFreguesiaName()'s own
// wrap handling only covers a wrap around the ENTIRE remaining string
// (`^municipio (...)$`); this one can sit mid-string with trailing
// content after the closing paren, so it needs its own unwrap (in place,
// not stripped as a whole-string match) before hyphenating.
// Idealista is inconsistent about how it renders a compound freguesia
// name even between its OWN pages: the price-report tool's own freguesia
// list favours the hyphenated form, but real search-card address text
// often keeps the literal word "e" ("São Miguel do Rio Torto e Rossio ao
// Sul do Tejo", not "... - Rossio ..."), with no bureaucratic prefix and
// no municipality-wrap either. Neither the bureaucratic-full alias nor
// the hyphenated one matches that -- this bare form (prefix/wrap
// stripped, connector words left alone) is the third variant needed.
function toBareAlias(freguesiaName, municipio) {
  let n = freguesiaName.replace(/^União das freguesias d[aeo]s? /i, "");
  const wrapRe = new RegExp(`\\b${escapeRegex(municipio)}\\s*\\(([^)]+)\\)`, "gi");
  return n.replace(wrapRe, "$1");
}

function toHyphenatedAlias(freguesiaName, municipio) {
  let n = freguesiaName.replace(/^União das freguesias d[aeo]s? /i, "");
  // `g` flag: some DICOFRE names wrap the municipality around MULTIPLE
  // separate fragments, not just one -- e.g. Santarém's 4-parish union is
  // "Santarém (Marvila), Santa Iria da Ribeira de Santarém, Santarém (São
  // Salvador) e Santarém (São Nicolau)", three separate wraps. A
  // non-global replace only unwrapped the first, leaving the other two
  // still wrapped (and thus still not matching real ad text).
  const wrapRe = new RegExp(`\\b${escapeRegex(municipio)}\\s*\\(([^)]+)\\)`, "gi");
  n = n.replace(wrapRe, "$1");
  return n.replace(/,\s*/g, " - ").replace(/\s+e\s+/g, " - ");
}

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Districts are matched with the same diacritic-insensitive comparison as
// everything else here, so "Santarem" on the command line matches the
// dataset's "Santarém".
function parseArgs(argv) {
  const districtsArg = argv.find((a) => a.startsWith("--districts="));
  if (!districtsArg) {
    throw new Error("Usage: --districts=Lisboa,Setubal,Santarem,Portalegre [--apply]");
  }
  const districts = new Set(
    districtsArg
      .slice("--districts=".length)
      .split(",")
      .map((d) => slugify(d.trim())),
  );
  const apply = argv.includes("--apply");
  return { districts, apply };
}

async function fetchDataset() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch dataset: ${res.status}`);
  return res.text();
}

function parseFreguesias(sql, targetDistrictSlugs) {
  const lau1Regex =
    /insert into PT_LAU1 \(COD_LAU1, MUNICIPIO, ID_MUN, DISTRITO_ILHA, DISTRITO_RAUT, COD_NUTS3\)\s*values \('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',/gi;
  const lau2Regex =
    /insert into PT_LAU2 \(COD_LAU2, FREGUESIA, COD_LAU1\)\s*values \('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/gi;

  const lau1Map = new Map();
  let match;
  while ((match = lau1Regex.exec(sql)) !== null) {
    const [, codLau1, municipio, , distritoIlha] = match;
    lau1Map.set(codLau1, { municipio, distrito: distritoIlha });
  }

  const freguesias = [];
  while ((match = lau2Regex.exec(sql)) !== null) {
    const [, , freguesia, codLau1] = match;
    const lau1 = lau1Map.get(codLau1);
    if (lau1 && targetDistrictSlugs.has(slugify(lau1.distrito))) {
      freguesias.push({ freguesia, municipio: lau1.municipio, distrito: lau1.distrito });
    }
  }
  return freguesias;
}

async function main() {
  const { districts, apply } = parseArgs(process.argv.slice(2));

  console.log(`Fetching dataset from ${SOURCE_URL}...`);
  const sql = await fetchDataset();
  const freguesias = parseFreguesias(sql, districts);
  console.log(`Found ${freguesias.length} freguesias in target districts.`);

  const existingAreas = await prisma.area.findMany({
    select: { id: true, slug: true, name: true, aliases: true, idealistaUrl: true },
  });

  // WHOLE-name matches only (never the split fragments in `aliases`, e.g.
  // "Estoril" alone) -- matching on a fragment of a compound union name is
  // exactly how this script first shipped with real bugs (see
  // HANDOFF.md §4c): a Sintra-area alias fragment "São Martinho" matched
  // an unrelated São Martinho freguesia in Alcácer do Sal. The full name
  // is the only signal trustworthy enough to silently rewrite an existing
  // row's idealista_url.
  const wholeNameToArea = new Map();
  for (const area of existingAreas) {
    wholeNameToArea.set(slugify(area.name), area);
  }

  const toUpdate = [];
  const toCreate = [];
  const newInAmlConcelho = [];
  const needsReview = [];
  const seenSlugs = new Set();
  const updatedAreaIds = new Set();

  for (const f of freguesias) {
    const distSlug = slugify(f.distrito);
    const muniSlug = slugify(f.municipio);
    const isAmlConcelho = AML_MUNICIPALITIES.has(muniSlug);

    // The normalized candidates strip DICOFRE's bureaucratic "União das
    // freguesias de X"/municipality-wrap conventions down to the plainer
    // form the real captured fixture's Idealista URLs use (e.g.
    // "avenidas-novas", not "uniao-das-freguesias-de-avenidas-novas") --
    // best-guess for freguesias this project has no real capture of yet.
    // A wrong guess here 404s and gets marked 'failed' after one retry
    // (routes_baselines.py), it does not write bad data, so an imperfect
    // guess is safe, just possibly wasted.
    const candidates = normalizeFreguesiaName(f.freguesia, f.municipio);
    // Prefer the innermost/most-unwrapped candidate for the URL itself:
    // the one real captured page this project has (Lisboa's freguesias,
    // which never went through the union/wrap conventions at all) uses
    // the plainest possible form, so that's the best available proxy for
    // what Idealista's own slug looks like when a wrap is present.
    const bestGuessName = candidates[candidates.length - 1];
    const fregSlug = slugify(bestGuessName);
    // Idealista's district-level slug carries a "-provincias" suffix
    // (e.g. "lisboa-provincias", not "lisboa") -- concelho/freguesia
    // slugs are unaffected. Confirmed live 2026-08-13; not reflected in
    // any fixture captured before that date.
    const idealistaUrl = `venda/${distSlug}-provincias/${muniSlug}/${fregSlug}/`;

    let matched = null;
    if (isAmlConcelho) {
      for (const candidate of candidates) {
        matched = wholeNameToArea.get(slugify(candidate)) ?? wholeNameToArea.get(KNOWN_ALIAS_CORRECTIONS.get(slugify(candidate)));
        if (matched) break;
      }
    }

    if (matched) {
      if (updatedAreaIds.has(matched.id)) {
        // A second DICOFRE freguesia matched an area we already matched
        // this run -- a real ambiguity, not something to silently resolve
        // by letting the later one win (that exact bug is what put a Rio
        // Maior freguesia's data on a Setúbal-area row the first time
        // this ran). Flag both for a human instead of guessing.
        needsReview.push({ freguesia: f.freguesia, municipio: f.municipio, distrito: f.distrito, reason: `ambiguous: area '${matched.name}' already matched by another freguesia this run` });
        continue;
      }
      updatedAreaIds.add(matched.id);

      // Alias enrichment: matching this DICOFRE freguesia against the area
      // only proves the *name* lines up -- it says nothing about whether
      // real ad text will ever match this area at runtime. match_area()
      // only ever sees `aliases`, which historically only ever held
      // config.json's own spelling/format. Two real, live examples of this
      // failing: config.json's "Algirão-Mem Martins" (a typo -- the real
      // freguesia is "Algueirão-Mem Martins", and ads spell it correctly,
      // so they never matched) and "União das freguesias de Alhandra, São
      // João dos Montes e Calhandriz" (config.json's bureaucratic form --
      // real ad cards say "Alhandra - São João dos Montes - Calhandriz",
      // Idealista's own hyphenated convention). Add DICOFRE's own name
      // (correctly spelled) and a hyphenated variant approximating
      // Idealista's convention, alongside whatever's already there --
      // never remove an existing alias, only add matching surface.
      const hyphenated = toHyphenatedAlias(f.freguesia, f.municipio);
      const bare = toBareAlias(f.freguesia, f.municipio);
      const newAliases = [...new Set([...matched.aliases, f.freguesia, hyphenated, bare])];

      if (matched.idealistaUrl) {
        // URL already populated by an earlier run -- still worth backfilling
        // aliases if they're missing, but don't touch idealistaUrl/district
        // fields again.
        if (newAliases.length > matched.aliases.length) {
          toUpdate.push({ id: matched.id, name: matched.name, aliasesOnly: newAliases });
        }
        continue;
      }
      toUpdate.push({
        id: matched.id,
        name: matched.name,
        freguesia: f.freguesia,
        municipality: f.municipio,
        district: f.distrito,
        idealistaUrl,
        aliases: newAliases,
      });
      continue;
    }

    const newSlug = `${distSlug}-${muniSlug}-${fregSlug}`;
    if (seenSlugs.has(newSlug)) continue; // duplicate freguesia name within the dataset itself
    seenSlugs.add(newSlug);

    // Same hyphenated-variant convention as the merge path above -- these
    // areas get the same real-ad-text matching gap otherwise (only ever
    // carrying DICOFRE's bureaucratic name as their sole alias).
    const newRowHyphenated = toHyphenatedAlias(f.freguesia, f.municipio);
    const newRowBare = toBareAlias(f.freguesia, f.municipio);
    const newRow = {
      slug: newSlug,
      name: `${f.freguesia}, ${f.municipio}, ${f.distrito}`,
      freguesia: f.freguesia,
      municipality: f.municipio,
      district: f.distrito,
      idealistaUrl,
      aliases: [...new Set([f.freguesia, newRowHyphenated, newRowBare])],
    };

    if (isAmlConcelho) {
      // An AML concelho's freguesia that matched no existing area --
      // config.json only ever tracked one price point for the whole
      // concelho for several of these (Alcochete, Moita, Montijo,
      // Palmela: a single bare entry each), so this is expected finer-
      // grained data alongside the coarser existing row, not a name
      // mismatch to chase down. Created, not blocked, but logged
      // separately so it's easy to spot-check.
      newInAmlConcelho.push(newRow);
    } else {
      toCreate.push(newRow);
    }
  }

  console.log(`\nWill UPDATE ${toUpdate.length} existing areas (merge idealista_url/aliases in, keep id/slug):`);
  for (const u of toUpdate) {
    console.log(
      u.aliasesOnly
        ? `  - ${u.name}  ->  alias backfill only, now: ${JSON.stringify(u.aliasesOnly)}`
        : `  - ${u.name}  ->  idealista_url=${u.idealistaUrl}  aliases=${JSON.stringify(u.aliases)}`,
    );
  }

  console.log(`\nWill CREATE ${newInAmlConcelho.length} new areas inside AML concelhos (finer-grained than the existing row):`);
  for (const c of newInAmlConcelho) {
    console.log(`  - ${c.name}  ->  slug=${c.slug}`);
  }

  console.log(`\nWill CREATE ${toCreate.length} new areas outside AML concelhos:`);
  for (const c of toCreate.slice(0, 15)) {
    console.log(`  - ${c.name}  ->  slug=${c.slug}`);
  }
  if (toCreate.length > 15) console.log(`  ... and ${toCreate.length - 15} more`);

  if (needsReview.length > 0) {
    console.log(`\n${needsReview.length} freguesias need MANUAL review (not written, not created):`);
    for (const r of needsReview) {
      console.log(`  - ${r.freguesia} (${r.municipio}, ${r.distrito}): ${r.reason}`);
    }
  }

  if (!apply) {
    console.log("\nDry run only -- pass --apply to write these changes.");
    return;
  }

  for (const u of toUpdate) {
    if (u.aliasesOnly) {
      await prisma.area.update({ where: { id: u.id }, data: { aliases: u.aliasesOnly } });
      continue;
    }
    await prisma.area.update({
      where: { id: u.id },
      data: {
        freguesia: u.freguesia,
        municipality: u.municipality,
        district: u.district,
        idealistaUrl: u.idealistaUrl,
        aliases: u.aliases,
      },
    });
  }

  for (const c of [...newInAmlConcelho, ...toCreate]) {
    // A rerun always re-derives this row via toCreate/newInAmlConcelho
    // (never toUpdate -- see the alias-enrichment comment above for why
    // these rows can never be recognized as an existing-area match), so
    // the update path must also merge in any new alias candidates rather
    // than leaving whatever was stored on first creation untouched.
    const existing = await prisma.area.findUnique({ where: { slug: c.slug }, select: { aliases: true } });
    const mergedAliases = existing ? [...new Set([...existing.aliases, ...c.aliases])] : c.aliases;
    await prisma.area.upsert({
      where: { slug: c.slug },
      update: {
        freguesia: c.freguesia,
        municipality: c.municipality,
        district: c.district,
        idealistaUrl: c.idealistaUrl,
        aliases: mergedAliases,
      },
      create: c,
    });
  }

  const totalCreated = newInAmlConcelho.length + toCreate.length;
  console.log(`\nApplied: ${toUpdate.length} updated, ${totalCreated} created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
