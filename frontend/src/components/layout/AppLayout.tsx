import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Sparkles, Menu, UserRound } from "lucide-react";
import { BrandMark } from "../common/BrandMark";
import { RiskNotice } from "../common/LiveRisk";
import { DataBoundary } from "../common/DataBoundary";
import { Sidebar } from "./Sidebar";
import { mobileNavigation, navigation } from "./navigation";
import { Modal } from "../common/Modal";
import { TaskDialog } from "../tasks/TaskDialog";
import { SessionDialog } from "../calendar/SessionDialog";
import { useAppData } from "../../hooks/useAppData";
import { Breadcrumbs } from "./Breadcrumbs";

export function AppLayout() {
  const { pathname } = useLocation();
  const { taskDialog, sessionDialog, pending, mutationError, clearMutationError, retry, status } = useAppData();
  const [more, setMore] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const title =
    navigation.find((item) => item.to === pathname)?.label ??
    (pathname === "/assistant" ? "Assistant" : pathname === "/profile" ? "Profile" : "Page not found");
  useEffect(() => {
    document.title = title + " · AI Study Planner";
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, title]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar />
      <div className={"app-body " + (pathname === "/" ? "is-dashboard" : "")}>
        <header className="topbar">
          <Link to="/" className="mobile-brand">
            <BrandMark size={23} />
            AI Study Planner
          </Link>
          <Breadcrumbs title={title} pathname={pathname} detail={taskDialog ? taskDialog === "new" ? "New task" : "Edit task" : sessionDialog ? sessionDialog.id === "new" ? "New study block" : "Study block" : undefined} />
          <div className="topbar-right">
            <span className="workspace-state">Personal workspace</span>
            <Link className="assistant-link" to="/assistant">
              <Sparkles size={16} />
              Assistant
            </Link>
            <button
              className="mobile-more icon-button"
              onClick={() => setMore(true)}
              aria-label="More pages"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} ref={mainRef}>
          {mutationError && <div className="data-notice form-error" role="alert">{mutationError}
            <button className="text-button" onClick={clearMutationError}>Dismiss</button></div>}
          {["/", "/tasks", "/subjects", "/deadlines"].includes(pathname) && <RiskNotice />}
          {pending && <div className="data-notice" role="status">Saving and refreshing your workspace…</div>}
          {/* Entrance only: never retain a departing account or route subtree. */}
          <motion.div key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {["/settings", "/profile"].includes(pathname) ? <Outlet /> : <DataBoundary><Outlet /></DataBoundary>}
          </motion.div>
          {status === "ready" && <div className="data-refresh"><button className="text-button" disabled={pending} onClick={retry}>Refresh data</button></div>}
        </main>
        <footer className="app-footer">
          <span>Make time for what matters.</span>
          <span>AI Study Planner · core data saved to server</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNavigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {more && (
        <Modal title="More pages" onClose={() => setMore(false)}>
          <nav className="more-navigation" aria-label="More navigation">
            <Link to="/profile" onClick={() => setMore(false)}><UserRound size={19} aria-hidden="true" />Profile</Link>
            {navigation
              .filter((item) => !["/", "/tasks", "/calendar"].includes(item.to))
              .map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} onClick={() => setMore(false)}>
                  <Icon size={19} />
                  {label}
                </Link>
              ))}
          </nav>
        </Modal>
      )}
      {status === "ready" && taskDialog && <TaskDialog key={taskDialog} id={taskDialog} />}
      {status === "ready" && sessionDialog && (
        <SessionDialog key={sessionDialog.id} request={sessionDialog} />
      )}
    </>
  );
}
