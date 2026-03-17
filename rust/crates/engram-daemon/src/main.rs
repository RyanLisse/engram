#![recursion_limit = "8192"]
use std::sync::Arc;
use tokio::time::{self, Duration};
use engram_core::{ReflectionManager, MemoryBackend};
use anyhow::Result;
use log::{info, error};

pub struct EngramDaemon<B: MemoryBackend> {
    reflection_manager: Arc<ReflectionManager<B>>,
}

impl<B: MemoryBackend + 'static> EngramDaemon<B> {
    pub fn new(backend: Arc<B>) -> Self {
        Self {
            reflection_manager: Arc::new(ReflectionManager::new(backend)),
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("Engram Daemon starting...");
        
        let mut reflection_interval = time::interval(Duration::from_secs(4 * 3600)); // 4 hours
        
        loop {
            tokio::select! {
                _ = reflection_interval.tick() => {
                    info!("Running periodic reflection sweep...");
                    if let Err(e) = self.reflection_manager.sweep_scope("default").await {
                        error!("Reflection sweep failed: {:?}", e);
                    } else {
                        info!("Reflection sweep completed successfully.");
                    }
                }
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    
    info!("Engram Daemon starting...");
    
    let backend = Arc::new(engram_sync::LanceDBBackend::new("./engram_memory").await?);
    let daemon = EngramDaemon::new(backend);
    
    daemon.run().await?;
    
    Ok(())
}
