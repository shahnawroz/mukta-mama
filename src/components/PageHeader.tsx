export default function PageHeader({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-h1">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {extra && <div className="page-actions">{extra}</div>}
    </div>
  );
}
