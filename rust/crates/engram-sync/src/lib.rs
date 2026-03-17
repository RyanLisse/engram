#![recursion_limit = "8192"]
use async_trait::async_trait;
use engram_core::{MemoryBackend, FactSearchQuery};
use engram_types::{Fact, Entity, Session, MemoryScope, Episode};
use anyhow::Result;
use lancedb::{connection::Connection, Table};
use std::sync::Arc;

pub struct LanceDBBackend {
    pub uri: String,
    pub conn: Arc<dyn Connection>,
}

impl LanceDBBackend {
    pub async fn new(uri: &str) -> Result<Self> {
        let conn = lancedb::connect(uri).execute().await?;
        Ok(Self {
            uri: uri.to_string(),
            conn: Arc::new(conn),
        })
    }
}

#[async_trait]
impl MemoryBackend for LanceDBBackend {
    async fn store_fact(&self, fact: Fact) -> Result<String> {
        let _table = self.conn.open_table("facts").execute().await?;
        // In a real implementation, we'd add to the table using arrow batches.
        // For now, returning the fact ID to complete the trait contract.
        Ok(fact.id.clone())
    }

    async fn get_fact(&self, _id: &str) -> Result<Option<Fact>> {
        Ok(None)
    }

    async fn update_fact(&self, _id: &str, _updates: serde_json::Value) -> Result<()> {
        Ok(())
    }

    async fn search_facts(&self, _query: FactSearchQuery) -> Result<Vec<Fact>> {
        Ok(vec![])
    }

    async fn store_entity(&self, _entity: Entity) -> Result<String> {
        Ok("".to_string())
    }

    async fn get_entity(&self, _id: &str) -> Result<Option<Entity>> {
        Ok(None)
    }

    async fn get_session(&self, _id: &str) -> Result<Option<Session>> {
        Ok(None)
    }

    async fn get_scope(&self, _name: &str) -> Result<Option<MemoryScope>> {
        Ok(None)
    }

    async fn store_episode(&self, _episode: Episode) -> Result<String> {
        Ok("".to_string())
    }

    async fn get_episode(&self, _id: &str) -> Result<Option<Episode>> {
        Ok(None)
    }

    async fn check_health(&self) -> Result<bool> {
        Ok(true)
    }
}

pub struct FilesystemMirror {
    pub root_path: String,
}

impl FilesystemMirror {
    pub fn new(root_path: &str) -> Self {
        Self { root_path: root_path.to_string() }
    }
    
    pub async fn sync_fact(&self, fact: &Fact) -> Result<()> {
        let path = std::path::Path::new(&self.root_path).join(&fact.scope_id);
        tokio::fs::create_dir_all(&path).await?;
        let fact_name = if fact.content.len() > 20 { &fact.content[..20] } else { &fact.content };
        let fact_path = path.join(format!("{}.json", fact_name.replace("/", "_")));
        let json = serde_json::to_string_pretty(fact)?;
        tokio::fs::write(fact_path, json).await?;
        Ok(())
    }
}

pub struct HistoryParser;

#[derive(Debug, serde::Deserialize)]
struct SessionLine {
    message: Option<SessionMessage>,
    timestamp: String,
}

#[derive(Debug, serde::Deserialize)]
struct SessionMessage {
    role: String,
    content: String,
}

impl HistoryParser {
    pub fn parse_line(line: &str) -> Result<Option<Fact>> {
        let parsed: SessionLine = match serde_json::from_str(line) {
            Ok(p) => p,
            Err(_) => return Ok(None),
        };

        let msg = match parsed.message {
            Some(m) => m,
            None => return Ok(None),
        };

        if msg.role != "user" || msg.content.len() < 10 {
            return Ok(None);
        }

        let timestamp = chrono::DateTime::parse_from_rfc3339(&parsed.timestamp)
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis());

        let (fact_type, importance) = engram_ai::ReflectionEngine::classify_fact(&msg.content);

        Ok(Some(Fact {
            id: format!("hist-{}", uuid::Uuid::new_v4()),
            content: msg.content,
            timestamp,
            updated_at: Some(timestamp),
            source: "history_bootstrap".to_string(),
            fact_type: fact_type.to_string(),
            relevance_score: importance as f64,
            importance_score: importance as f64,
            lifecycle_state: "active".to_string(),
            created_by: "system:bootstrap".to_string(),
            scope_id: "default".to_string(),
            tags: vec!["bootstrapped".to_string()],
            entity_ids: vec![],
            accessed_count: 0,
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
        }))
    }
}

pub struct BatchImporter<B: MemoryBackend> {
    backend: Arc<B>,
}

impl<B: MemoryBackend> BatchImporter<B> {
    pub fn new(backend: Arc<B>) -> Self {
        Self { backend }
    }

    pub async fn import_directory(&self, path: &str) -> Result<usize> {
        let mut count = 0;
        for entry in walkdir::WalkDir::new(path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && e.path().extension().map_or(false, |ext| ext == "jsonl"))
        {
            let content = tokio::fs::read_to_string(entry.path()).await?;
            for line in content.lines() {
                if let Ok(Some(fact)) = HistoryParser::parse_line(line) {
                    self.backend.store_fact(fact).await?;
                    count += 1;
                }
            }
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_user_line() {
        let line = r#"{"message": {"role": "user", "content": "I need to implement a new feature in the engram-sync crate tonight."}, "timestamp": "2026-03-17T20:00:00Z"}"#;
        let fact = HistoryParser::parse_line(line).unwrap();
        assert!(fact.is_some());
        let f = fact.unwrap();
        assert_eq!(f.content, "I need to implement a new feature in the engram-sync crate tonight.");
        assert_eq!(f.source, "history_bootstrap");
        assert_eq!(f.created_by, "system:bootstrap");
    }

    #[test]
    fn test_parse_assistant_line_ignored() {
        let line = r#"{"message": {"role": "assistant", "content": "I can help with that."}, "timestamp": "2026-03-17T20:01:00Z"}"#;
        let fact = HistoryParser::parse_line(line).unwrap();
        assert!(fact.is_none());
    }
}
