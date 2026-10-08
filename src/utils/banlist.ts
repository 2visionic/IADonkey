import { LauncherItem, BannedItem } from '../types';

/**
 * Checks if a LauncherItem matches any entry in the user's banlist.
 */
export function isItemBanned(item: LauncherItem, banlist?: BannedItem[]): boolean {
  if (!banlist || banlist.length === 0) return false;
  return banlist.some((b) => {
    if (b.id && item.id && b.id === item.id) return true;
    if (b.location && item.location && b.location.trim().toLowerCase() === item.location.trim().toLowerCase()) return true;
    if (b.name && item.name && b.name.trim().toLowerCase() === item.name.trim().toLowerCase()) {
      if (!b.sourceId || b.sourceId === item.sourceId) return true;
    }
    return false;
  });
}
