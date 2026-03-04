import type { AppView } from '../store/slices/createUISlice';

export const TIPS_BY_VIEW: Record<AppView, string[]> = {
  recording: [
    'Press Ctrl+Enter in OCR review to apply corrections quickly.',
    'Use Smart Capture after opening Crew Hub or Tactical Map for better OCR context.',
    'If teammates are empty, keep your own row as "(you)" and add only confirmed allies.',
    'When rerunning OCR, compare screenshot references before applying roster changes.',
    'Set eliminator team from opponent cards to keep defeat analytics accurate.',
    'Use the session timer as ground truth and sync duration before final submit.',
    'Keep artifact source in reach modifiers so analytics can split draft behavior.',
    'If ship type looks wrong, fix it in OCR review before saving the match.',
  ],
  analytics: [
    'Start with era filters to avoid mixing baseline and expansion balance shifts.',
    'Use ship + perk filters together to find stable loadout win-rate trends.',
    'Check hazard cards with low sample sizes before drawing conclusions.',
    'Compare selected era against all-time to spot patch-driven movement.',
    'Review loadout breakdowns as separate rows, not merged weapon strings.',
    'Use date-range filters before exporting analytics snapshots to keep reports focused.',
    'When one metric spikes, verify placement and match-count context first.',
    'Patch history in an era is useful for explaining sudden performance changes.',
  ],
  'smart-captures': [
    'Queue filters first, then resolve matches in order to keep OCR flow predictable.',
    'Use Analyze for first-pass OCR and Re-analyze only after corrections or ROI changes.',
    'Clear All in Players resets OCR team assignments without deleting the match.',
    'Keep Loadout and Ship Weapons expanded when validating telemetry vs OCR output.',
    'Use Open Wizard from detail view when you need full submission controls.',
    'Check rerun phase and latest file status when OCR progress stalls.',
    'Apply OCR only after confirming team colors and ship types are mapped correctly.',
    'Use bulk rerun for selected captures, then review failures in the status panel.',
    'Screenshots with map and crew-hub pairs usually produce better merged OCR results.',
  ],
  players: [
    'Merge fuzzy aliases early so OCR corrections map to one canonical pilot name.',
    'Keep player notes short and structured for faster in-match lookup.',
    'Use favorites for frequent teammates to speed up roster confirmations.',
    'After renaming a pilot, verify ID mappings to avoid split history rows.',
    'Audit duplicate names monthly to keep analytics dimensions clean.',
    'If a player appears as unknown often, map IDs before the next session.',
  ],
  'id-mapper': [
    'Map unknown IDs before long sessions so telemetry stays structured.',
    'Prefer canonical names over nicknames to avoid fragmenting analytics.',
    'Use ID Mapper as a side-panel tab when prompted by unknown telemetry entities.',
    'Update stale mappings after major patches when entity pools change.',
  ],
  history: [
    'Use multi-select to rerun OCR in batches when artifact quality improves.',
    'Sort by newest while resolving OCR queues to prevent duplicate review work.',
    'Check hazards and ship assignments in detail view before exporting JSON.',
    'Merge duplicate matches only after comparing artifacts and timestamps.',
    'Use search for pilot or ship terms to quickly isolate regression clusters.',
    'Review unresolved OCR states first when cleaning old data.',
  ],
  'dev-ocr': [
    'Adjust ROI only after confirming source screenshot type and resolution.',
    'Tune thresholds with known samples before running broad OCR reruns.',
    'Use debug metadata to spot cloud/local merge conflicts quickly.',
    'If confidence drops after a tweak, roll back and isolate one variable at a time.',
    'Capture before/after OCR outputs when testing parser adjustments.',
  ],
};

export const getTipsForView = (view: AppView, includeDevTips = true): string[] => {
  if (view === 'dev-ocr' && !includeDevTips) return [];
  return TIPS_BY_VIEW[view] || [];
};
