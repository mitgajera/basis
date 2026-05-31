import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { href: string; label: string } | { onClick: () => void; label: string };
  tone?: "neutral" | "negative";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 gap-3 ${className}`}>
      <div className="empty-state-icon" data-tone={tone}>
        {icon ?? <PulseDots />}
      </div>
      <p
        className={`text-[13px] font-medium ${
          tone === "negative" ? "text-negative" : "text-text-secondary"
        }`}
      >
        {title}
      </p>
      {description && (
        <p className="text-[11.5px] text-text-disabled max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        "href" in action ? (
          <Link href={action.href} className="btn-ghost mt-2 h-8 px-3 inline-flex items-center text-[12px]">
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="btn-ghost mt-2 h-8 px-3 inline-flex items-center text-[12px]"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

function PulseDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-text-disabled live-dot"
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </span>
  );
}
