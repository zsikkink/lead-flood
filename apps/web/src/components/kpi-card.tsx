interface KpiCardProps {
  label: string;
  value: number;
  sublabel?: string | undefined;
}

export function KpiCard({ label, value, sublabel }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <p className="text-3xl font-extrabold tracking-tight">{value.toLocaleString()}</p>
        {sublabel ? (
          <span className="text-sm font-medium text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}
