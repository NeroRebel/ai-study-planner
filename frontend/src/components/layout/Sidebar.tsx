import { ProfileAvatar } from "../../auth/ProfilePanel";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { resolveReducedMotion, uiPreferences, useUiPreferences } from "../../state/uiPreferences";
import { NavLink, Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { navigation } from "./navigation";
import { BrandMark } from "../common/BrandMark";
import { useRef } from "react";

export function Sidebar() {
  const { state } = useAppData();
  const preferences = useUiPreferences();
  const collapsed = preferences.sidebarCollapsed;
  const identity = useRef<HTMLDivElement>(null);
  function setCollapsed(value: boolean) {
    uiPreferences.update({ sidebarCollapsed: value });
    requestAnimationFrame(() => identity.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }
  const systemReduced = useReducedMotion();
  const reduced = resolveReducedMotion(preferences.motion, !!systemReduced);
  const transition = { duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };
  const settings = navigation.find(item => item.to === "/settings")!;
  const label = (text: string) => <AnimatePresence initial={false}>{!collapsed && <motion.span key="copy" className="nav-copy"
    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.12 }}>{text}</motion.span>}</AnimatePresence>;
  const item = ({ to, label: text, icon: Icon }: typeof navigation[number]) => <NavLink key={to} to={to} end={to === "/"}
    aria-label={text} data-tooltip={collapsed ? text : undefined} className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
    <span className="nav-icon"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>{label(text)}
  </NavLink>;
  return <motion.aside id="workspace-sidebar" className={"sidebar " + (collapsed ? "sidebar-collapsed" : "")} aria-label="Workspace sidebar"
    initial={false} animate={{ width: collapsed ? 64 : "var(--sidebar-expanded-width)" }} transition={transition}>
    <div className="sidebar-identity" ref={identity}>
      {collapsed ? <motion.button type="button" className="rail-open-button" aria-label="Expand sidebar" title="Expand sidebar" aria-expanded={false}
        aria-controls="sidebar-navigation" whileTap={{ scale: 0.98 }} onClick={() => setCollapsed(false)}>
        <span className="rail-logo"><BrandMark /></span><PanelLeftOpen className="rail-open-icon" size={20} strokeWidth={1.7} aria-hidden="true" />
      </motion.button> : <>
        <Link to="/" className="brand" aria-label="AI Study Planner home"><BrandMark /><motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.15 }}>AI Study Planner</motion.span></Link>
        <motion.button type="button" className="sidebar-collapse icon-button" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded={true}
          aria-controls="sidebar-navigation" whileTap={{ scale: 0.98 }} onClick={() => setCollapsed(true)}>
          <PanelLeftClose size={18} strokeWidth={1.7} aria-hidden="true" />
        </motion.button>
      </>}
    </div>
    <nav id="sidebar-navigation" className="sidebar-navigation" aria-label="Main navigation">
      <div className="sidebar-primary">{navigation.filter(entry => entry.to !== "/settings").map(item)}</div>
      <div className="sidebar-assistant-group">
        {!collapsed && <span className="sidebar-section-label">Study support</span>}
        {item({ to: "/assistant", label: "AI Assistant", icon: Sparkles })}
      </div>
    </nav>
    <div className="sidebar-bottom">
      <nav className="sidebar-utilities" aria-label="Workspace settings">{item(settings)}</nav>
      <Link to="/profile" className="profile" aria-label="Open your profile" data-tooltip={collapsed ? "Profile & identity" : undefined}>
        <ProfileAvatar />
        {!collapsed && <motion.span className="profile-copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.15 }}><strong>{state.preferences.name}</strong><small>Profile & identity</small></motion.span>}
        {!collapsed && <ChevronRight size={14} strokeWidth={1.7} aria-hidden="true" />}
      </Link>
    </div>
  </motion.aside>;
}
