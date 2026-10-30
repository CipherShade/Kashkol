import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-main">
        {eyebrow ? <p className="ui-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="ui-page-title">{title}</h1>
        {description ? <p className="ui-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-actions">{actions}</div> : null}
    </header>
  );
}
