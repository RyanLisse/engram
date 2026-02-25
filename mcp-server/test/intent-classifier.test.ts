import { describe, expect, test } from "vitest";
import { classifyIntent } from "../src/lib/intent-classifier.js";

describe("classifyIntent", () => {
  // ============================================================================
  // LOOKUP INTENT TESTS
  // ============================================================================
  describe("lookup intent", () => {
    test("classifies 'what is' queries as lookup", () => {
      expect(classifyIntent("what is the DNS configuration")).toBe("lookup");
    });

    test("classifies 'who is' queries as lookup", () => {
      expect(classifyIntent("who is the project lead")).toBe("lookup");
    });

    test("classifies 'what does' queries as lookup", () => {
      expect(classifyIntent("what does ryan prefer for package manager")).toBe("lookup");
    });

    test("classifies 'show me' queries as lookup", () => {
      expect(classifyIntent("show me the deployment script")).toBe("lookup");
    });

    test("classifies 'get' queries as lookup", () => {
      expect(classifyIntent("get the current api key")).toBe("lookup");
    });

    test("classifies 'find' queries as lookup", () => {
      expect(classifyIntent("find the database password")).toBe("lookup");
    });

    test("classifies 'lookup' keyword as lookup", () => {
      expect(classifyIntent("lookup the user email")).toBe("lookup");
    });

    test("detects lookup intent with 'preference' keyword", () => {
      expect(classifyIntent("what is the user preference")).toBe("lookup");
    });

    test("detects lookup intent with 'rule' keyword", () => {
      expect(classifyIntent("show me the rule configuration")).toBe("lookup");
    });

    test("detects lookup intent with 'email' keyword", () => {
      expect(classifyIntent("get the team email address")).toBe("lookup");
    });

    test("detects lookup intent with 'phone' keyword", () => {
      expect(classifyIntent("what is the phone number")).toBe("lookup");
    });

    test("detects lookup intent with 'address' keyword", () => {
      expect(classifyIntent("find the office address")).toBe("lookup");
    });

    test("detects lookup intent with 'username' keyword", () => {
      expect(classifyIntent("what is the admin username")).toBe("lookup");
    });

    test("detects lookup intent with 'key' keyword", () => {
      expect(classifyIntent("where is the api key")).toBe("lookup");
    });

    test("detects lookup intent with 'value' keyword", () => {
      expect(classifyIntent("what is the config value")).toBe("lookup");
    });

    test("is case-insensitive for lookup", () => {
      expect(classifyIntent("WHAT IS the answer")).toBe("lookup");
      expect(classifyIntent("Find THE database")).toBe("lookup");
      expect(classifyIntent("LOOKUP this value")).toBe("lookup");
    });

    test("handles lookup queries with extra whitespace", () => {
      expect(classifyIntent("  what is    the config  ")).toBe("lookup");
    });
  });

  // ============================================================================
  // TEMPORAL INTENT TESTS
  // ============================================================================
  describe("temporal intent", () => {
    test("detects 'when' keyword as temporal", () => {
      expect(classifyIntent("when did the deployment happen")).toBe("temporal");
    });

    test("detects 'last' keyword as temporal", () => {
      expect(classifyIntent("what happened last week")).toBe("temporal");
    });

    test("detects 'yesterday' keyword as temporal", () => {
      expect(classifyIntent("what was the status yesterday")).toBe("temporal");
    });

    test("detects 'today' keyword as temporal", () => {
      expect(classifyIntent("what tasks are due today")).toBe("temporal");
    });

    test("detects 'this week' keyword as temporal", () => {
      expect(classifyIntent("what happened this week")).toBe("temporal");
    });

    test("detects 'timeline' keyword as temporal", () => {
      expect(classifyIntent("give me the project timeline")).toBe("temporal");
    });

    test("detects 'recent' keyword as temporal", () => {
      expect(classifyIntent("show recent changes")).toBe("temporal");
    });

    test("detects 'history' keyword as temporal", () => {
      expect(classifyIntent("tell me the deployment history")).toBe("temporal");
    });

    test("detects 'ago' keyword as temporal", () => {
      expect(classifyIntent("what happened 2 hours ago")).toBe("temporal");
    });

    test("detects 'before' keyword as temporal", () => {
      expect(classifyIntent("what was the state before the update")).toBe("temporal");
    });

    test("detects 'after' keyword as temporal", () => {
      expect(classifyIntent("what happened after the release")).toBe("temporal");
    });

    test("detects 'during' keyword as temporal", () => {
      expect(classifyIntent("what occurred during the incident")).toBe("temporal");
    });

    test("is case-insensitive for temporal", () => {
      expect(classifyIntent("WHEN did this happen")).toBe("temporal");
      expect(classifyIntent("what was recent CHANGES")).toBe("temporal");
    });

    test("handles temporal queries with extra whitespace", () => {
      expect(classifyIntent("  when    did   it happen  ")).toBe("temporal");
    });
  });

  // ============================================================================
  // RELATIONAL INTENT TESTS
  // ============================================================================
  describe("relational intent", () => {
    test("detects 'related' keyword as relational", () => {
      expect(classifyIntent("how are react and typescript related")).toBe("relational");
    });

    test("detects 'connected' keyword as relational", () => {
      expect(classifyIntent("which modules are connected")).toBe("relational");
    });

    test("detects 'depends' keyword as relational", () => {
      expect(classifyIntent("which service depends on auth")).toBe("relational");
    });

    test("detects 'works with' keyword as relational", () => {
      expect(classifyIntent("what works with this component")).toBe("relational");
    });

    test("detects 'between' keyword as relational", () => {
      expect(classifyIntent("explain the relationship between frontend and backend")).toBe("relational");
    });

    test("detects 'relationship' keyword as relational", () => {
      expect(classifyIntent("explain the relationship here")).toBe("relational");
    });

    test("detects 'links' keyword as relational", () => {
      expect(classifyIntent("what links this to that")).toBe("relational");
    });

    test("detects 'associated' keyword as relational", () => {
      // Note: queries starting with lookup keywords will match lookup first
      // This tests the relational pattern when lookup isn't matched first
      expect(classifyIntent("explain what files are associated with the service")).toBe("relational");
    });

    test("detects 'part of' keyword as relational", () => {
      expect(classifyIntent("is this part of the main system")).toBe("relational");
    });

    test("is case-insensitive for relational", () => {
      expect(classifyIntent("HOW are these RELATED")).toBe("relational");
      expect(classifyIntent("WHAT works with this")).toBe("relational");
    });

    test("handles relational queries with extra whitespace", () => {
      expect(classifyIntent("  how  are   these   related  ")).toBe("relational");
    });
  });

  // ============================================================================
  // EXPLORE INTENT TESTS (DEFAULT)
  // ============================================================================
  describe("explore intent (default)", () => {
    test("defaults to explore for generic queries", () => {
      expect(classifyIntent("brainstorm architecture ideas")).toBe("explore");
    });

    test("defaults to explore for unspecific queries", () => {
      expect(classifyIntent("tell me about the system")).toBe("explore");
    });

    test("defaults to explore for analytical queries", () => {
      expect(classifyIntent("analyze the code structure")).toBe("explore");
    });

    test("defaults to explore for exploratory questions", () => {
      expect(classifyIntent("what are the options here")).toBe("explore");
    });

    test("defaults to explore for creative prompts", () => {
      expect(classifyIntent("generate ideas for improvement")).toBe("explore");
    });

    test("defaults to explore for open-ended questions", () => {
      expect(classifyIntent("how should we approach this")).toBe("explore");
    });

    test("is case-insensitive for explore default", () => {
      expect(classifyIntent("BRAINSTORM IDEAS")).toBe("explore");
      expect(classifyIntent("Tell me about THIS")).toBe("explore");
    });

    test("handles explore queries with extra whitespace", () => {
      expect(classifyIntent("  brainstorm   ideas  ")).toBe("explore");
    });
  });

  // ============================================================================
  // EDGE CASES & MIXED SCENARIOS
  // ============================================================================
  describe("edge cases", () => {
    test("handles empty string", () => {
      // Empty string should default to explore
      expect(classifyIntent("")).toBe("explore");
    });

    test("handles whitespace-only string", () => {
      expect(classifyIntent("   ")).toBe("explore");
    });

    test("handles very short queries", () => {
      expect(classifyIntent("hi")).toBe("explore");
      expect(classifyIntent("ok")).toBe("explore");
    });

    test("handles single character", () => {
      expect(classifyIntent("a")).toBe("explore");
    });

    test("handles numeric input", () => {
      expect(classifyIntent("123")).toBe("explore");
    });

    test("handles special characters", () => {
      expect(classifyIntent("!@#$%^")).toBe("explore");
    });

    test("prioritizes first matching intent (lookup before others)", () => {
      // "what is" triggers lookup first
      expect(classifyIntent("what is the timeline")).toBe("lookup");
    });

    test("prioritizes lookup over temporal", () => {
      // "find" is lookup, "yesterday" is temporal
      expect(classifyIntent("find what happened yesterday")).toBe("lookup");
    });

    test("prioritizes lookup over relational", () => {
      // "what is" is lookup, "related" is relational
      expect(classifyIntent("what is how these are related")).toBe("lookup");
    });

    test("detects temporal when lookup keywords not present", () => {
      expect(classifyIntent("what occurred yesterday")).toBe("temporal");
    });

    test("detects relational when lookup and temporal keywords not present", () => {
      expect(classifyIntent("explain how these are related")).toBe("relational");
    });

    test("handles mixed case keywords", () => {
      expect(classifyIntent("WhAt Is this")).toBe("lookup");
      expect(classifyIntent("WhEn did this")).toBe("temporal");
      expect(classifyIntent("HoW are these related")).toBe("relational");
    });

    test("handles queries with multiple intent keywords (first match wins)", () => {
      // Contains "what is" (lookup) and "when" (temporal)
      expect(classifyIntent("what is the timeline when did it happen")).toBe("lookup");
    });

    test("handles partial word matches", () => {
      // "preference" contains "prefer" but the regex looks for \bpreference\b
      expect(classifyIntent("user preference setting")).toBe("lookup");
    });

    test("handles URL-like content", () => {
      expect(classifyIntent("https://example.com")).toBe("explore");
    });

    test("handles natural language with synonyms", () => {
      // "retrieve" is not in the lookup pattern, should explore
      expect(classifyIntent("retrieve user information")).toBe("explore");

      // But "get" is in lookup
      expect(classifyIntent("get user information")).toBe("lookup");
    });
  });

  // ============================================================================
  // BASIC TESTS (Original)
  // ============================================================================
  describe("original test cases", () => {
    test("classifies lookup queries", () => {
      expect(classifyIntent("what does ryan prefer for package manager")).toBe("lookup");
    });

    test("classifies temporal queries", () => {
      expect(classifyIntent("what happened last week")).toBe("temporal");
    });

    test("classifies relational queries", () => {
      expect(classifyIntent("how are react and typescript related")).toBe("relational");
    });

    test("defaults to explore", () => {
      expect(classifyIntent("brainstorm architecture ideas")).toBe("explore");
    });
  });
});
