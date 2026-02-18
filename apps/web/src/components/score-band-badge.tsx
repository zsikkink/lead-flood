import type { LeadScoreBand } from '@lead-flood/contracts';

import { cn } from '../lib/utils.js';

const BAND_STYLES: Record<LeadScoreBand, string> = {
  LOW: 'bg-red-500/15 text-red-400',
  MEDIUM: 'bg-yellow-500/15 text-yellow-400',
  HIGH: 'bg-zbooni-green/15 text-zbooni-green',
};

export function ScoreBandBadge({ band }: { band: LeadScoreBand }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        BAND_STYLES[band],
      )}
    >
      {band}
    </span>
  );
}
