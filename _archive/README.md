# Archived Services

This folder contains deprecated external API services that are no longer in active use.

## AccelByteService.ts
Original purpose: Resolve user IDs via AccelByte API
Archived: 2026-02-03
Reason: External API failing, replaced with local relationship tracking

## EpicService.ts  
Original purpose: Authenticate and resolve Epic Games account IDs
Archived: 2026-02-03
Reason: External API failing, replaced with local relationship tracking

## How to Re-enable
If you need to restore these services:
1. Move files back to `/services/`
2. Update imports in `useLogMonitor.ts` and `IdMapper.tsx`
3. Re-add API config fields to `SettingsModal.tsx`
