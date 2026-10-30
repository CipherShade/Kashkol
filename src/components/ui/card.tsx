import type { ReactNode } from "react";

export function Card({
  children,
  className,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      className={["ui-card", className].filter(Boolean).join(" ")}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  titleId,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  titleId?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ui-card-header">
      <div>
        <h2 className="ui-card-title" id={titleId}>
          {title}
        </h2>
        {description ? <p className="ui-card-description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-card-actions">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["ui-card-body", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["ui-card-footer", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["ui-card-grid", className].filter(Boolean).join(" ")}>{children}</div>;
}
