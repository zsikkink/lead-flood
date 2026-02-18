import type { LeadStatus } from '@lead-flood/contracts';

import { cn } from '../lib/utils.js';

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  processing: 'bg-yellow-500/15 text-yellow-400',
  enriched: 'bg-purple-500/15 text-purple-400',
  failed: 'bg-red-500/15 text-red-400',
  messaged: 'bg-zbooni-green/15 text-zbooni-green',
  replied: 'bg-emerald-500/15 text-emerald-400',
  cold: 'bg-gray-500/15 text-gray-400',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
