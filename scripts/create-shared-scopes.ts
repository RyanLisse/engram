/**
 * Create shared Engram scopes for the Cammy Ontology.
 * Run: CONVEX_URL=https://accurate-cardinal-287.convex.cloud bun scripts/create-shared-scopes.ts
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL ?? "https://accurate-cardinal-287.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

async function getScopeByName(name: string) {
  return await client.query("functions/scopes:getByName" as any, { name });
}

async function createScope(args: {
  name: string;
  description: string;
  members: string[];
  readPolicy: string;
  writePolicy: string;
}) {
  return await client.mutation("functions/scopes:create" as any, args);
}

async function addMember(scopeId: string, agentId: string) {
  return await client.mutation("functions/scopes:addMember" as any, { scopeId, agentId });
}

const SCOPES = [
  {
    name: "shared-ryan",
    description: "Shared scope for Ryan's primary agents — Cammy and Claude Code",
    members: ["cammy", "claude-code", "indy-pai-cortex"],
    readPolicy: "members",
    writePolicy: "members",
  },
  {
    name: "public-knowledge",
    description: "Public knowledge base — read by all agents, written by trusted agents",
    members: ["cammy", "claude-code", "openclaw", "indy-pai-cortex"],
    readPolicy: "public",
    writePolicy: "members",
  },
  {
    name: "project-linklion",
    description: "LinkLion project scope — LinkedIn scraping and outreach",
    members: ["cammy", "claude-code"],
    readPolicy: "members",
    writePolicy: "members",
  },
  {
    name: "project-arbfish",
    description: "ArbFish project scope — arbitrage research and tracking",
    members: ["cammy", "claude-code"],
    readPolicy: "members",
    writePolicy: "members",
  },
  {
    name: "project-wifiradar",
    description: "WiFiRadar project scope — network scanning and monitoring",
    members: ["cammy", "claude-code"],
    readPolicy: "members",
    writePolicy: "members",
  },
  {
    name: "group-discord",
    description: "Discord group scope — safe for sharing, no private personal data",
    members: ["cammy", "openclaw"],
    readPolicy: "members",
    writePolicy: "members",
  },
];

async function main() {
  console.log(`Creating ${SCOPES.length} shared scopes on ${CONVEX_URL}...\n`);

  for (const scope of SCOPES) {
    const existing = await getScopeByName(scope.name);
    if (existing) {
      console.log(`✓ ${scope.name} — already exists`);
      continue;
    }

    try {
      await createScope(scope);
      console.log(`✅ Created: ${scope.name} (members: ${scope.members.join(", ")})`);
    } catch (err: any) {
      console.error(`❌ Failed: ${scope.name} — ${err.message}`);
    }
  }

  console.log("\nDone. Verifying...\n");

  for (const scope of SCOPES) {
    const result = await getScopeByName(scope.name);
    console.log(`  ${scope.name}: ${result ? `✅ id=${result._id}` : "❌ not found"}`);
  }
}

main().catch(console.error);
