type IndexScope = {
  _id: string;
  name: string;
};

type IndexFact = {
  _id: string;
  content: string;
  scopeId: string;
  entityIds: string[];
  timestamp: number;
  importanceScore?: number;
  lifecycleState?: string;
};

type IndexEntity = {
  entityId: string;
  name: string;
  type: string;
};

type GenerateHierarchicalVaultIndexInput = {
  scopes: IndexScope[];
  factsByScope: Record<string, IndexFact[]>;
  entities: IndexEntity[];
  maxFactsPerEntity?: number;
  maxFactChars?: number;
};

const TYPE_ORDER = ["person", "project", "tool", "concept", "company"];

const TYPE_LABELS: Record<string, string> = {
  person: "People",
  project: "Projects",
  tool: "Tools",
  concept: "Concepts",
  company: "Companies",
};

function truncate(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function typeSortKey(type: string): [number, string] {
  const index = TYPE_ORDER.indexOf(type);
  return [index === -1 ? Number.MAX_SAFE_INTEGER : index, type];
}

function compareEntityType(a: string, b: string): number {
  const [ai, at] = typeSortKey(a);
  const [bi, bt] = typeSortKey(b);
  return ai === bi ? at.localeCompare(bt) : ai - bi;
}

export function generateHierarchicalVaultIndex(input: GenerateHierarchicalVaultIndexInput): string {
  const maxFactsPerEntity = input.maxFactsPerEntity ?? 5;
  const maxFactChars = input.maxFactChars ?? 80;

  const entityById = new Map(input.entities.map((entity) => [entity.entityId, entity]));
  const lines: string[] = ["# Vault Index", ""];

  const scopes = [...input.scopes].sort((a, b) => a.name.localeCompare(b.name));

  for (const scope of scopes) {
    lines.push(`## Scope: ${scope.name}`);

    const scopeFacts = (input.factsByScope[scope._id] ?? []).filter(
      (fact) => (fact.lifecycleState ?? "active") === "active"
    );
    if (scopeFacts.length === 0) {
      lines.push("- (no indexed facts)", "");
      continue;
    }

    const factsByEntityId = new Map<string, IndexFact[]>();
    for (const fact of scopeFacts) {
      const uniqueEntityIds = new Set(fact.entityIds ?? []);
      for (const entityId of uniqueEntityIds) {
        const bucket = factsByEntityId.get(entityId) ?? [];
        bucket.push(fact);
        factsByEntityId.set(entityId, bucket);
      }
    }

    const entityIds = [...factsByEntityId.keys()];
    if (entityIds.length === 0) {
      lines.push("- (no indexed entities)", "");
      continue;
    }

    const entityTypes = new Map<string, string[]>();
    for (const entityId of entityIds) {
      const type = entityById.get(entityId)?.type ?? "concept";
      const bucket = entityTypes.get(type) ?? [];
      bucket.push(entityId);
      entityTypes.set(type, bucket);
    }

    const sortedTypes = [...entityTypes.keys()].sort(compareEntityType);
    for (const type of sortedTypes) {
      lines.push(`### ${TYPE_LABELS[type] ?? `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}s`}`);
      const ids = [...(entityTypes.get(type) ?? [])];
      ids.sort((leftId, rightId) => {
        const leftName = entityById.get(leftId)?.name ?? leftId;
        const rightName = entityById.get(rightId)?.name ?? rightId;
        return leftName.localeCompare(rightName);
      });

      for (const entityId of ids) {
        const entityName = entityById.get(entityId)?.name ?? entityId;
        lines.push(`- ${entityName}`);
        const facts = [...(factsByEntityId.get(entityId) ?? [])]
          .sort((a, b) => {
            const byImportance = (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
            if (byImportance !== 0) return byImportance;
            return b.timestamp - a.timestamp;
          })
          .slice(0, maxFactsPerEntity);

        for (const fact of facts) {
          lines.push(`  - ${truncate(fact.content, maxFactChars)}`);
        }
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export const VAULT_INDEX_CACHE_KEY = "vault_index";

/** system_config key used as a dirty flag for incremental index rebuilds. */
export const VAULT_INDEX_DIRTY_KEY = "vault_index_dirty_since";
