import { useState, useEffect } from "react";
import { useAIStore } from "@/stores/ai-store";
import { aiConfigure, aiStatus, aiGetConfig } from "@/lib/tauri";
import type { AIConfigResponse } from "@/lib/tauri";
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  GEMINI_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from "@/lib/models";
import { Bot, CheckCircle2, ChevronDown, Pencil, Shield, Cpu, Key } from "lucide-react";

type AIProvider = "anthropic" | "openai" | "google";

export function AISettingsView() {
  const { configured, setConfigured } = useAIStore();
  const [provider, setProvider] = useState<AIProvider>("anthropic");
  const [model, setModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<AIConfigResponse | null>(null);

  const models = provider === "anthropic"
    ? ANTHROPIC_MODELS
    : provider === "openai"
      ? OPENAI_MODELS
      : GEMINI_MODELS;

  useEffect(() => {
    aiStatus().then(setConfigured).catch(() => {});
    aiGetConfig().then((config) => {
      if (!config) return;
      setCurrentConfig(config);
      const p = config.provider === "openai" ? "openai" : "anthropic";
      setProvider(p as "anthropic" | "openai");
      const knownModels = p === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
      if (knownModels.some((m) => m.value === config.model)) {
        setModel(config.model);
        setIsCustomModel(false);
      } else {
        setIsCustomModel(true);
        setCustomModel(config.model);
      }
    }).catch(() => {});
  }, [setConfigured]);

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setIsCustomModel(false);
    setCustomModel("");
    setModel(
      p === "anthropic"
        ? DEFAULT_ANTHROPIC_MODEL
        : p === "openai"
          ? DEFAULT_OPENAI_MODEL
          : DEFAULT_GEMINI_MODEL,
    );
    setSuccess(false);
  };

  const handleModelSelect = (value: string) => {
    if (value === "__custom__") {
      setIsCustomModel(true);
      setModel("");
    } else {
      setIsCustomModel(false);
      setCustomModel("");
      setModel(value);
    }
    setSuccess(false);
  };

  const handleSave = async () => {
    const finalModel = isCustomModel ? customModel : model;
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    if (isCustomModel && !customModel.trim()) {
      setError("Enter a model name");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await aiConfigure({
        provider,
        api_key: apiKey,
        model: finalModel || undefined,
      });
      setConfigured(true);
      setSuccess(true);
      setCurrentConfig({ provider, model: finalModel });
      setApiKey("");
      // Go back to summary after a brief delay
      setTimeout(() => { setEditing(false); setSuccess(false); }, 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const getModelLabel = (modelId: string) => {
    const all = [...ANTHROPIC_MODELS, ...OPENAI_MODELS];
    return all.find((m) => m.value === modelId)?.label || modelId;
  };

  const getProviderLabel = (p: string) => (p === "openai" ? "OpenAI" : "Anthropic");

  // ── Summary view when configured ──
  if (configured && currentConfig && !editing) {
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 32px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(62,207,142,0.15)",
            }}>
              <Bot size={24} style={{ color: "var(--color-accent)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                AI Configuration
              </h1>
              <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                Your AI provider is configured and ready to use.
              </p>
            </div>
            <span style={{
              display: "flex", alignItems: "center", gap: "6px",
              borderRadius: "999px", backgroundColor: "rgba(62,207,142,0.1)",
              padding: "6px 14px", fontSize: "12px", fontWeight: 500,
              color: "var(--color-accent)",
            }}>
              <CheckCircle2 size={12} />
              Active
            </span>
          </div>

          {/* Config summary card */}
          <div style={{
            border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)",
            borderRadius: "16px", overflow: "hidden",
          }}>
            {/* Provider row */}
            <div style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "18px 24px", borderBottom: "1px solid var(--color-border)",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(62,207,142,0.08)", flexShrink: 0,
              }}>
                <Shield size={16} style={{ color: "var(--color-accent)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                  Provider
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {getProviderLabel(currentConfig.provider)}
                </div>
              </div>
            </div>

            {/* Model row */}
            <div style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "18px 24px", borderBottom: "1px solid var(--color-border)",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(62,207,142,0.08)", flexShrink: 0,
              }}>
                <Cpu size={16} style={{ color: "var(--color-accent)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                  Model
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {getModelLabel(currentConfig.model)}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {currentConfig.model}
                </div>
              </div>
            </div>

            {/* API Key row */}
            <div style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "18px 24px",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(62,207,142,0.08)", flexShrink: 0,
              }}>
                <Key size={16} style={{ color: "var(--color-accent)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                  API Key
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", fontFamily: "monospace" }}>
                  ••••••••••••••••
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  Stored locally on your device
                </div>
              </div>
            </div>
          </div>

          {/* Edit button */}
          <button
            onClick={() => { setEditing(true); setApiKey(""); setSuccess(false); setError(""); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              width: "100%", marginTop: "16px", borderRadius: "12px",
              border: "1px solid var(--color-border)", backgroundColor: "transparent",
              padding: "12px 16px", fontSize: "13px", fontWeight: 500,
              color: "var(--color-text-secondary)", cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <Pencil size={13} />
            Update Configuration
          </button>
        </div>
      </div>
    );
  }

  // ── Edit / Initial setup form ──
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(62,207,142,0.15)",
          }}>
            <Bot size={24} style={{ color: "var(--color-accent)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {configured ? "Update AI Configuration" : "AI Configuration"}
            </h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              {configured
                ? "Update your provider, model, or API key"
                : "Configure your AI provider for autocomplete, chat, and query assistance"}
            </p>
          </div>
        </div>

        {/* Config card */}
        <div style={{
          border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)",
          borderRadius: "16px", padding: "28px",
        }}>
          {/* Provider toggle */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Provider
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              {(["anthropic", "openai", "google"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                    borderWidth: "2px", borderStyle: "solid", borderRadius: "12px",
                    padding: "14px 16px",
                    borderColor: provider === p ? "var(--color-accent)" : "var(--color-border)",
                    backgroundColor: provider === p ? "rgba(62,207,142,0.05)" : "transparent",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: provider === p ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                    {p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "Google"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {p === "anthropic" ? "Claude models" : p === "openai" ? "GPT models" : "Gemini models"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Model
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={isCustomModel ? "__custom__" : model}
                onChange={(e) => handleModelSelect(e.target.value)}
                style={{
                  width: "100%", appearance: "none", borderRadius: "12px",
                  border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)",
                  padding: "10px 40px 10px 14px", fontSize: "14px",
                  color: "var(--color-text-primary)", outline: "none",
                }}
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
                <option value="__custom__">Other (custom model ID)</option>
              </select>
              <ChevronDown
                size={14}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }}
              />
            </div>
            {isCustomModel && (
              <input
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); setSuccess(false); }}
                placeholder="Enter model ID (e.g. gemini-2.5-flash-lite)"
                style={{
                  width: "100%", borderRadius: "12px", border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-tertiary)", padding: "10px 14px",
                  fontSize: "14px", color: "var(--color-text-primary)", outline: "none",
                  marginTop: "8px", boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* API Key */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSuccess(false); setError(""); }}
              placeholder={configured
                ? "Enter new API key to update"
                : provider === "anthropic"
                  ? "sk-ant-api03-..."
                  : provider === "openai"
                    ? "sk-proj-..."
                    : "AIza..."}
              style={{
                width: "100%", borderRadius: "12px", border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-tertiary)", padding: "10px 14px",
                fontSize: "14px", color: "var(--color-text-primary)", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "8px", lineHeight: 1.5 }}>
              Stored locally on your device. Only schema metadata is sent to the AI — never your actual data.
            </p>
          </div>

          {error && <p style={{ fontSize: "12px", color: "var(--color-danger)", marginBottom: "16px" }}>{error}</p>}

          {success && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", borderRadius: "12px",
              backgroundColor: "rgba(62,207,142,0.1)", padding: "12px 16px",
              fontSize: "12px", color: "var(--color-accent)", marginBottom: "16px",
            }}>
              <CheckCircle2 size={14} />
              AI provider configured successfully
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
            {configured && (
              <button
                onClick={() => { setEditing(false); setError(""); setSuccess(false); }}
                style={{
                  borderRadius: "12px", border: "1px solid var(--color-border)",
                  backgroundColor: "transparent", padding: "12px 20px",
                  fontSize: "14px", color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              style={{
                flex: 1, borderRadius: "12px",
                backgroundColor: (!saving && apiKey.trim()) ? "var(--color-accent)" : "rgba(62,207,142,0.5)",
                padding: "12px 16px", fontSize: "14px", fontWeight: 500,
                color: "white", border: "none",
                cursor: (!saving && apiKey.trim()) ? "pointer" : "default",
              }}
            >
              {saving ? "Saving..." : configured ? "Update Configuration" : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
