//! Duxo host authentication — device pairing and Firebase token lifecycle.
//!
//! FILLS A HOLE IN THE PLAN. §2.6 says the host keeps its Firebase ID token in
//! the OS keychain, and §1.6-B has the host reading and writing RTDB as an
//! authenticated user — but no section says how the host agent ever *obtains*
//! that token. It cannot reuse the viewer's path: the web app authenticates
//! with Clerk and mints a Firebase custom token server-side (§2.1), and the
//! host agent has neither a Clerk session nor the Firebase service-account key
//! (which must never ship inside a binary users download).
//!
//! So the host does what a TV app does — it pairs:
//!
//!   1. Host generates a random pairing code and writes `pairings/{code}` with
//!      its own device metadata and nothing else.
//!   2. Host shows the code; the user signs in to the Duxo web app on any
//!      device and enters it.
//!   3. The web app's `/api/link-device` route verifies the Clerk session and
//!      mints a Firebase **custom token** for that user's uid — the same uid
//!      the viewer gets — then writes it back to the pairing node.
//!   4. Host exchanges the custom token for an ID token + refresh token via
//!      Firebase's public REST endpoint, stores the *refresh* token in the OS
//!      keychain (§2.6), and deletes the pairing node.
//!
//! The service-account key never leaves the server. The pairing node is
//! short-lived and single-use. And because the uid is the user's own, the
//! `hostId == auth.uid` RTDB rule in §10.2 works unchanged.
//!
//! §8.3 — Firebase ID tokens last one hour. The refresh token is the durable
//! credential; ID tokens are minted on demand and never persisted.

use crate::types::{DuxoError, Result};
use serde::Deserialize;
use std::time::{Duration, Instant};

/// Keychain entry holding the long-lived refresh token (§2.6).
const KEY_REFRESH_TOKEN: &str = "firebase_refresh_token";
/// Keychain entry holding the Firebase uid this device is paired to.
const KEY_UID: &str = "firebase_uid";

/// §8.3 — ID tokens are valid for one hour. Refresh early enough that a token
/// handed to a long RTDB operation cannot expire mid-flight.
const TOKEN_REFRESH_MARGIN: Duration = Duration::from_secs(5 * 60);
const TOKEN_LIFETIME: Duration = Duration::from_secs(60 * 60);

/// How long to wait for the user to approve a pairing before giving up.
const PAIRING_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const PAIRING_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// A live Firebase session for the host agent.
///
/// §7.2 — the ID token is held in memory only and never written to disk. Only
/// the refresh token reaches the keychain.
pub struct HostAuth {
    api_key: String,
    database_url: String,
    project_id: String,
    uid: String,
    refresh_token: String,
    id_token: String,
    fetched_at: Instant,
}

#[derive(Deserialize)]
struct CustomTokenExchange {
    #[serde(rename = "idToken")]
    id_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
}

#[derive(Deserialize)]
struct RefreshResponse {
    id_token: String,
    refresh_token: String,
    user_id: String,
}

impl HostAuth {
    /// Restore a session from the OS keychain, if this device has been paired.
    ///
    /// Returns `Ok(None)` when the device has simply never been linked — that
    /// is the normal first-run state, not an error.
    pub async fn restore(
        api_key: &str,
        database_url: &str,
        project_id: &str,
    ) -> Result<Option<Self>> {
        let refresh_token = match crate::security::get_secret(KEY_REFRESH_TOKEN)? {
            Some(t) => t,
            None => return Ok(None),
        };

        match Self::exchange_refresh_token(api_key, &refresh_token).await {
            Ok(resp) => {
                // Firebase rotates refresh tokens; persist whatever came back.
                crate::security::set_secret(KEY_REFRESH_TOKEN, &resp.refresh_token)?;
                crate::security::set_secret(KEY_UID, &resp.user_id)?;
                tracing::info!(uid = %resp.user_id, "restored host session from keychain");
                Ok(Some(Self {
                    api_key: api_key.to_string(),
                    database_url: database_url.to_string(),
                    project_id: project_id.to_string(),
                    uid: resp.user_id,
                    refresh_token: resp.refresh_token,
                    id_token: resp.id_token,
                    fetched_at: Instant::now(),
                }))
            }
            Err(e) => {
                // A revoked or invalid refresh token is unrecoverable — clear
                // it so the UI offers pairing again rather than failing every
                // session with a stale credential.
                tracing::warn!(error = %e, "stored refresh token rejected — clearing");
                let _ = crate::security::delete_secret(KEY_REFRESH_TOKEN);
                let _ = crate::security::delete_secret(KEY_UID);
                Ok(None)
            }
        }
    }

    /// The Firebase uid this host is acting as. Written to `sessions/{id}/hostId`.
    pub fn uid(&self) -> &str {
        &self.uid
    }

    pub fn database_url(&self) -> &str {
        &self.database_url
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    /// A currently-valid Firebase ID token, refreshed transparently.
    ///
    /// Every RTDB call goes through here rather than holding a token, because
    /// a session can outlive the one-hour lifetime and §1.6-B's polling loop
    /// would otherwise start silently 401ing partway through a support call.
    pub async fn id_token(&mut self) -> Result<String> {
        if self.fetched_at.elapsed() + TOKEN_REFRESH_MARGIN < TOKEN_LIFETIME {
            return Ok(self.id_token.clone());
        }

        let resp = Self::exchange_refresh_token(&self.api_key, &self.refresh_token).await?;
        crate::security::set_secret(KEY_REFRESH_TOKEN, &resp.refresh_token)?;
        self.refresh_token = resp.refresh_token;
        self.id_token = resp.id_token.clone();
        self.fetched_at = Instant::now();
        tracing::info!("firebase ID token refreshed");
        Ok(resp.id_token)
    }

    /// Forget this device's pairing (§8.2 device trust lifecycle).
    pub fn sign_out(&self) -> Result<()> {
        crate::security::delete_secret(KEY_REFRESH_TOKEN)?;
        crate::security::delete_secret(KEY_UID)?;
        tracing::info!("host device unlinked");
        Ok(())
    }

    async fn exchange_refresh_token(api_key: &str, refresh_token: &str) -> Result<RefreshResponse> {
        let client = reqwest::Client::new();
        let resp = client
            .post(format!(
                "https://securetoken.googleapis.com/v1/token?key={api_key}"
            ))
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(DuxoError::Firebase(format!(
                "token refresh failed ({status}): {body}"
            )));
        }

        Ok(resp.json::<RefreshResponse>().await?)
    }
}

/// A pairing in progress: the code to show the user, and where to enter it.
pub struct PendingPairing {
    pub code: String,
    pub verification_url: String,
}

/// Step 1 — publish a pairing request and return the code to display.
///
/// The pairing node is written unauthenticated, which is why it carries no
/// secrets and why the RTDB rule for `pairings` allows an anonymous create but
/// no read of anyone else's node. The only thing an attacker gains by guessing
/// a code is the ability to have *their own* account linked to a host they do
/// not control — which is why step 3 shows the user the device name and asks
/// them to confirm.
pub async fn begin_pairing(
    database_url: &str,
    web_app_url: &str,
    device_name: &str,
    platform: &str,
) -> Result<PendingPairing> {
    let code = generate_pairing_code();

    let client = reqwest::Client::new();
    let url = format!(
        "{}/pairings/{}.json",
        database_url.trim_end_matches('/'),
        code
    );

    let body = serde_json::json!({
        "deviceName": device_name,
        "platform": platform,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "createdAt": { ".sv": "timestamp" },
        "claimed": false,
    });

    client
        .put(&url)
        .json(&body)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| DuxoError::Firebase(format!("could not start pairing: {e}")))?;

    tracing::info!(code = %code, "pairing started — waiting for web approval");

    Ok(PendingPairing {
        code: code.clone(),
        verification_url: format!("{}/link-device", web_app_url.trim_end_matches('/')),
    })
}

/// Steps 3–4 — poll until the web app drops a custom token in, then exchange
/// it for a durable session and persist the refresh token.
///
/// Times out after ten minutes so an abandoned pairing does not poll forever.
pub async fn complete_pairing(
    api_key: &str,
    database_url: &str,
    project_id: &str,
    code: &str,
) -> Result<HostAuth> {
    let client = reqwest::Client::new();
    let poll_url = format!(
        "{}/pairings/{}/customToken.json",
        database_url.trim_end_matches('/'),
        code
    );

    let started = Instant::now();

    let custom_token = loop {
        if started.elapsed() > PAIRING_TIMEOUT {
            let _ = delete_pairing(database_url, code).await;
            return Err(DuxoError::Firebase(
                "pairing timed out — no one approved this code".into(),
            ));
        }

        tokio::time::sleep(PAIRING_POLL_INTERVAL).await;

        let resp = match client.get(&poll_url).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(error = %e, "pairing poll failed — retrying");
                continue;
            }
        };

        let value: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(token) = value.as_str() {
            break token.to_string();
        }
    };

    // Exchange the custom token for a real Firebase session.
    let resp = client
        .post(format!(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={api_key}"
        ))
        .json(&serde_json::json!({
            "token": custom_token,
            "returnSecureToken": true,
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let _ = delete_pairing(database_url, code).await;
        return Err(DuxoError::Firebase(format!(
            "custom token exchange failed ({status}): {body}"
        )));
    }

    let exchange: CustomTokenExchange = resp.json().await?;

    // The pairing node has served its purpose and still holds a usable custom
    // token — remove it immediately rather than letting it sit until expiry.
    let _ = delete_pairing(database_url, code).await;

    // Read the uid back out of the freshly issued token rather than trusting
    // anything the pairing node said about who this is.
    let refreshed = HostAuth::exchange_refresh_token(api_key, &exchange.refresh_token).await?;

    crate::security::set_secret(KEY_REFRESH_TOKEN, &refreshed.refresh_token)?;
    crate::security::set_secret(KEY_UID, &refreshed.user_id)?;

    tracing::info!(uid = %refreshed.user_id, "device paired successfully");

    Ok(HostAuth {
        api_key: api_key.to_string(),
        database_url: database_url.to_string(),
        project_id: project_id.to_string(),
        uid: refreshed.user_id,
        refresh_token: refreshed.refresh_token,
        id_token: exchange.id_token,
        fetched_at: Instant::now(),
    })
}

async fn delete_pairing(database_url: &str, code: &str) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/pairings/{}.json",
        database_url.trim_end_matches('/'),
        code
    );
    client.delete(&url).send().await?;
    Ok(())
}

/// A 6-character pairing code from an unambiguous alphabet.
///
/// Deliberately not the §0.6 8-digit *session* code alphabet: these get read
/// aloud and typed on a phone, so 0/O and 1/I/L are excluded. 28^6 ≈ 480M
/// combinations against a node that lives at most ten minutes.
fn generate_pairing_code() -> String {
    use rand::Rng;
    const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_code_avoids_ambiguous_characters() {
        for _ in 0..200 {
            let code = generate_pairing_code();
            assert_eq!(code.len(), 6);
            for c in code.chars() {
                assert!(
                    !"O01IL".contains(c),
                    "{code} contains a character that is ambiguous when read aloud"
                );
                assert!(c.is_ascii_uppercase() || c.is_ascii_digit());
            }
        }
    }

    #[test]
    fn pairing_codes_are_not_constant() {
        let a = generate_pairing_code();
        let b = generate_pairing_code();
        let c = generate_pairing_code();
        assert!(a != b || b != c, "codes must not be deterministic");
    }
}
