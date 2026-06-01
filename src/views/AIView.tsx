import { useState, useRef, useEffect } from "react";
import { useIsConnected, useActiveSchemaContext } from "@/stores/connection-store";
import { aiChat, aiStatus } from "@/lib/tauri";
import { Bot, Send, User } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIView() {
  const isConnected = useIsConnected();
  const schemaContext = useActiveSchemaContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [configured, setConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiStatus().then(setConfigured).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !schemaContext) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await aiChat(userMsg.content, schemaContext);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${e}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!configured) {
    return (
      <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px", color: "var(--color-text-muted)" }}>
        <div style={{ display: "flex", height: "64px", width: "64px", alignItems: "center", justifyContent: "center", borderRadius: "16px", backgroundColor: "rgba(62,207,142,0.1)" }}>
          <Bot size={32} style={{ color: "var(--color-accent)" }} />
        </div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>AI Chat</h2>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", maxWidth: "384px", lineHeight: 1.6 }}>
            Configure your API key in Settings to enable AI features.
          </p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to use AI Chat
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--color-border)", paddingLeft: "20px", paddingRight: "20px", paddingTop: "14px", paddingBottom: "14px" }}>
        <Bot size={16} style={{ color: "var(--color-accent)" }} />
        <h1 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>AI Chat</h1>
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
          Ask about your database, generate queries, get optimization tips
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", paddingLeft: "20px", paddingRight: "20px", paddingTop: "24px", paddingBottom: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", color: "var(--color-text-muted)" }}>
            <Bot size={24} style={{ color: "var(--color-accent)" }} />
            <p style={{ fontSize: "14px" }}>Ask me anything about your database</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxWidth: "448px", justifyContent: "center", marginTop: "4px" }}>
              {[
                "Show me the largest tables",
                "How many users signed up this month?",
                "Suggest indexes for slow queries",
                "Explain the relationships between tables",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  style={{ borderRadius: "9999px", border: "1px solid var(--color-border)", paddingLeft: "14px", paddingRight: "14px", paddingTop: "6px", paddingBottom: "6px", fontSize: "12px", color: "var(--color-text-secondary)", background: "transparent", cursor: "pointer" }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: msg.role === "user" ? "flex-end" : undefined,
            }}
          >
            {msg.role === "assistant" && (
              <div style={{ display: "flex", height: "32px", width: "32px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "rgba(62,207,142,0.1)" }}>
                <Bot size={14} style={{ color: "var(--color-accent)" }} />
              </div>
            )}
            <div
              style={{
                maxWidth: "75%",
                borderRadius: "12px",
                paddingLeft: "16px",
                paddingRight: "16px",
                paddingTop: "12px",
                paddingBottom: "12px",
                fontSize: "14px",
                lineHeight: 1.6,
                backgroundColor: msg.role === "user"
                  ? "rgba(62,207,142,0.1)"
                  : "var(--color-bg-secondary)",
                color: msg.role === "user"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              }}
            >
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                {msg.content}
              </pre>
            </div>
            {msg.role === "user" && (
              <div style={{ display: "flex", height: "32px", width: "32px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "var(--color-bg-tertiary)" }}>
                <User size={14} style={{ color: "var(--color-text-muted)" }} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ display: "flex", height: "32px", width: "32px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "rgba(62,207,142,0.1)" }}>
              <Bot size={14} style={{ color: "var(--color-accent)" }} />
            </div>
            <div style={{ borderRadius: "12px", backgroundColor: "var(--color-bg-secondary)", paddingLeft: "16px", paddingRight: "16px", paddingTop: "12px", paddingBottom: "12px", fontSize: "14px", color: "var(--color-text-muted)" }}>
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingLeft: "20px", paddingRight: "20px", paddingTop: "16px", paddingBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "12px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", paddingLeft: "16px", paddingRight: "16px", paddingTop: "12px", paddingBottom: "12px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your database..."
            style={{ flex: 1, background: "transparent", fontSize: "14px", color: "var(--color-text-primary)", outline: "none", border: "none" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              display: "flex",
              height: "32px",
              width: "32px",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              backgroundColor: "var(--color-accent)",
              color: "white",
              border: "none",
              cursor: isLoading || !input.trim() ? "default" : "pointer",
              opacity: isLoading || !input.trim() ? 0.5 : 1,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
