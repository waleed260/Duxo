//! Duxo audit log — §6.3 + §7.3.
//!
//! §7.3 — Audit log hash chain integrity:
//!   Each auditLog entry includes a SHA-256 hash of the previous entry,
//!   forming a simple tamper-evident chain. Any retroactive edit breaks
//!   the chain and is detectable on read.
//!
//! Uses RTDB for storage (same auth as the rest of the host agent —
//! Firebase Auth ID tokens). Firestore is the preferred durable store
//! (§6.3), but RTDB is simpler for MVP since the host agent already has
//! the RTDB auth flow.
//!
//! Actions: login, session_start, session_end, permission_denied, totp_enabled

use crate::types::{DuxoError, Result};
use sha2::{Sha256, Digest};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AuditLogEntry {
    pub uid: String,
    pub action: String,
    pub timestamp: i64,
    pub metadata: serde_json::Value,
    /// §7.3 — SHA-256 hex hash of the previous entry's content.
    /// First entry in the chain uses "0" as the previous hash.
    pub previous_hash: String,
    /// This entry's own hash (for chaining by the next entry).
    #[serde(skip)]
    pub hash: String,
}

/// Compute the SHA-256 hash of an entry's content (excluding the hash field).
pub fn hash_entry(entry: &AuditLogEntry) -> String {
    let mut hasher = Sha256::new();
    hasher.update(entry.uid.as_bytes());
    hasher.update(b"|");
    hasher.update(entry.action.as_bytes());
    hasher.update(b"|");
    hasher.update(entry.timestamp.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(entry.metadata.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(entry.previous_hash.as_bytes());
    hex_encode(&hasher.finalize())
}

/// Write an audit log entry to RTDB.
///
/// §7.3 — Fetches the current chain tip hash, creates a new entry chained
/// to it, and writes it to RTDB under auditLog/{uid}/entries/{entryId}.
pub async fn write_audit_entry(
    database_url: &str,
    id_token: &str,
    _project_id: &str,
    uid: &str,
    action: &str,
    metadata: serde_json::Value,
) -> Result<String> {
    // Fetch the most recent entry's hash to continue the chain.
    let previous_hash = get_tip_hash(
        database_url, id_token, uid,
    ).await.unwrap_or_else(|| "0".to_string());

    let entry = AuditLogEntry {
        uid: uid.to_string(),
        action: action.to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        metadata,
        previous_hash: previous_hash.clone(),
        hash: String::new(), // filled below
    };

    let hash = hash_entry(&entry);

    let entry_id = format!("{}_{}", chrono::Utc::now().timestamp_millis(), uid.chars().take(4).collect::<String>());

    // Write to RTDB: auditLog/{uid}/{entry_id}
    let client = reqwest::Client::new();
    let url = format!(
        "{}/auditLog/{}/{}.json?auth={}",
        database_url.trim_end_matches('/'),
        uid, entry_id, id_token
    );

    let body = serde_json::json!({
        "uid": entry.uid,
        "action": entry.action,
        "timestamp": entry.timestamp,
        "metadata": entry.metadata,
        "previousHash": entry.previous_hash,
        "hash": hash,
    });

    client.put(&url).json(&body).send().await?
        .error_for_status()
        .map_err(|e| DuxoError::Firebase(format!("Audit log write failed: {e}")))?;

    // Update the chain tip pointer.
    let tip_url = format!(
        "{}/auditLog/{}/_tip.json?auth={}",
        database_url.trim_end_matches('/'),
        uid, id_token
    );
    let _ = client.put(&tip_url).json(&serde_json::json!({ "hash": hash })).send().await;

    tracing::info!(
        action = action,
        uid = uid,
        hash = %hash,
        "audit log entry written"
    );

    Ok(entry_id)
}

/// Fetch the hash of the most recent audit entry for a user.
async fn get_tip_hash(
    database_url: &str,
    id_token: &str,
    uid: &str,
) -> Option<String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/auditLog/{}/_tip.json?auth={}",
        database_url.trim_end_matches('/'),
        uid, id_token
    );

    let resp = client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let body: serde_json::Value = resp.json().await.ok()?;
    body.get("hash").and_then(|v| v.as_str()).map(String::from)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
