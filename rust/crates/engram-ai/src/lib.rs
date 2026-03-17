use ndarray::{Array1, Array2, Axis};
use anyhow::Result;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Subspace {
    pub centroid: Vec<f64>,
    pub components: Vec<Vec<f64>>,
    pub singular_values: Vec<f64>,
    pub variance_explained: f64,
}

pub fn consolidate_embeddings(
    embeddings: &[Vec<f64>],
    k: usize,
    max_iterations: usize,
    tolerance: f64,
) -> Result<Subspace> {
    if embeddings.is_empty() {
        return Err(anyhow::anyhow!("No embeddings provided"));
    }

    let n = embeddings.len();
    let d = embeddings[0].len();
    let mut data = Array2::zeros((n, d));

    for (i, v) in embeddings.iter().enumerate() {
        for (j, &val) in v.iter().enumerate() {
            data[[i, j]] = val;
        }
    }

    // 1. Compute Centroid
    let centroid = data.mean_axis(Axis(0)).ok_or_else(|| anyhow::anyhow!("Mean calculation failed"))?;

    // 2. Center Data
    for mut row in data.axis_iter_mut(Axis(0)) {
        row -= &centroid;
    }

    // 3. Total Variance
    let total_variance: f64 = data.iter().map(|&x| x * x).sum::<f64>() / n as f64;
    if total_variance < tolerance {
        return Ok(Subspace {
            centroid: centroid.to_vec(),
            components: vec![],
            singular_values: vec![],
            variance_explained: 1.0,
        });
    }

    let mut components = Vec::new();
    let mut singular_values = Vec::new();
    let mut captured_variance = 0.0;

    let k_limit = k.min(n).min(d);

    for _ in 0..k_limit {
        let v = power_iteration(&data, max_iterations, tolerance)?;
        
        // Compute variance along this component
        let mut comp_variance = 0.0;
        for row in data.axis_iter(Axis(0)) {
            let proj = row.dot(&v);
            comp_variance += proj * proj;
        }
        comp_variance /= n as f64;

        components.push(v.to_vec());
        singular_values.push((comp_variance * n as f64).sqrt());
        captured_variance += comp_variance;

        // Deflate
        for mut row in data.axis_iter_mut(Axis(0)) {
            let proj = row.dot(&v);
            row.scaled_add(-proj, &v);
        }
    }

    Ok(Subspace {
        centroid: centroid.to_vec(),
        components,
        singular_values,
        variance_explained: (captured_variance / total_variance).min(1.0),
    })
}

fn power_iteration(data: &Array2<f64>, max_iter: usize, tol: f64) -> Result<Array1<f64>> {
    let d = data.ncols();
    let n = data.nrows();
    let mut v = Array1::from_elem(d, 1.0 / (d as f64).sqrt());

    for _ in 0..max_iter {
        // w = A^T (A v)
        let u = data.dot(&v);
        let mut w = Array1::zeros(d);
        for i in 0..n {
            w.scaled_add(u[i], &data.row(i));
        }

        let norm = w.dot(&w).sqrt();
        if norm < tol {
            return Err(anyhow::anyhow!("Zero vector in power iteration"));
        }
        w /= norm;

        let diff = (&w - &v).mapv(|x| x * x).sum().sqrt();
        v = w;
        if diff < tol {
            break;
        }
    }
    Ok(v)
}

pub fn detect_novelty(embedding: &[f64], subspace: &Subspace, threshold: f64) -> bool {
    if subspace.components.is_empty() {
        return true;
    }

    let d = embedding.len();
    let mut reconstructed = vec![0.0; d];

    for comp in &subspace.components {
        let ci = dot_simple(comp, embedding);
        for j in 0..d {
            reconstructed[j] += ci * comp[j];
        }
    }

    let mut residual_norm_sq = 0.0;
    for j in 0..d {
        let r = embedding[j] - reconstructed[j];
        residual_norm_sq += r * r;
    }

    residual_norm_sq.sqrt() > threshold
}

fn dot_simple(a: &[f64], b: &[f64]) -> f64 {
    let mut sum = 0.0;
    let d = a.len().min(b.len());
    for i in 0..d {
        sum += a[i] * b[i];
    }
    sum
}

pub fn incremental_update(existing: &Subspace, new_embedding: &[f64], n: usize) -> Subspace {
    let d = existing.centroid.len();
    if d == 0 || new_embedding.len() != d {
        return existing.clone();
    }

    let old_n = n as f64;
    let new_n = old_n + 1.0;

    // 1. Update centroid
    let mut new_centroid = vec![0.0; d];
    for j in 0..d {
        new_centroid[j] = (old_n * existing.centroid[j] + new_embedding[j]) / new_n;
    }

    // 2. Centered new vector relative to NEW centroid
    let mut centered = vec![0.0; d];
    for j in 0..d {
        centered[j] = new_embedding[j] - new_centroid[j];
    }

    // 3. Compute residual after projecting onto existing components
    let mut residual = centered.clone();
    let mut projections = Vec::new();
    for comp in &existing.components {
        let proj = dot_simple(&residual, comp);
        projections.push(proj);
        for j in 0..d {
            residual[j] -= proj * comp[j];
        }
    }

    // This is an approximation; we keep same components but update variance estimates
    // In a full update we'd Re-SVD, but here we just update singular values.
    
    // Total variance update (simplified)
    let mut diff_norm_sq = 0.0;
    for j in 0..d {
        let diff = new_embedding[j] - existing.centroid[j];
        diff_norm_sq += diff * (new_embedding[j] - new_centroid[j]);
    }
    
    // This is an simplified online variance update. 
    // real_total_variance = (old_var * old_n + diff_norm_sq) / new_n
    // We don't store total_variance in Subspace currently, maybe we should.

    Subspace {
        centroid: new_centroid,
        components: existing.components.clone(),
        singular_values: existing.singular_values.clone(), // Should be updated in real impl
        variance_explained: existing.variance_explained,
    }
}

pub fn project_to_compact(embedding: &[f64], subspace: &Subspace) -> Vec<f64> {
    let d = subspace.centroid.len();
    let mut centered = vec![0.0; d];
    for j in 0..d {
        centered[j] = embedding[j] - subspace.centroid[j];
    }
    subspace.components.iter().map(|comp| dot_simple(&centered, comp)).collect()
}

use std::collections::HashSet;

pub fn jaccard_similarity(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(b).count();
    let union = a.len() + b.len() - intersection;
    if union == 0 {
        return 0.0;
    }
    intersection as f32 / union as f32
}

pub fn tokenize(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .map(|w| w.to_string())
        .collect()
}

pub fn generate_merged_content(keep_content: &str, merge_content: &str) -> String {
    let keep_sentences = split_sentences(keep_content);
    let merge_sentences = split_sentences(merge_content);

    let keep_fingerprints: Vec<HashSet<String>> = keep_sentences.iter().map(|s| tokenize(s)).collect();

    let mut unique_sentences = Vec::new();
    for sentence in merge_sentences {
        let sentence_words = tokenize(&sentence);
        let mut is_duplicate = false;
        for fp in &keep_fingerprints {
            if jaccard_similarity(fp, &sentence_words) > 0.6 {
                is_duplicate = true;
                break;
            }
        }
        if !is_duplicate {
            unique_sentences.push(sentence);
        }
    }

    if unique_sentences.is_empty() {
        return keep_content.to_string();
    }

    let max_length = keep_content.len() * 2;
    let mut merged = keep_content.to_string();

    for sentence in unique_sentences {
        let candidate = format!("{} {}", merged, sentence);
        if candidate.len() > max_length {
            break;
        }
        merged = candidate;
    }

    merged.trim().to_string()
}

fn split_sentences(text: &str) -> Vec<String> {
    // Basic sentence splitter using regex-like logic
    text.split_inclusive(|c| c == '.' || c == '!' || c == '?')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub struct ReflectionEngine;

impl ReflectionEngine {
    pub fn classify_fact(content: &str) -> (&'static str, f32) {
        let lower = content.to_lowercase();

        // 1. Corrections: strong negative indicators
        if lower.contains("actually,")
            || lower.contains("no, i")
            || lower.contains("that's wrong")
            || lower.contains("scratch that")
            || lower.contains("revert")
            || lower.contains("incorrect")
            || lower.contains("mistake")
        {
            return ("correction", 0.95);
        }

        // 2. Constraints & Preferences: personal style/methodology
        if lower.contains("i prefer")
            || lower.contains("i like")
            || lower.contains("always use")
            || lower.contains("never use")
            || lower.contains("strictly")
            || lower.contains("constraint")
            || lower.contains("requirement")
            || lower.contains("must be")
            || lower.contains("should be")
        {
            return ("preference", 0.85);
        }

        // 3. Technical Specs & Architectures
        if lower.contains("architecture")
            || lower.contains("implementation")
            || lower.contains("endpoint")
            || lower.contains("schema")
            || lower.contains("interface")
            || lower.contains("module")
            || lower.contains("crate")
            || lower.contains("dependency")
            || lower.contains("layer")
        {
            return ("technical_spec", 0.75);
        }

        // 4. Decisions: forward-looking choices
        if lower.contains("let's go with")
            || lower.contains("we'll use")
            || lower.contains("decided to")
            || lower.contains("implement this")
            || lower.contains("go with")
            || lower.contains("choice")
        {
            return ("decision", 0.7);
        }

        ("note", 0.4)
    }

    pub fn generate_reflection_report(
        scope_name: &str,
        facts_summary: &str,
        type_breakdown: &str,
        top_entities: &str,
        tags: &[String],
    ) -> String {
        let now = chrono::Utc::now();
        let tags_str = tags.join(", ");
        
        format!(
            "**4-Hour Reflection for scope [{}]**\n\n\
             **Summary**: {}\n\
             **Types**: {}\n\
             **Key entities**: {}\n\
             **Tags seen**: {}\n\
             **Timestamp**: {}",
            scope_name,
            facts_summary,
            type_breakdown,
            top_entities,
            tags_str,
            now.to_rfc3339()
        )
    }
}
