import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ title, pathname, detail }: { title: string; pathname: string; detail?: string }) {
  return <nav className="breadcrumb" aria-label="Breadcrumb"><ol>
    <li>{pathname === "/" && !detail ? <span aria-current="page">My workspace</span> : <Link to="/">My workspace</Link>}</li>
    {pathname !== "/" && <li><ChevronRight size={12} aria-hidden="true" />{detail ? <Link to={pathname}>{title}</Link> : <span aria-current="page">{title}</span>}</li>}
    {detail && <li><ChevronRight size={12} aria-hidden="true" /><span aria-current="page">{detail}</span></li>}
  </ol></nav>;
}
