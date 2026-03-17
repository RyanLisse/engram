#![recursion_limit = "8192"]
use std::sync::Arc;
use async_trait::async_trait;
use engram_types::{Fact, Entity, Session, MemoryScope, Episode};
use anyhow::Result;
use log::info;

#[async_trait]
pub trait MemoryBackend: Send + Sync {
    // ── Facts ─────────────────────────────────────────
    async fn store_fact(&self, fact: Fact) -> Result<String>;
    async fn get_fact(&self, id: &str) -> Result<Option<Fact>>;
    async fn update_fact(&self, id: &str, updates: serde_json::Value) -> Result<()>;
    async fn search_facts(&self, query: FactSearchQuery) -> Result<Vec<Fact>>;

    // ── Entities ──────────────────────────────────────
    async fn store_entity(&self, entity: Entity) -> Result<String>;
    async fn get_entity(&self, id: &str) -> Result<Option<Entity>>;

    // ── Sessions & Scopes ──────────────────────────────
    async fn get_session(&self, id: &str) -> Result<Option<Session>>;
    async fn get_scope(&self, name: &str) -> Result<Option<MemoryScope>>;

    async fn store_episode(&self, episode: Episode) -> Result<String>;
    async fn get_episode(&self, id: &str) -> Result<Option<Episode>>;

    // ── Health ────────────────────────────────────────
    async fn check_health(&self) -> Result<bool>;
}

pub struct ConsolidationManager<B: MemoryBackend> {
    backend: Arc<B>,
}

impl<B: MemoryBackend> ConsolidationManager<B> {
    pub fn new(backend: Arc<B>) -> Self {
        Self { backend }
    }

    pub async fn consolidate_scope(&self, scope_id: &str, threshold: f64) -> Result<usize> {
        let query = FactSearchQuery {
            text: None,
            vector: None,
            scope_id: Some(scope_id.to_string()),
            fact_type: None,
            limit: Some(500),
        };

        let facts = self.backend.search_facts(query).await?;
        if facts.len() < 2 {
            return Ok(0);
        }

        let mut merged_count = 0;
        let mut processed = std::collections::HashSet::new();

        for i in 0..facts.len() {
            if processed.contains(&facts[i].id) {
                continue;
            }

            for j in (i + 1)..facts.len() {
                if processed.contains(&facts[j].id) {
                    continue;
                }

                let s1: std::collections::HashSet<_> = facts[i].content.split_whitespace().collect();
                let s2: std::collections::HashSet<_> = facts[j].content.split_whitespace().collect();

                let intersection = s1.intersection(&s2).count();
                let union = s1.union(&s2).count();
                let jaccard = intersection as f64 / union as f64;

                if jaccard > threshold {
                    info!("Merging candidate found: {} and {}", facts[i].id, facts[j].id);
                    // In a real implementation:
                    // 1. Create a merged fact
                    // 2. Mark old ones as merged_into
                    // self.backend.update_fact(&facts[j].id, json!({"lifecycle_state": "merged", "merged_into": facts[i].id})).await?;
                    processed.insert(facts[j].id.clone());
                    merged_count += 1;
                }
            }
        }
        
        Ok(merged_count)
    }
}

pub struct ReflectionManager<B: MemoryBackend> {
    backend: Arc<B>,
}

impl<B: MemoryBackend> ReflectionManager<B> {
    pub fn new(backend: Arc<B>) -> Self {
        Self { backend }
    }

    pub async fn sweep_scope(&self, scope_name: &str) -> Result<Option<String>> {
        let scope = self.backend.get_scope(scope_name).await?.ok_or_else(|| anyhow::anyhow!("Scope not found: {}", scope_name))?;
        
        let now = chrono::Utc::now().timestamp_millis();
        let four_hours_ago = now - 4 * 60 * 60 * 1000;

        let query = FactSearchQuery {
            text: None,
            vector: None,
            scope_id: Some(scope.name.clone()),
            fact_type: None,
            limit: Some(100),
        };

        let recent_facts = self.backend.search_facts(query).await?;
        let recent_facts: Vec<_> = recent_facts.into_iter().filter(|f| f.timestamp >= four_hours_ago).collect();

        if recent_facts.len() < 3 {
            return Ok(None);
        }

        let mut type_counts = std::collections::HashMap::new();
        let mut entity_counts = std::collections::HashMap::new();
        let mut tags = std::collections::HashSet::new();

        for fact in &recent_facts {
            *type_counts.entry(&fact.fact_type).or_insert(0) += 1;
            for entity_id in &fact.entity_ids {
                *entity_counts.entry(entity_id).or_insert(0) += 1;
            }
            for tag in &fact.tags {
                tags.insert(tag.clone());
            }
        }

        let type_breakdown = type_counts.iter()
            .map(|(t, c)| format!("{} ({})", t, c))
            .collect::<Vec<_>>()
            .join(", ");

        let mut top_entities: Vec<_> = entity_counts.into_iter().collect();
        top_entities.sort_by(|a, b| b.1.cmp(&a.1));
        let top_entities_str = top_entities.iter()
            .take(5)
            .map(|(id, count)| format!("{} mentioned {}x", id, count))
            .collect::<Vec<_>>()
            .join("; ");

        let report = engram_ai::ReflectionEngine::generate_reflection_report(
            &scope.name,
            &format!("{} facts consolidated in last 4 hours", recent_facts.len()),
            &type_breakdown,
            &top_entities_str,
            &tags.into_iter().collect::<Vec<_>>(),
        );

        let reflection_fact = Fact {
            id: format!("reflection-{}", uuid::Uuid::new_v4()),
            content: report.clone(),
            timestamp: now,
            updated_at: Some(now),
            source: "consolidation".to_string(),
            fact_type: "reflection".to_string(),
            scope_id: scope.name.clone(), // MemoryScope uses 'name' as identifier in the trait
            tags: vec!["sleep-time".to_string(), "auto-reflection".to_string()],
            entity_ids: vec![],
            relevance_score: 0.6,
            accessed_count: 0,
            importance_score: 0.6,
            lifecycle_state: "active".to_string(),
            created_by: "system:reflection".to_string(),
            factual_summary: None,
            vault_path: None,
            vault_synced_at: None,
            confidence: None,
            importance_tier: None,
            observation_tier: None,
            observation_compressed: None,
            observation_generation: None,
            observation_session_id: None,
            assertion_type: None,
            referenced_date: None,
            observation_original_content: None,
            merged_content: None,
            outcome_score: None,
            contributing_agents: None,
            conversation_id: None,
            embedding: None,
            compact_embedding: None,
            merged_into: None,
            consolidated_from: None,
            superseded_by: None,
            forget_score: None,
            token_estimate: None,
            pinned: None,
            summary: None,
            emotional_context: None,
            emotional_weight: None,
            last_contradiction_check: None,
            contradicts_with: None,
            qa_question: None,
            qa_answer: None,
            qa_entities: None,
            qa_confidence: None,
        };

        self.backend.store_fact(reflection_fact).await?;

        Ok(Some(report))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FactSearchQuery {
    pub text: Option<String>,
    pub vector: Option<Vec<f64>>,
    pub scope_id: Option<String>,
    pub fact_type: Option<String>,
    pub limit: Option<usize>,
}
