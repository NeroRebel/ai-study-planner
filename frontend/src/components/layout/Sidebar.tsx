import { GraduationCap, ChevronRight } from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { navigation } from "./navigation";

export function Sidebar() {
  const { state } = useAppData();
  const profile = state.preferences;
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <GraduationCap size={26} aria-hidden="true" />
        <span>AI Study Planner</span>
      </Link>
      <nav aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              "nav-item " + (isActive ? "active" : "")
            }
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/settings" className="profile">
          <span className="avatar">
            {profile.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{profile.name}</strong>
            <small>{profile.program || "Student workspace"}</small>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
