// Idealista does not publish a price-report page for every freguesia --
// for most concelhos it only breaks out the highest-volume freguesias and
// folds everything else into a single municipality-level aggregate page
// (e.g. https://www.idealista.pt/media/relatorios-preco-habitacao/venda/lisboa/alenquer/
// lists just "Alenquer" itself plus one freguesia, "Carregado e Cadafais" --
// the other ~10 Alenquer freguesias in this DB have no page of their own
// and their capture jobs 404/fail to parse).
//
// Every area used as a municipality-level baseline target has
// freguesia=NULL. Two different origins produce that:
//   1. 11 AML concelhos (Lisboa, Sintra, Cascais, ...) already have a bare
//      municipality-name area from the original config.json seed -- it
//      already carries the municipality name as its own alias (a lead
//      that just says "Lisboa" legitimately matches it directly). This
//      script only fills in its idealista_url; its aliases are untouched.
//   2. Everywhere else, no such row exists, so this script creates one
//      fresh -- with aliases=[] so match_area() (ingest/area_matcher.py)
//      never matches a real lead to it. A freguesia named identically to
//      its own municipality (not uncommon -- many concelhos have a "sede"
//      freguesia sharing the name) already owns that alias string; giving
//      a brand new row the same alias would create an unresolvable tie
//      between two areas in the very same concelho. Existing-row aliases
//      are left alone because they already worked before this script and
//      any such tie would have already been an issue, not one this script
//      introduces.
// Either way, ingest/repositories/areas.py's get_baseline() consults the
// municipality's freguesia=NULL row as a fallback when a specific
// freguesia area has no price data of its own.
//
// Usage:
//   node scripts/seed_municipality_baseline_areas.js           (dry run, default)
//   node scripts/seed_municipality_baseline_areas.js --apply   (writes)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

// A freguesia-level idealista_url looks like "venda/{district}/{municipality}/{freguesia}/".
// The municipality-level report page is just that path with the last
// segment dropped.
function municipalityUrl(freguesiaUrl) {
  const parts = freguesiaUrl.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/") + "/";
}

async function main() {
  const apply = process.argv.includes("--apply");

  const areas = await prisma.area.findMany({
    select: { id: true, municipality: true, district: true, idealistaUrl: true, freguesia: true },
  });

  const byMunicipality = new Map();
  for (const a of areas) {
    if (!a.municipality || !a.district || !a.idealistaUrl || a.freguesia === null) continue;
    if (!byMunicipality.has(a.municipality)) {
      byMunicipality.set(a.municipality, { district: a.district, sampleUrl: a.idealistaUrl });
    }
  }

  const existingBareRows = areas.filter((a) => a.freguesia === null && a.municipality);
  const bareRowByMunicipality = new Map(existingBareRows.map((r) => [r.municipality, r]));

  const toUpdate = [];
  const toCreate = [];
  for (const [municipality, { district, sampleUrl }] of byMunicipality) {
    const url = municipalityUrl(sampleUrl);
    const existing = bareRowByMunicipality.get(municipality);
    if (existing) {
      if (existing.idealistaUrl) continue; // already populated
      toUpdate.push({ id: existing.id, municipality, idealistaUrl: url });
      continue;
    }
    const distSlug = slugify(district);
    const muniSlug = slugify(municipality);
    toCreate.push({
      slug: `${distSlug}-${muniSlug}-municipio`,
      name: `${municipality} (concelho)`,
      municipality,
      district,
      freguesia: null,
      idealistaUrl: url,
      aliases: [],
    });
  }

  console.log(`Will UPDATE ${toUpdate.length} existing bare-municipality areas (add idealista_url):`);
  for (const u of toUpdate) console.log(`  - ${u.municipality}  ->  idealista_url=${u.idealistaUrl}`);

  console.log(`\nWill CREATE ${toCreate.length} new alias-less fallback areas:`);
  for (const c of toCreate) console.log(`  - ${c.name}  ->  idealista_url=${c.idealistaUrl}`);

  if (!apply) {
    console.log("\nDry run only -- pass --apply to write these changes.");
    return;
  }

  for (const u of toUpdate) {
    await prisma.area.update({ where: { id: u.id }, data: { idealistaUrl: u.idealistaUrl } });
  }
  for (const c of toCreate) {
    await prisma.area.upsert({
      where: { slug: c.slug },
      update: { idealistaUrl: c.idealistaUrl },
      create: c,
    });
  }

  console.log(`\nApplied: ${toUpdate.length} updated, ${toCreate.length} created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
