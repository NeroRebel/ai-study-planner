import { Link } from "react-router-dom";
import { ProfilePanel } from "../auth/ProfilePanel";
import { PageHeader } from "../components/common/PageHeader";

export function ProfilePage() {
  return <div className="product-page profile-page">
    <PageHeader eyebrow="YOUR IDENTITY" title="Profile" description="How you appear in your personal workspace."
      action={<Link className="button button-secondary" to="/settings">Workspace settings</Link>} />
    <ProfilePanel />
  </div>;
}
