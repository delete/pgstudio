# Plano de implementação — Reaproveitar login do Codex no pgstudio

Reusar a sessão ChatGPT do Codex (`~/.codex/auth.json`) como provider de IA do
pgstudio, sem o usuário digitar API key. Baseado no app de referência
`companion/legacy` (`openai_provider.py`), adaptado para Rust/Tauri e validado
empiricamente contra o backend real.

## Fatos verificados (probes com o token vivo)

- `auth_mode == "chatgpt"`, `OPENAI_API_KEY == null` → **não existe API key**; só o
  caminho OAuth/ChatGPT backend funciona.
- Endpoint: `POST https://chatgpt.com/backend-api/codex/responses` (Responses API).
- Headers obrigatórios: `Authorization: Bearer <access_token>`,
  `ChatGPT-Account-Id: <account_id>`, `originator: codex_cli_rs`,
  `OpenAI-Beta: responses=experimental`, `Content-Type: application/json`,
  `Accept: text/event-stream`.
- Body obrigatório (senão 400): `input` como **lista de mensagens**
  `[{role, content:[{type:"input_text", text}]}]`, `store:false`, `stream:true`,
  `model`, `instructions` (system prompt), `reasoning:{effort}`.
- **Streaming é obrigatório.** `stream:false` → 400 "Stream must be set to true".
- Texto vem dos eventos SSE `response.output_text.delta` (acumular) — o evento
  final `response.completed` traz `output: []`.
- Modelos aceitos na conta (200): `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`,
  `gpt-5.3-codex`, `gpt-5.2`. Demais nomes → 400 "not supported ... ChatGPT account".
- Effort aceito: `none`, `low`, `medium`, `high`. `minimal` → 400.
- Refresh: `POST https://auth.openai.com/oauth/token`,
  `grant_type=refresh_token&refresh_token=…&client_id=app_EMoamEEZ73f0CkXaXp7hrann`.

## Decisões fechadas

1. Novo `AIProvider::Codex` (caminho separado; OpenAI/api.openai.com intocado).
2. Lê `~/.codex/auth.json` **a cada chamada**; checa `exp` do JWT; refresh 5 min
   antes; **grava de volta atomicamente** (temp + rename).
3. Só modo `chatgpt`. Arquivo ausente / modo errado / refresh_token morto → erro
   acionável ("rode `codex login`"). Sem fallback silencioso.
4. UI: card "OpenAI (Codex login)", esconde campo de API key, mostra a conta
   detectada. Dropdown com os 5 modelos (default `gpt-5.5`) + seletor de effort
   (low/medium/high).
5. Autocomplete (`complete_sql`): **sempre `gpt-5.4-mini` + effort `none`**,
   independente do modelo escolhido para chat.
6. Persistência: `provider="codex"`, `model`, `effort`; coluna `api_key` vazia.

---

## Mudanças por arquivo

### Backend (Rust)

#### `src-tauri/src/ai/codex_auth.rs` (novo)
- `struct CodexAuth { access_token, refresh_token, account_id, path }`.
- `fn load() -> Result<CodexAuth>`: expande `~/.codex/auth.json`, valida
  `auth_mode == "chatgpt"`, extrai `tokens.*`. Erros acionáveis se faltar.
- `fn jwt_exp(token) -> Option<i64>`: base64url-decode do payload, lê `exp`.
- `async fn ensure_fresh(&mut self, http)`: se `now >= exp - 300`, faz refresh e
  `write_back()`.
- `fn write_back(&self)`: lê o JSON atual, atualiza
  `tokens.access_token/refresh_token` + `last_refresh`, escreve em
  `auth.json.tmp` e `rename` por cima (atômico).
- Constantes: `CODEX_CLIENT_ID`, `TOKEN_URL`, `API_BASE`, `REFRESH_BUFFER=300`.

#### `src-tauri/src/ai/cloud_api.rs`
- `AIProvider`: adicionar variante `Codex`.
- `AIConfig`: adicionar `effort: Option<String>` (default `"medium"`; só usado por
  Codex).
- `enum CallKind { Standard, Autocomplete }` (interno).
- Refatorar `chat()` → `chat_kind(system, user, CallKind::Standard)`; manter a
  assinatura pública. `complete_sql()` chama `chat_kind(..., Autocomplete)`.
- `chat_kind` faz match no provider; para `Codex` chama `call_codex`.
- `async fn call_codex(system, user, kind)`:
  - `CodexAuth::load()` + `ensure_fresh()`.
  - Resolve `(model, effort)`:
    - `Autocomplete` → `("gpt-5.4-mini", "none")`.
    - `Standard` → `(config.model, config.effort | "medium")`.
  - Monta body Responses (input list, `store:false`, `stream:true`,
    `instructions=system`, `reasoning.effort`).
  - `reqwest` POST com os headers acima; `resp.text().await` (SSE inteiro).
  - `fn parse_sse_text(body) -> String`: concatena os `delta` dos eventos
    `response.output_text.delta` (fallback: `response.output_text.done.text`).
  - Erros HTTP/401 → mensagem acionável.
- Não precisa de feature nova no reqwest (lemos o corpo inteiro, não stream real).

#### `src-tauri/src/storage/local_db.rs`
- `CREATE TABLE ai_config`: adicionar coluna `effort TEXT`.
- Migração para DBs existentes: `ALTER TABLE ai_config ADD COLUMN effort TEXT`
  (ignorar erro "duplicate column").
- `save_ai_config(provider, model, api_key, effort)` e
  `get_ai_config() -> Option<(provider, model, api_key, effort)>`.

#### `src-tauri/src/commands.rs`
- `AIConfigInput`: adicionar `effort: Option<String>`.
- `ai_configure`:
  - aceitar `"codex"` no match de provider.
  - Para `codex`: **não exigir api_key**; default model `"gpt-5.5"`, default effort
    `"medium"`. Para os outros, comportamento atual.
  - persistir effort; `configure()` com `AIConfig { effort }`.
- `AIConfigResponse`: adicionar `effort: Option<String>`.
- `ai_get_config`: retornar effort.
- Novo command `ai_codex_status() -> CodexStatus { available: bool, account_id:
  Option<String>, error: Option<String> }` para o card de detecção da UI.

#### `src-tauri/src/lib.rs`
- Restore no `setup`: mapear `"codex"` → `AIProvider::Codex`; passar `effort` para
  `AIConfig`.
- Registrar `commands::ai_codex_status` no `invoke_handler`.

### Frontend (TS/React)

#### `src/lib/models.ts`
- `CODEX_MODELS: ModelOption[]` = gpt-5.5 (default), gpt-5.4, gpt-5.4-mini,
  gpt-5.3-codex, gpt-5.2 (com descriptions do picker do Codex).
- `DEFAULT_CODEX_MODEL = "gpt-5.5"`.
- `EFFORT_OPTIONS = ["low","medium","high"]`, `DEFAULT_EFFORT = "medium"`.

#### `src/lib/tauri.ts`
- `AIConfigInput`: `+ effort?: string`.
- `AIConfigResponse`: `+ effort?: string`.
- `export const aiCodexStatus = () => invoke<CodexStatus>("ai_codex_status")`
  e `interface CodexStatus { available; account_id?; error? }`.

#### `src/views/AISettingsView.tsx`
- `type AIProvider` += `"codex"`; grid de provider vira 4 (ou card dedicado).
- Ao selecionar `codex`: chamar `aiCodexStatus()`, **esconder campo API key**,
  mostrar "Conta ChatGPT detectada: <account_id>" ou erro acionável.
- Trocar dropdown de modelo para `CODEX_MODELS` + adicionar seletor de effort.
- Relaxar o guard `!apiKey.trim()` quando `provider === "codex"` (botão Save
  habilitado mesmo sem key); enviar `api_key: ""` e `effort`.
- `handleSave`/restore: tratar provider `codex` (model+effort), label do provider.

---

## Plano de verificação

1. `cargo build` (src-tauri) sem erros de tipos.
2. Configurar provider Codex na UI → `ai_codex_status` mostra a conta.
3. `ai_nl_to_sql` retorna SQL válido (effort medium, gpt-5.5).
4. Autocomplete (`ai_complete`) responde rápido (gpt-5.4-mini, effort none).
5. Forçar `exp` perto do vencimento → confirmar refresh + write-back atômico em
   `auth.json` (token e `last_refresh` atualizados, arquivo íntegro).
6. Renomear `auth.json` → erro acionável claro (sem panic).

## Riscos / notas

- pgstudio e o Codex CLI rotacionam o **mesmo** `refresh_token`; rename atômico
  torna cada escrita segura, mas refresh simultâneo é last-writer-wins (aceitável).
- Modelos disponíveis dependem do tier da conta ChatGPT; lista pode mudar.
- Sem tool-calling (chamadas single-shot), diferente do `emit_reply` do legacy.
