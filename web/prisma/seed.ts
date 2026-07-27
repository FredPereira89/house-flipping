import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** "São Domingos de Rana" -> "sao-domingos-de-rana" */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Strip combining diacritical marks. Uses a Unicode property escape
    // rather than a literal character range, which does not survive
    // copy-paste between editors reliably.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * config.json keys are freguesia names, sometimes with the municipality
 * embedded ("Cascais e Estoril") and sometimes bare ("Benfica"). We store
 * the raw key as the primary alias so existing CSV rows match on import.
 */
function aliasesFor(name: string): string[] {
  const set = new Set<string>([name, slugify(name)]);
  // Split compound freguesia names: "Algés, Linda-a-Velha e Cruz Quebrada"
  for (const part of name.split(/,| e /)) {
    const trimmed = part.trim();
    if (trimmed.length > 2) {
      set.add(trimmed);
      set.add(slugify(trimmed));
    }
  }
  return [...set];
}

const RENTED_KEYWORDS = [
  "arrendado", "arrendada", "com inquilino", "com arrendatario",
  "ocupado com", "contrato de arrendamento", "rendimento garantido",
  "investimento arrendado", "yield garantido", "retorno garantido",
  "com rendimento", "em regime de arrendamento", "inquilino atual",
];

const NO_LICENCE_KEYWORDS = [
  "sem licenca de habitacao", "sem licenca habitacao",
  "sem alvara", "nao tem licenca", "nao possui licenca",
  "licenca em processo", "licenca a regularizar",
  "a aguardar licenca", "processo de licenciamento",
  "licenca de utilizacao pendente", "licenca de utilizacao em falta",
  "edificio nao licenciado",
];

async function main() {
  const org = await prisma.org.upsert({
    where: { id: "default-org" },
    update: {},
    create: { id: "default-org", name: "Default" },
  });

  const email = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "changeme";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      orgId: org.id,
      email,
      name: "Admin",
      role: "admin",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await prisma.settings.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });

  const config = JSON.parse(
    readFileSync(join(__dirname, "../../config.json"), "utf-8"),
  );
  const areaNames: string[] = Object.keys(config.locations_avg_price_m2)
    .filter((n) => n !== "AML (Geral)");

  for (const name of areaNames) {
    const slug = slugify(name);
    await prisma.area.upsert({
      where: { slug },
      update: { aliases: aliasesFor(name) },
      create: {
        name,
        slug,
        municipality: name,
        aliases: aliasesFor(name),
      },
    });
  }

  for (const [category, keywords] of [
    ["rented", RENTED_KEYWORDS],
    ["no_licence", NO_LICENCE_KEYWORDS],
  ] as const) {
    for (const keyword of keywords) {
      await prisma.disqualifyKeyword.upsert({
        where: { orgId_keyword: { orgId: org.id, keyword } },
        update: { category },
        create: { orgId: org.id, category, keyword },
      });
    }
  }

  console.log(
    `Seeded org=${org.id} areas=${areaNames.length} ` +
    `keywords=${RENTED_KEYWORDS.length + NO_LICENCE_KEYWORDS.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
