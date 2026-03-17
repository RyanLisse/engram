#![recursion_limit = "8192"]
use anyhow::Result;
use notify::{Watcher, RecursiveMode, Event};
use std::path::Path;
use engram_core::MemoryBackend;
use std::sync::Arc;

pub struct VaultWatcher<B: MemoryBackend> {
    backend: Arc<B>,
}

impl<B: MemoryBackend> VaultWatcher<B> {
    pub fn new(backend: Arc<B>) -> Self {
        Self { backend }
    }

    pub async fn start_watching(&self, path: &Path) -> Result<()> {
        let (tx, mut rx) = tokio::sync::mpsc::channel(100);

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        })?;

        watcher.watch(path, RecursiveMode::Recursive)?;

        while let Some(event) = rx.recv().await {
            self.handle_event(event).await?;
        }

        Ok(())
    }

    async fn handle_event(&self, event: Event) -> Result<()> {
        use notify::event::{EventKind, ModifyKind};
        use engram_types::Fact;
        use std::fs;

        if let EventKind::Modify(ModifyKind::Data(_)) = event.kind {
            for path in event.paths {
                if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    let content = fs::read_to_string(&path)?;
                    let fact = Fact {
                        id: format!("fs-{}", uuid::Uuid::new_v4()), // Use unique ID or path-based hash
                        content: content.clone(),
                        factual_summary: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        updated_at: Some(chrono::Utc::now().timestamp_millis()),
                        vault_path: Some(path.to_string_lossy().to_string()),
                        vault_synced_at: Some(chrono::Utc::now().timestamp_millis()),
                        confidence: Some(1.0),
                        importance_tier: None,
                        observation_tier: None,
                        observation_compressed: None,
                        observation_generation: None,
                        observation_session_id: None,
                        assertion_type: None,
                        referenced_date: None,
                        observation_original_content: Some(content),
                        source: "fs-mirror".to_string(),
                        entity_ids: vec![],
                        relevance_score: 1.0,
                        accessed_count: 0,
                        importance_score: 0.5,
                        merged_content: None,
                        outcome_score: None,
                        created_by: "system".to_string(),
                        contributing_agents: None,
                        conversation_id: None,
                        scope_id: "default".to_string(),
                        tags: vec![],
                        fact_type: "observation".to_string(),
                        embedding: None,
                        compact_embedding: None,
                        lifecycle_state: "active".to_string(),
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
                    self.backend.store_fact(fact).await?;
                }
            }
        }
        Ok(())
    }
}
