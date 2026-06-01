import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Database,
  TerminalSquare,
  History,
  Star,
  Bot,
  Sparkles,
  Plug,
  ArrowLeftRight,
} from "lucide-react";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/tables", icon: Database, label: "Database" },
  { to: "/sql", icon: TerminalSquare, label: "SQL Editor" },
  { to: "/history", icon: History, label: "Query History" },
  { to: "/saved", icon: Star, label: "Saved Queries" },
  { to: "/migration", icon: ArrowLeftRight, label: "Migration" },
];

const bottomItems: NavItem[] = [
  { to: "/ai", icon: Bot, label: "AI Chat" },
  { to: "/ai-settings", icon: Sparkles, label: "AI Settings" },
  { to: "/settings", icon: Plug, label: "Connections" },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: expanded ? "200px" : "56px",
        transition: "width 0.2s ease",
        borderRight: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        paddingTop: "40px",
        paddingBottom: "12px",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" }}>
        {navItems.map((item) => (
          <SidebarItem key={item.to} {...item} expanded={expanded} />
        ))}
      </nav>

      <div
        style={{
          height: "1px",
          backgroundColor: "var(--color-border)",
          margin: "8px 12px",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" }}>
        {bottomItems.map((item) => (
          <SidebarItem key={item.to} {...item} expanded={expanded} />
        ))}
      </div>
    </aside>
  );
}

function SidebarItem({
  to,
  icon: Icon,
  label,
  expanded,
}: NavItem & { expanded: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      title={label}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: "12px",
        height: "40px",
        borderRadius: "8px",
        padding: "0 11px",
        textDecoration: "none",
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        transition: "background-color 0.15s ease",
        backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
        color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
      })}
    >
      <Icon size={18} style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: "13px",
          fontWeight: 500,
          opacity: expanded ? 1 : 0,
          transition: "opacity 0.2s ease",
          overflow: "hidden",
        }}
      >
        {label}
      </span>
    </NavLink>
  );
}
