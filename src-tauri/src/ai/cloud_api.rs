use crate::ai::context::SchemaContext;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub provider: AIProvider,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AIProvider {
    Anthropic,
    OpenAI,
    Google,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            provider: AIProvider::Anthropic,
            api_key: String::new(),
            model: "claude-sonnet-4-6".into(),
        }
    }
}

pub struct AIService {
    config: RwLock<Option<AIConfig>>,
    http_client: reqwest::Client,
}

impl AIService {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(None),
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn configure(&self, config: AIConfig) {
        *self.config.write().await = Some(config);
    }

    pub async fn is_configured(&self) -> bool {
        self.config.read().await.is_some()
    }

    /// Generate SQL from natural language
    pub async fn nl_to_sql(
        &self,
        prompt: &str,
        schema: &SchemaContext,
        recent_queries: &[String],
    ) -> Result<String> {
        let ddl = schema.to_ddl_summary();
        let recent = if recent_queries.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nRecent queries for context:\n{}",
                recent_queries
                    .iter()
                    .take(5)
                    .map(|q| format!("- {}", q))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        };

        let system = format!(
            "You are a PostgreSQL expert assistant embedded in a database client. \
             Generate only valid PostgreSQL SQL. NEVER wrap the output in markdown code fences \
             (no ```sql, no ```, no triple backticks of any kind). \
             Do not include any explanations. Respond with ONLY the raw SQL query text.\n\n\
             Database schema:\n{ddl}{recent}"
        );

        let result = self.chat(&system, prompt).await?;
        Ok(strip_code_fences(&result))
    }

    /// Explain a SQL query
    pub async fn explain_query(
        &self,
        sql: &str,
        schema: &SchemaContext,
    ) -> Result<String> {
        let ddl = schema.to_ddl_summary();
        let system = format!(
            "You are a PostgreSQL expert. Explain SQL queries clearly and concisely. \
             Reference specific tables and columns from the schema.\n\n\
             Database schema:\n{ddl}"
        );
        let prompt = format!("Explain this query:\n\n```sql\n{sql}\n```");
        self.chat(&system, &prompt).await
    }

    /// Suggest optimization for a SQL query
    pub async fn optimize_query(
        &self,
        sql: &str,
        schema: &SchemaContext,
        error: Option<&str>,
    ) -> Result<String> {
        let ddl = schema.to_ddl_summary();
        let system = format!(
            "You are a PostgreSQL performance expert. Suggest query optimizations, \
             missing indexes, and better query patterns. If there's an error, fix it. \
             Respond with the improved SQL first, then a brief explanation.\n\n\
             Database schema:\n{ddl}"
        );
        let prompt = if let Some(err) = error {
            format!(
                "This query failed with error: {err}\n\n```sql\n{sql}\n```\n\nFix it and explain what was wrong."
            )
        } else {
            format!("Optimize this query:\n\n```sql\n{sql}\n```")
        };
        self.chat(&system, &prompt).await
    }

    /// Inline autocomplete — returns just the completion text
    pub async fn complete_sql(
        &self,
        prefix: &str,
        suffix: &str,
        schema: &SchemaContext,
    ) -> Result<String> {
        let ddl = schema.to_ddl_summary();
        let system = format!(
            "You are a SQL autocomplete engine. Complete the SQL query at the cursor position \
             marked with <CURSOR>. Return ONLY the completion text (what goes at the cursor), \
             nothing else. No markdown, no explanation. If unsure, return empty string.\n\n\
             Database schema:\n{ddl}"
        );
        let prompt = format!("{prefix}<CURSOR>{suffix}");
        self.chat(&system, &prompt).await
    }

    /// General chat
    pub async fn chat(&self, system: &str, user_message: &str) -> Result<String> {
        let config = self.config.read().await;
        let config = config
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("AI not configured. Set your API key in Settings."))?;

        match config.provider {
            AIProvider::Anthropic => self.call_anthropic(config, system, user_message).await,
            AIProvider::OpenAI => self.call_openai(config, system, user_message).await,
            AIProvider::Google => self.call_google_gemini(config, system, user_message).await,
        }
    }

    async fn call_anthropic(
        &self,
        config: &AIConfig,
        system: &str,
        user_message: &str,
    ) -> Result<String> {
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": 4096,
            "system": system,
            "messages": [
                {"role": "user", "content": user_message}
            ]
        });

        let resp = self
            .http_client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            return Err(anyhow::anyhow!("Anthropic API error ({}): {}", status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)?;
        let content = json["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        Ok(content)
    }

    async fn call_openai(
        &self,
        config: &AIConfig,
        system: &str,
        user_message: &str,
    ) -> Result<String> {
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_message}
            ]
        });

        let resp = self
            .http_client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            return Err(anyhow::anyhow!("OpenAI API error ({}): {}", status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        Ok(content)
    }

    async fn call_google_gemini(
        &self,
        config: &AIConfig,
        system: &str,
        user_message: &str,
    ) -> Result<String> {
        let body = serde_json::json!({
            "systemInstruction": {
                "parts": [
                    { "text": system }
                ]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        { "text": user_message }
                    ]
                }
            ]
        });

        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            config.model, config.api_key
        );

        let resp = self
            .http_client
            .post(endpoint)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            return Err(anyhow::anyhow!("Gemini API error ({}): {}", status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)?;
        let content = json["candidates"]
            .as_array()
            .and_then(|candidates| candidates.first())
            .and_then(|candidate| candidate["content"]["parts"].as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();

        Ok(content)
    }
}

/// Strip markdown code fences from AI responses (```sql ... ``` or ``` ... ```)
fn strip_code_fences(s: &str) -> String {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```") {
        // Skip optional language tag on the first line
        let rest = if let Some(pos) = rest.find('\n') {
            &rest[pos + 1..]
        } else {
            rest
        };
        // Strip trailing ```
        let rest = rest.strip_suffix("```").unwrap_or(rest);
        rest.trim().to_string()
    } else {
        trimmed.to_string()
    }
}
