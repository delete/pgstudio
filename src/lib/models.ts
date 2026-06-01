export interface ModelOption {
  value: string;
  label: string;
  description?: string;
}

export const ANTHROPIC_MODELS: ModelOption[] = [
  // Latest (4.6)
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most intelligent — agents & coding" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Best speed + intelligence balance" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fastest, near-frontier intelligence" },
  // Previous generation
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

export const OPENAI_MODELS: ModelOption[] = [
  // Frontier
  { value: "gpt-5.2", label: "GPT-5.2", description: "Best for coding & agentic tasks" },
  { value: "gpt-5-mini", label: "GPT-5 Mini", description: "Cost-efficient for defined tasks" },
  { value: "gpt-5-nano", label: "GPT-5 Nano", description: "Fastest, most economical" },
  { value: "gpt-4.1", label: "GPT-4.1", description: "Smartest non-reasoning model" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  // Reasoning
  { value: "o3", label: "o3", description: "Reasoning for complex tasks" },
  { value: "o4-mini", label: "o4 Mini", description: "Fast, cost-efficient reasoning" },
  { value: "o3-pro", label: "o3 Pro", description: "More compute, better reasoning" },
  { value: "o3-mini", label: "o3 Mini" },
  // Standard
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
];

export const GEMINI_MODELS: ModelOption[] = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Fastest and most cost-efficient" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Balanced speed and quality" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Best quality for complex tasks" },
];

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const DEFAULT_OPENAI_MODEL = "gpt-4.1";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
