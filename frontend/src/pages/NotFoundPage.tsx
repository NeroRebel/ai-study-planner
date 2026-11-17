import { Link } from "react-router-dom";
import { PageHeader } from "../components/common/PageHeader";
export function NotFoundPage() {
  return (
    <div className="product-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="This page is not in the plan"
        description="That address does not match a page in your workspace."
      />
      <Link className="button button-primary" to="/">
        Back to Dashboard
      </Link>
    </div>
  );
}
