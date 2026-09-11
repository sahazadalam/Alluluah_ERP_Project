interface BadgeProps {
  label: string;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'orange' | 'cyan' | 'purple';
}

const colorMap = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  gray: 'bg-slate-100 text-slate-600',
  orange: 'bg-orange-100 text-orange-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  purple: 'bg-violet-100 text-violet-700',
};

export default function Badge({ label, color = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}

export const statusBadge = (status: string) => {
  const map: Record<string, { label: string; color: BadgeProps['color'] }> = {
    draft: { label: 'Draft', color: 'gray' },
    sent: { label: 'Sent', color: 'blue' },
    accepted: { label: 'Accepted', color: 'green' },
    rejected: { label: 'Rejected', color: 'red' },
    expired: { label: 'Expired', color: 'orange' },
    paid: { label: 'Paid', color: 'green' },
    partial: { label: 'Partial', color: 'yellow' },
    overdue: { label: 'Overdue', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'red' },
    active: { label: 'Active', color: 'green' },
    inactive: { label: 'Inactive', color: 'gray' },
    terminated: { label: 'Terminated', color: 'red' },
    on_leave: { label: 'On Leave', color: 'yellow' },
    posted: { label: 'Posted', color: 'green' },
    reversed: { label: 'Reversed', color: 'red' },
    open: { label: 'Open', color: 'green' },
    closed: { label: 'Closed', color: 'gray' },
    completed: { label: 'Completed', color: 'green' },
    voided: { label: 'Voided', color: 'red' },
    refunded: { label: 'Refunded', color: 'orange' },
  };
  const config = map[status] ?? { label: status, color: 'gray' as const };
  return <Badge label={config.label} color={config.color} />;
};
