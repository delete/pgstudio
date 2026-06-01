use anyhow::{anyhow, Context, Result};
use base64::Engine;
use serde_json::Value;
use std::path::PathBuf;

pub const CODEX_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
pub const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
pub const API_BASE: &str = "https://chatgpt.com/backend-api/codex/responses";
const REFRESH_BUFFER_SECONDS: i64 = 300;

/// Tokens loaded from `~/.codex/auth.json` (ChatGPT OAuth login shared with Codex CLI).
pub struct CodexAuth {
    pub access_token: String,
    pub refresh_token: String,
    pub account_id: String,
    path: PathBuf,
}

fn auth_path() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME not set")?;
    Ok(PathBuf::from(home).join(".codex").join("auth.json"))
}

impl CodexAuth {
    /// Load and validate the Codex auth file. Returns an actionable error when the
    /// user isn't logged in with a ChatGPT account.
    pub fn load() -> Result<Self> {
        let path = auth_path()?;
        if !path.exists() {
            return Err(anyhow!(
                "Login do Codex não encontrado. Rode `codex login` (conta ChatGPT) e tente novamente."
            ));
        }
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("não foi possível ler {}", path.display()))?;
        let data: Value = serde_json::from_str(&raw).context("auth.json inválido")?;

        let mode = data.get("auth_mode").and_then(|v| v.as_str()).unwrap_or("");
        if mode != "chatgpt" {
            return Err(anyhow!(
                "Codex está em modo '{mode}', não 'chatgpt'. Rode `codex login` com sua conta ChatGPT."
            ));
        }

        let tokens = data
            .get("tokens")
            .ok_or_else(|| anyhow!("auth.json sem 'tokens'. Refaça o login no Codex."))?;
        let access_token = tokens
            .get("access_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow!("access_token ausente no auth.json. Refaça o login no Codex."))?
            .to_string();
        let refresh_token = tokens
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow!("refresh_token ausente no auth.json. Refaça o login no Codex."))?
            .to_string();
        let account_id = tokens
            .get("account_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        Ok(Self {
            access_token,
            refresh_token,
            account_id,
            path,
        })
    }

    /// Refresh the access token if it's within the expiry buffer, persisting the
    /// new tokens back to auth.json atomically (shared with the Codex CLI).
    pub async fn ensure_fresh(&mut self, http: &reqwest::Client) -> Result<()> {
        let exp = match jwt_exp(&self.access_token) {
            Some(exp) => exp,
            None => return Ok(()), // can't parse — assume usable, let the API reject if not
        };
        let now = chrono::Utc::now().timestamp();
        if now < exp - REFRESH_BUFFER_SECONDS {
            return Ok(());
        }

        let resp = http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", self.refresh_token.as_str()),
                ("client_id", CODEX_CLIENT_ID),
            ])
            .send()
            .await
            .context("falha ao renovar token do Codex")?;

        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!(
                "Não foi possível renovar o login do Codex ({status}). Rode `codex login` novamente."
            ));
        }

        let new_tokens: Value = serde_json::from_str(&body).context("resposta de refresh inválida")?;
        if let Some(at) = new_tokens.get("access_token").and_then(|v| v.as_str()) {
            self.access_token = at.to_string();
        }
        if let Some(rt) = new_tokens.get("refresh_token").and_then(|v| v.as_str()) {
            self.refresh_token = rt.to_string();
        }

        self.write_back()?;
        Ok(())
    }

    /// Persist refreshed tokens back to auth.json via temp-file + atomic rename so
    /// the Codex CLI keeps working.
    fn write_back(&self) -> Result<()> {
        let raw = std::fs::read_to_string(&self.path)?;
        let mut data: Value = serde_json::from_str(&raw)?;
        if let Some(tokens) = data.get_mut("tokens").and_then(|t| t.as_object_mut()) {
            tokens.insert("access_token".into(), Value::String(self.access_token.clone()));
            tokens.insert("refresh_token".into(), Value::String(self.refresh_token.clone()));
        }
        if let Some(obj) = data.as_object_mut() {
            obj.insert(
                "last_refresh".into(),
                Value::String(chrono::Utc::now().to_rfc3339()),
            );
        }
        let serialized = serde_json::to_string_pretty(&data)?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serialized)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

/// Decode a JWT payload and return its `exp` claim (epoch seconds).
fn jwt_exp(token: &str) -> Option<i64> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims: Value = serde_json::from_slice(&bytes).ok()?;
    claims.get("exp").and_then(|v| v.as_i64())
}
