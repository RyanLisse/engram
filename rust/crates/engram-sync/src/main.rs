use clap::{Parser, Subcommand};
use anyhow::Result;
use engram_sync::BatchImporter;
use engram_core::MemoryBackend;
use std::sync::Arc;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "engram-sync")]
#[command(about = "Engram history synchronization and bootstrap CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Bootstrap history from existing session files
    Bootstrap {
        /// Path to the directory containing .jsonl session files
        #[arg(short, long)]
        path: PathBuf,
        
        /// Backend URI (e.g., path to LanceDB directory)
        #[arg(short, long, default_value = "./engram_memory")]
        uri: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Bootstrap { path, uri } => {
            println!("Bootstrapping history from: {:?}", path);
            
            let backend = Arc::new(engram_sync::LanceDBBackend::new(&uri).await?);
            let importer = BatchImporter::new(backend);
            let imported_count = importer.import_directory(path.to_str().unwrap()).await?;
            println!("Successfully imported {} facts.", imported_count);
        }
    }

    Ok(())
}
