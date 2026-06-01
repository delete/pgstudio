import { useState } from "react";
import { useAIStore } from "@/stores/ai-store";
import { aiConfigure } from "@/lib/tauri";
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  GEMINI_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from "@/lib/models";
import { Bot, Sparkles, ArrowRight, ChevronDown } from "lucide-react";

type AIProvider = "anthropic" | "openai" | "google";

export function OnboardingView() {
  const { setConfigured, setOnboardingDone } = useAIStore();
  const [step, setStep] = useState<"welcome" | "provider">("welcome");
  const [provider, setProvider] = useState<AIProvider>("anthropic");
  const [model, setModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const models = provider === "anthropic"
    ? ANTHROPIC_MODELS
    : provider === "openai"
      ? OPENAI_MODELS
      : GEMINI_MODELS;

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
    try {
      await aiConfigure({
        provider,
        api_key: apiKey,
        model: finalModel || undefined,
      });
      setConfigured(true);
      setOnboardingDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setOnboardingDone(true);
  };

  if (step === "welcome") {
    return (
      <div
        style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 32px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "40px", textAlign: "center", maxWidth: "480px" }}>
          {/* Logo */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", height: "80px", width: "80px", alignItems: "center", justifyContent: "center", borderRadius: "16px", backgroundColor: "rgba(62,207,142,0.1)" }}>
              <Bot size={40} style={{ color: "var(--color-accent)" }} />
            </div>
            <div style={{ position: "absolute", right: "-4px", top: "-4px", display: "flex", height: "28px", width: "28px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "var(--color-accent)" }}>
              <Sparkles size={14} style={{ color: "white" }} />
            </div>
          </div>

          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "12px" }}>
              Welcome to PgStudio
            </h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: "400px" }}>
              An AI-native PostgreSQL client. Write queries with natural language,
              get smart autocomplete, and let AI help you understand and optimize
              your database.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "280px" }}>
            <button
              onClick={() => setStep("provider")}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "12px", backgroundColor: "var(--color-accent)", fontSize: "14px", fontWeight: 500, color: "white", transition: "background-color 0.15s ease", padding: "14px 20px", border: "none", cursor: "pointer" }}
            >
              Set up AI Provider
              <ArrowRight size={16} />
            </button>
            <button
              onClick={handleSkip}
              style={{ padding: "8px", fontSize: "14px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              backgroundColor: "rgba(62,207,142,0.1)",
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Bot size={24} style={{ color: "var(--color-accent)" }} />
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "6px" }}>
            Configure AI Provider
          </h2>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            Power your SQL editor with AI autocomplete and chat
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg-secondary)",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          {/* Provider toggle */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Provider
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              <button
                onClick={() => handleProviderChange("anthropic")}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s",
                  borderWidth: "2px",
                  borderStyle: "solid",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  borderColor: provider === "anthropic" ? "var(--color-accent)" : "var(--color-border)",
                  backgroundColor: provider === "anthropic" ? "rgba(62,207,142,0.05)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: provider === "anthropic" ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                  Anthropic
                </span>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Claude</span>
              </button>
              <button
                onClick={() => handleProviderChange("openai")}
                style={{
                  borderWidth: "2px",
                  borderStyle: "solid",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  borderColor: provider === "openai" ? "var(--color-accent)" : "var(--color-border)",
                  backgroundColor: provider === "openai" ? "rgba(62,207,142,0.05)" : "transparent",
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: provider === "openai" ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                  OpenAI
                </span>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>GPT</span>
              </button>
              <button
                onClick={() => handleProviderChange("google")}
                style={{
                  borderWidth: "2px",
                  borderStyle: "solid",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  borderColor: provider === "google" ? "var(--color-accent)" : "var(--color-border)",
                  backgroundColor: provider === "google" ? "rgba(62,207,142,0.05)" : "transparent",
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: provider === "google" ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                  Google
                </span>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Gemini</span>
              </button>
            </div>
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Model
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={isCustomModel ? "__custom__" : model}
                onChange={(e) => handleModelSelect(e.target.value)}
                style={{
                  width: "100%",
                  appearance: "none",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-tertiary)",
                  padding: "10px 40px 10px 14px",
                  fontSize: "14px",
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                <option value="__custom__">Other (custom model)</option>
              </select>
              <ChevronDown
                size={14}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }}
              />
            </div>
            {isCustomModel && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter model ID (e.g. gemini-2.5-flash-lite)"
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-tertiary)",
                  padding: "10px 14px",
                  fontSize: "14px",
                  color: "var(--color-text-primary)",
                  outline: "none",
                  marginTop: "8px",
                }}
              />
            )}
          </div>

          {/* API Key */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === "anthropic"
                  ? "sk-ant-api03-..."
                  : provider === "openai"
                    ? "sk-proj-..."
                    : "AIza..."
              }
              style={{
                width: "100%",
                borderRadius: "12px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-tertiary)",
                padding: "10px 14px",
                fontSize: "14px",
                color: "var(--color-text-primary)",
                outline: "none",
              }}
            />
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "8px", lineHeight: 1.5 }}>
              Stored locally on your device. Never sent to our servers.
            </p>
          </div>

          {error && (
            <p style={{ fontSize: "12px", color: "var(--color-danger)", marginBottom: "16px" }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "4px" }}>
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              style={{
                flex: 1,
                borderRadius: "12px",
                backgroundColor: (!saving && apiKey.trim()) ? "var(--color-accent)" : "rgba(62,207,142,0.5)",
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "white",
                border: "none",
                cursor: (!saving && apiKey.trim()) ? "pointer" : "default",
              }}
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
            <button
              onClick={handleSkip}
              style={{
                borderRadius: "12px",
                padding: "12px 20px",
                fontSize: "14px",
                color: "var(--color-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
