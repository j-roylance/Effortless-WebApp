import type { ReactNode } from "react";

/** Standard page title row used across tab screens and forms. */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <h2 style={{ margin: 0, fontSize: "0.85rem" }}>{title}</h2>
      {action}
    </div>
  );
}
