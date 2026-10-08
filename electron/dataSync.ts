import fs from 'node:fs';
import type { DataSource, FileSource, ApiSource, StaticSource, LauncherItem, SourceFieldMapping, BannedItem } from '../src/types';
import { AppStore } from './store';
import { loadMagicGateXml } from './magicGateXml';
import { fetchGitHubRepos, getActiveGitHubToken } from './githubService';
import { faviconService } from './faviconService';

function isItemBanned(item: LauncherItem, banlist?: BannedItem[]): boolean {
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

export class DataSyncManager {
  private store: AppStore;

  constructor(store: AppStore) {
    this.store = store;
  }

  /**
   * Synchronizes all enabled data sources (local JSON files and remote GET APIs)
   */
  public async syncAll(
    onProgress?: (progress: { total: number; current: number; percentage: number; sourceName?: string; isComplete: boolean }) => void
  ): Promise<LauncherItem[]> {
    const config = this.store.getConfig();
    const sources = config.sources;
    const allItems: LauncherItem[] = [];
    const updatedSources = [...sources];

    const enabledSources = updatedSources.filter((s) => s.enabled);
    const totalCount = enabledSources.length;

    if (totalCount === 0) {
      if (config.extensions?.magicgate !== false && config.magicgate?.xmlPath && fs.existsSync(config.magicgate.xmlPath)) {
        try {
          const mgItems = loadMagicGateXml(config.magicgate.xmlPath);
          allItems.push(...mgItems);
        } catch (err) {
          console.error('[DataSync] Error loading MagicGate XML:', err);
        }
      }

      const activeGhToken = getActiveGitHubToken(config.github);
      if (config.extensions?.github !== false && activeGhToken) {
        try {
          const ghItems = await fetchGitHubRepos(config.github);
          allItems.push(...ghItems);
          faviconService.fetchFaviconForUrl('https://github.com').catch(() => {});
        } catch (err) {
          console.error('[DataSync] Error loading GitHub repos:', err);
        }
      }

      onProgress?.({
        total: 0,
        current: 0,
        percentage: 100,
        isComplete: true,
      });
      const nowIso = new Date().toISOString();
      this.store.saveConfig({ ...config, sources: updatedSources, lastSyncTime: nowIso });
      const filteredItems = allItems.filter((it) => !isItemBanned(it, config.banlist));
      this.store.saveItems(filteredItems);
      return filteredItems;
    }

    onProgress?.({
      total: totalCount,
      current: 0,
      percentage: 0,
      isComplete: false,
    });

    let completedCount = 0;

    for (let i = 0; i < updatedSources.length; i++) {
      const src = updatedSources[i];
      if (!src.enabled) continue;

      try {
        let items: LauncherItem[] = [];
        if (src.type === 'file') {
          items = await this.syncFileSource(src as FileSource);
        } else if (src.type === 'api') {
          items = await this.syncApiSource(src as ApiSource);
        } else if (src.type === 'static') {
          items = this.syncStaticSource(src as StaticSource);
        }

        // Tag items with source reference and apply mapping if configured
        const normalized = items.map((it, idx) => this.normalizeItem(it, src.id, idx, src.mapping));
        allItems.push(...normalized);

        updatedSources[i] = {
          ...src,
          lastSync: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          itemCount: normalized.length,
          error: undefined,
        };
      } catch (err: any) {
        console.error(`[DataSync] Error syncing source "${src.name}":`, err);
        updatedSources[i] = {
          ...src,
          error: err?.message || 'Chyba při stahování dat',
        };
      }

      completedCount++;
      const percentage = Math.round((completedCount / totalCount) * 100);
      onProgress?.({
        total: totalCount,
        current: completedCount,
        percentage,
        sourceName: src.name,
        isComplete: completedCount === totalCount,
      });
    }

    // Load MagicGate XML items if configured and enabled
    if (config.extensions?.magicgate !== false && config.magicgate?.xmlPath && fs.existsSync(config.magicgate.xmlPath)) {
      try {
        const mgItems = loadMagicGateXml(config.magicgate.xmlPath);
        allItems.push(...mgItems);
      } catch (err) {
        console.error('[DataSync] Error loading MagicGate XML:', err);
      }
    }

    // Load GitHub repositories if configured and enabled
    const activeGhTokenEnd = getActiveGitHubToken(config.github);
    if (config.extensions?.github !== false && activeGhTokenEnd) {
      try {
        const ghItems = await fetchGitHubRepos(config.github);
        allItems.push(...ghItems);
        faviconService.fetchFaviconForUrl('https://github.com').catch(() => {});
      } catch (err) {
        console.error('[DataSync] Error loading GitHub repos:', err);
      }
    }

    const nowIso = new Date().toISOString();

    // Save updated source statistics and global sync timestamp into config
    this.store.saveConfig({ ...config, sources: updatedSources, lastSyncTime: nowIso });

    // Filter out banned items before saving into local cache
    const filteredItems = allItems.filter((it) => !isItemBanned(it, config.banlist));
    this.store.saveItems(filteredItems);

    return filteredItems;
  }

  /**
   * Reads a local JSON file with BOM stripping, UTF-16 fallback and array unwrapping
   */
  private async syncFileSource(src: FileSource): Promise<LauncherItem[]> {
    if (!src.path || !fs.existsSync(src.path)) {
      throw new Error(`Soubor nebyl nalezen na cestě: ${src.path}`);
    }

    const buf = await fs.promises.readFile(src.path);
    let raw = buf.toString('utf-8').replace(/^\uFEFF/, '').trim();

    // If UTF-8 produced replacement characters \uFFFD, try Windows-1250 / ANSI
    if (raw.includes('\uFFFD')) {
      try {
        const win1250 = new TextDecoder('windows-1250').decode(buf).replace(/^\uFEFF/, '').trim();
        if (!win1250.includes('\uFFFD')) {
          raw = win1250;
        }
      } catch {}
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      // 1. Try fallback reading as UTF-16LE
      try {
        parsed = JSON.parse(buf.toString('utf16le').replace(/^\uFEFF/, '').trim());
      } catch {
        // 2. Try Windows-1250 decoding
        try {
          const win1250 = new TextDecoder('windows-1250').decode(buf).replace(/^\uFEFF/, '').trim();
          parsed = JSON.parse(win1250);
        } catch {
          // 3. Try removing trailing commas
          try {
            const stripped = raw.replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(stripped);
          } catch {
            throw new Error(`Neplatný formát JSON souboru: ${err?.message || err}`);
          }
        }
      }
    }

    // Unwrap array if root object has data, items, results, etc.
    let itemsArray: any[] | null = null;
    if (Array.isArray(parsed)) {
      itemsArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.data)) itemsArray = parsed.data;
      else if (Array.isArray(parsed.items)) itemsArray = parsed.items;
      else if (Array.isArray(parsed.results)) itemsArray = parsed.results;
      else if (Array.isArray(parsed.records)) itemsArray = parsed.records;
      else if (Array.isArray(parsed.values)) itemsArray = parsed.values;
      else {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val)) {
            itemsArray = val;
            break;
          }
        }
      }
    }

    if (!itemsArray) {
      throw new Error('Soubor neobsahuje pole JSON objektů [{ ... }]');
    }

    return itemsArray;
  }

  /**
   * Fetches data from remote API, handling getToken auth if required
   */
  private async syncApiSource(src: ApiSource): Promise<LauncherItem[]> {
    if (!src.url) {
      throw new Error('Chybí URL adresa API');
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'IADonkey-Launcher/1.0',
    };

    // Handle authentication
    if (src.authType === 'getToken') {
      const token = await this.obtainAuthToken(src);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // Perform GET request
    const response = await fetch(src.url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`API vrátilo kód ${response.status}: ${response.statusText}`);
    }

    const parsed = await response.json();

    // Handle response if wrapped in data or directly an array
    let itemsArray: any[] | null = null;
    if (Array.isArray(parsed)) {
      itemsArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.data)) itemsArray = parsed.data;
      else if (Array.isArray(parsed.items)) itemsArray = parsed.items;
      else if (Array.isArray(parsed.results)) itemsArray = parsed.results;
      else if (Array.isArray(parsed.records)) itemsArray = parsed.records;
      else if (Array.isArray(parsed.values)) itemsArray = parsed.values;
      else {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val)) {
            itemsArray = val;
            break;
          }
        }
      }
    }

    if (!itemsArray) {
      throw new Error('API nevrátilo pole objektů [{ ... }]');
    }

    return itemsArray;
  }

  /**
   * Obtains auth token using POST request to tokenUrl
   */
  private async obtainAuthToken(src: ApiSource): Promise<string> {
    if (!src.tokenUrl) {
      throw new Error('Je vybrána metoda getToken, ale chybí Token URL');
    }

    let bodyPayload: any = {};
    if (src.tokenPayload) {
      try {
        bodyPayload = JSON.parse(src.tokenPayload);
      } catch {
        // use raw if not valid json
        bodyPayload = { payload: src.tokenPayload };
      }
    } else {
      bodyPayload = {
        username: src.tokenUsername || '',
        password: src.tokenPassword || '',
      };
    }

    const tokenRes = await fetch(src.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!tokenRes.ok) {
      throw new Error(`Získání tokenu selhalo (HTTP ${tokenRes.status})`);
    }

    const resJson = await tokenRes.json();

    // Extract token string from typical responses
    const token =
      resJson.token ||
      resJson.access_token ||
      resJson.accessToken ||
      resJson.data?.token ||
      resJson.data?.access_token ||
      (typeof resJson === 'string' ? resJson : null);

    if (!token || typeof token !== 'string') {
      throw new Error('V odpovědi token URL nebyl nalezen žádný token');
    }

    return token;
  }

  /**
   * Reads the first record of a source and returns available keys and a sample record for mapping
   */
  public async inspectSource(src: DataSource): Promise<{ keys: string[]; sample: Record<string, any> | null }> {
    let rawItems: any[] = [];
    if (src.type === 'file') {
      rawItems = await this.syncFileSource(src as FileSource);
    } else if (src.type === 'api') {
      rawItems = await this.syncApiSource(src as ApiSource);
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { keys: [], sample: null };
    }

    // Collect all unique keys from up to first 20 records
    const keySet = new Set<string>();
    let firstValidSample: Record<string, any> | null = null;

    for (const item of rawItems.slice(0, 20)) {
      if (item && typeof item === 'object') {
        if (!firstValidSample && Object.keys(item).length > 0) {
          firstValidSample = item;
        }
        for (const k of Object.keys(item)) {
          if (typeof item[k] !== 'function') {
            keySet.add(k);
          }
        }
      }
    }

    const keys = Array.from(keySet);
    const sample = firstValidSample || (rawItems[0] && typeof rawItems[0] === 'object' ? rawItems[0] : null);
    return { keys, sample };
  }

  /**
   * Ensures default values according to specifications (including recursive subitems under options),
   * applying custom field mapping if configured on the source.
   */
  private normalizeItem(
    raw: any,
    sourceId: string,
    index: number,
    mapping?: SourceFieldMapping,
    parentId?: string
  ): LauncherItem {
    const getValue = (field: keyof SourceFieldMapping, fallback: any) => {
      const rule = mapping?.[field];
      if (!rule) return raw[field] !== undefined ? raw[field] : fallback;
      if (rule.type === 'fixed') return rule.value;
      if (rule.type === 'field' && rule.value) {
        const val = raw[rule.value];
        return val !== undefined ? val : fallback;
      }
      return raw[field] !== undefined ? raw[field] : fallback;
    };

    const id = raw.id || `${sourceId}-${parentId ? `${parentId}-` : ''}${index}`;
    const effectiveSettings = getValue('settings', raw.settings !== undefined ? raw.settings : null);
    const subOptions = Array.isArray(raw.options)
      ? raw.options.map((opt: any, optIdx: number) =>
          this.normalizeItem(opt, sourceId, optIdx, mapping, id)
        )
      : undefined;

    const rawPriority = getValue('priority', raw.priority);
    const parsedPriority = typeof rawPriority === 'number' ? rawPriority : (Number(rawPriority) || 0);

    const rawAction = getValue('action', raw.action || 'open');
    const normalizedAction = rawAction === 'snippet' ? 'copy' : rawAction;

    const rawActions = Array.isArray(raw.actions)
      ? raw.actions
          .filter((act: any) => act && typeof act === 'object')
          .map((act: any) => ({
            name: String(act.name || 'Akce'),
            action: act.action || 'open',
            location: act.location !== undefined ? act.location : null,
            icon: act.icon || null,
            settings: act.settings || null,
          }))
      : undefined;

    const rawInfo =
      raw.info && typeof raw.info === 'object' && !Array.isArray(raw.info)
        ? raw.info
        : undefined;

    const rawWizard =
      raw.wizard && typeof raw.wizard === 'object' && Array.isArray(raw.wizard.steps)
        ? raw.wizard
        : undefined;

    return {
      id,
      name: String(getValue('name', raw.name || 'Položka bez názvu')),
      location: getValue('location', raw.location !== undefined ? raw.location : null),
      action: normalizedAction,
      icon: getValue('icon', raw.icon || 'code'),
      image: getValue('image', raw.image || null),
      priority: isNaN(parsedPriority) ? 0 : parsedPriority,
      settings: effectiveSettings === 'magicgate' ? 'magicgate' : effectiveSettings || null,
      sourceId,
      options: subOptions,
      actions: rawActions && rawActions.length > 0 ? rawActions : undefined,
      info: rawInfo && Object.keys(rawInfo).length > 0 ? rawInfo : undefined,
      wizard: rawWizard,
    };
  }

  /**
   * Processes a static data source, merging shared parameters into each item.
   */
  private syncStaticSource(src: StaticSource): LauncherItem[] {
    const rawItems = src.items || [];
    const shared = src.sharedParams || {};

    return rawItems.map((raw) => {
      const merged: any = { ...raw };
      for (const [k, v] of Object.entries(shared)) {
        if (v !== undefined && v !== '' && (merged[k] === undefined || merged[k] === '' || merged[k] === null)) {
          merged[k] = k === 'priority' ? Number(v) : v;
        }
      }
      return merged as LauncherItem;
    });
  }
}
