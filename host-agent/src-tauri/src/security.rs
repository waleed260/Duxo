//! Duxo security module — §2.5 JWT verification + §2.6 secure local storage.
//!
//! §2.5 — The host agent must NOT simply read session.viewerId from RTDB.
//! It verifies the viewer's Firebase ID token signature locally against
//! Google's public signing certificates — no Admin SDK, no server, fully free.
//!
//! §2.6 — Tokens held in OS-native keychain (Windows Credential Manager /
//! Linux Secret Service), never plaintext files. Uses the `keyring` crate.

use crate::types::{DuxoError, Result};
use jsonwebtoken::{decode, decode_header, DecodingKey, Validation, Algorithm};
use serde::Deserialize;
use zeroize::ZeroizeOnDrop;

/// §2.5 — Verified claims extracted from a Firebase ID token AFTER
/// signature verification passes. The host displays these — not anything
/// from RTDB the viewer could write directly.
///
/// §7.2 — Memory hygiene: claims are zeroized on drop so Firebase ID token
/// contents (UID, email) are not left sitting in freed memory.
#[derive(Debug, Deserialize, ZeroizeOnDrop)]
pub struct VerifiedClaims {
    pub sub: String,       // Firebase UID — verified against RTDB viewerId.
    pub email: String,     // Displayed in the Allow/Deny popup (§2.4).
    pub email_verified: bool,
    pub aud: String,       // Must match our Firebase project ID.
    pub iss: String,       // Must be securetoken.google.com/<project_id>.
    pub iat: u64,
    pub exp: u64,
    pub auth_time: u64,
}

/// §2.5 — Google's JWK Set, fetched from the public certs endpoint.
/// Cached in memory for the session lifetime — refreshed on each new connection.
#[derive(Debug, Deserialize)]
pub struct JwkSet {
    pub keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
pub struct Jwk {
    pub kty: String,
    pub alg: String,
    pub use: String,
    pub kid: String,
    pub n: String,
    pub e: String,
}

/// §2.5 — fetch Google's public signing certs for the Firebase project.
/// Uses the JWK (JSON Web Key) endpoint which returns proper RSA public keys
/// in JWK format, directly usable by the jsonwebtoken crate.
/// This endpoint is public, free, no API key or billing.
pub async fn fetch_google_certs(_project_id: &str) -> Result<JwkSet> {
    let url = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
    let client = reqwest::Client::new();
    let resp = client.get(url).send().await?;
    let certs: JwkSet = resp.json().await?;
    Ok(certs)
}

/// §2.5 — Verifies the viewer's Firebase ID token signature locally.
///
/// Steps:
///   1. Viewer's browser gets a signed JWT after login (standard Firebase Auth).
///   2. Viewer includes this ID token in the RTDB session request.
///   3. Host agent verifies JWT signature against Google's public certs.
///   4. Only after verification passes does the host display the email.
///
/// This is the same verification Firebase's Admin SDK does server-side —
/// you're just doing it client-side because the host agent IS the trust boundary.
pub fn verify_viewer_token(
    id_token: &str,
    google_certs: &JwkSet,
    project_id: &str,
) -> Result<VerifiedClaims> {
    let header = decode_header(id_token)
        .map_err(|_| DuxoError::TokenInvalidSignature)?;

    let kid = header.kid.ok_or(DuxoError::MissingKeyId)?;

    let jwk = google_certs.keys.iter()
        .find(|k| k.kid == kid)
        .ok_or(DuxoError::UnknownSigningKey)?;

    let decoding_key = DecodingKey::from_jwk(jwk)
        .map_err(|_| DuxoError::TokenInvalidSignature)?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[project_id]);
    validation.set_issuer(&[
        format!("https://securetoken.google.com/{}", project_id),
    ]);

    let token_data = decode::<VerifiedClaims>(id_token, &decoding_key, &validation)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => DuxoError::TokenExpired,
            _ => DuxoError::TokenInvalidSignature,
        })?;

    // §2.2 — for hosting, email must be verified.
    if !token_data.claims.email_verified {
        tracing::warn!("viewer token has unverified email — allowing view only");
    }

    Ok(token_data.claims)
}

// ─── §2.6 — Secure local storage via OS keychain ───

/// Service name used in the OS keychain.
const KEYRING_SERVICE: &str = "dev.duxo.host";

/// Retrieve a secret from the OS keychain. Returns None if not found.
pub fn get_secret(key: &str) -> Result<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| DuxoError::Firebase(e.to_string()))?;
    match entry.get_password() {
        Ok(secret) => {
            tracing::info!(key = %key, "secret retrieved from keychain");
            Ok(Some(secret))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(DuxoError::Firebase(e.to_string())),
    }
}

/// Store a secret in the OS keychain. Overwrites if it exists.
pub fn set_secret(key: &str, value: &str) -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| DuxoError::Firebase(e.to_string()))?;
    entry.set_password(value)
        .map_err(|e| DuxoError::Firebase(e.to_string()))?;
    tracing::info!(key = %key, "secret stored in keychain");
    Ok(())
}

/// Delete a secret from the OS keychain. No error if it doesn't exist.
pub fn delete_secret(key: &str) -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| DuxoError::Firebase(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!(key = %key, "secret deleted from keychain");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(DuxoError::Firebase(e.to_string())),
    }
}
