import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
export function Panel({
  title,
  subtitle,
  link,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  link?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {link && (
          <Link
            className="icon-button"
            to={link}
            aria-label={"View " + title.toLowerCase()}
          >
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
