import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "positive" | "negative" | "warning" | "neutral" | "paid";
  className?: string;
}

const variants = {
  default:  "bg-[#1e2433] text-[#94a3b8]",
  positive: "bg-[color-mix(in_srgb,#00d4aa_15%,transparent)] text-[#00d4aa]",
  negative: "bg-[color-mix(in_srgb,#f43f5e_15%,transparent)] text-[#f43f5e]",
  warning:  "bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] text-[#f59e0b]",
  neutral:  "bg-[#1e2433] text-[#64748b]",
  paid:     "bg-[color-mix(in_srgb,#8b5cf6_20%,transparent)] text-[#8b5cf6]",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
