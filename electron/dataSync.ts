import fs from 'node:fs';
import type { AppConfig, DataSource, FileSource, ApiSource, StaticSource, LauncherItem, SourceFieldMapping, BannedItem } from '../src/types';
import { AppStore } from './store';
import { loadMagicGateXml } from './magicGateXml';
import { fetchMagicGateDeployItems, loadMagicGateDeployCache } from './magicGateDeployApi';
import { fetchGitHubRepos, getActiveGitHubToken } from './githubService';
import { faviconService } from './faviconService';
import { diagnosticsService } from './diagnosticsService';

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

async function readFileWithTimeout(filePath: string, timeoutMs: number = 12000): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Vypršel časový limit (${Math.round(timeoutMs / 1000)} s) při čtení souboru: ${filePath}`));
    }, timeoutMs);

    fs.promises
      .readFile(filePath)
      .then((buf) => {
        clearTimeout(timer);
        resolve(buf);
      })
      .catch((err: any) => {
        clearTimeout(timer);
        if (err?.code === 'ENOENT') {
          reject(new Error(`Soubor nebyl nalezen na cestě: ${filePath}`));
        } else {
          reject(err);
        }
      });
  });
}

export class DataSyncManager {
  private store: AppStore;
  private activeSyncPromise: Promise<LauncherItem[]> | null = null;
  private pendingResync: boolean = false;
  private pendingProgressCallbacks: Array<
    (progress: { total: number; current: number; percentage: number; sourceName?: string; isComplete: boolean }) => void
  > = [];

  constructor(store: AppStore) {
    this.store = store;
  }

  /**
   * Loads MagicGate instances from either local XML or remote MagicWare Deploy API
   */
  private async syncMagicGateItems(config: AppConfig): Promise<LauncherItem[]> {
    if (config.extensions?.magicgate === false) {
      return [];
    }

    const mg = config.magicgate;
    if (!mg) return [];

    if (mg.sourceMode === 'api') {
      try {
        const res = await fetchMagicGateDeployItems(mg);
        const latestCfg = this.store.getConfig();
        if (res.ok) {
          this.store.saveConfig({
            ...latestCfg,
            magicgate: {
              ...latestCfg.magicgate,
              apiAuthCookie: res.cookie || latestCfg.magicgate.apiAuthCookie,
              apiUserEmail: res.email || latestCfg.magicgate.apiUserEmail,
              apiUserRole: res.role || latestCfg.magicgate.apiUserRole,
              lastApiSyncAt: new Date().toISOString(),
              apiInstanceCount: res.items.length,
              apiLastError: undefined,
            },
          });
          return res.items;
        } else {
          this.store.saveConfig({
            ...latestCfg,
            magicgate: {
              ...latestCfg.magicgate,
              apiLastError: res.error,
            },
          });
          const cached = loadMagicGateDeployCache(mg.apiInfoFields);
          if (cached.length > 0) {
            diagnosticsService.logAction({
              type: 'sync',
              title: 'MagicGate (Deploy API): Použita offline cache',
              details: `Načteno ${cached.length} instancí z lokální cache (${res.error || 'server nedostupný'}).`,
              status: 'warn',
            });
          }
          return cached;
        }
      } catch (err: any) {
        console.error('[DataSync] Error loading MagicGate Deploy API:', err);
        diagnosticsService.recordCrash('Synchronizace MagicGate Deploy API', err);
        return loadMagicGateDeployCache(mg.apiInfoFields);
      }
    }

    // Default: XML mode
    if (mg.xmlPath && fs.existsSync(mg.xmlPath)) {
      try {
        const xmlItems = loadMagicGateXml(mg.xmlPath);
        diagnosticsService.logAction({
          type: 'sync',
          title: 'Synchronizace MagicGate (Lokální XML)',
          details: `Načteno ${xmlItems.length} instancí ze souboru ${mg.xmlPath}`,
          status: 'success',
        });
        return xmlItems;
      } catch (err: any) {
        console.error('[DataSync] Error loading MagicGate XML:', err);
        diagnosticsService.recordCrash('Načítání MagicGate XML souboru', err, { xmlPath: mg.xmlPath });
      }
    }
    return [];
  }

  /**
   * Synchronizes all enabled data sources (local JSON files and remote GET APIs)
   */
  public async syncAll(
    onProgress?: (progress: { total: number; current: number; percentage: number; sourceName?: string; isComplete: boolean }) => void
  ): Promise<LauncherItem[]> {
    if (onProgress) {
      this.pendingProgressCallbacks.push(onProgress);
    }

    if (this.activeSyncPromise) {
      this.pendingResync = true;
      return this.activeSyncPromise;
    }

    const runLoop = async (): Promise<LauncherItem[]> => {
      let lastResult: LauncherItem[] = [];
      do {
        this.pendingResync = false;
        lastResult = await this.executeSyncAll((progress) => {
          for (const cb of this.pendingProgressCallbacks) {
            try {
              cb(progress);
            } catch {}
          }
        });
      } while (this.pendingResync);
      return lastResult;
    };

    this.activeSyncPromise = runLoop().finally(() => {
      this.activeSyncPromise = null;
      this.pendingProgressCallbacks = [];
    });

    return this.activeSyncPromise;
  }

  private async executeSyncAll(
    onProgress?: (progress: { total: number; current: number; percentage: number; sourceName?: string; isComplete: boolean }) => void
  ): Promise<LauncherItem[]> {
    const config = this.store.getConfig();
    const sources = config.sources || [];
    const allItems: LauncherItem[] = [];
    const updatedSources = [...sources];

    const enabledSources = updatedSources.filter((s) => s.enabled);
    const totalCount = enabledSources.length;
    const hasMagicGateStep = config.extensions?.magicgate !== false && Boolean(config.magicgate);
    const activeGhToken = getActiveGitHubToken(config.github);
    const hasGitHubStep = config.extensions?.github !== false && Boolean(activeGhToken);
    const totalSteps = Math.max(1, totalCount + (hasMagicGateStep ? 1 : 0) + (hasGitHubStep ? 1 : 0));
    let completedSteps = 0;

    onProgress?.({
      total: totalSteps,
      current: 0,
      percentage: 0,
      isComplete: false,
    });

    try {
      for (let i = 0; i < updatedSources.length; i++) {
        const src = updatedSources[i];
        if (!src.enabled) continue;

        onProgress?.({
          total: totalSteps,
          current: completedSteps,
          percentage: Math.min(90, Math.round((completedSteps / totalSteps) * 90)),
          sourceName: src.name,
          isComplete: false,
        });

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
          const errMsg = err?.message || 'Chyba při stahování dat';
          updatedSources[i] = {
            ...src,
            error: errMsg,
          };
          diagnosticsService.logAction({
            type: 'sync',
            title: `Chyba synchronizace zdroje: ${src.name}`,
            details: errMsg,
            status: 'error',
          });
        }

        completedSteps++;
        onProgress?.({
          total: totalSteps,
          current: completedSteps,
          percentage: Math.min(92, Math.round((completedSteps / totalSteps) * 90)),
          sourceName: src.name,
          isComplete: false,
        });
      }

      // Load MagicGate items (XML or Deploy API) if configured and enabled
      if (hasMagicGateStep) {
        onProgress?.({
          total: totalSteps,
          current: completedSteps,
          percentage: Math.min(94, Math.round((completedSteps / totalSteps) * 92)),
          sourceName: 'MagicGate',
          isComplete: false,
        });
      }
      const mgItems = await this.syncMagicGateItems(config);
      allItems.push(...mgItems);
      if (hasMagicGateStep) {
        completedSteps++;
      }

      // Load GitHub repositories if configured and enabled
      let ghCount = 0;
      if (hasGitHubStep) {
        onProgress?.({
          total: totalSteps,
          current: completedSteps,
          percentage: Math.min(96, Math.round((completedSteps / totalSteps) * 95)),
          sourceName: 'GitHub',
          isComplete: false,
        });
        try {
          const ghItems = await fetchGitHubRepos(config.github);
          ghCount = ghItems.length;
          allItems.push(...ghItems);
          diagnosticsService.logAction({
            type: 'sync',
            title: 'Synchronizace GitHub repozitářů',
            details: `Načteno ${ghItems.length} repozitářů.`,
            status: 'success',
          });
          faviconService.fetchFaviconForUrl('https://github.com').catch(() => {});
        } catch (err: any) {
          console.error('[DataSync] Error loading GitHub repos:', err);
          diagnosticsService.logAction({
            type: 'sync',
            title: 'Chyba synchronizace GitHub repozitářů',
            details: err?.message || String(err),
            status: 'error',
          });
        }
        completedSteps++;
      }

      const nowIso = new Date().toISOString();
      const latestConfig = this.store.getConfig();

      // Merge updated source statistics by ID into latestConfig.sources so concurrent additions/edits/toggles are never overwritten
      const statsById = new Map(
        updatedSources.map((s) => [s.id, { lastSync: s.lastSync, itemCount: s.itemCount, error: s.error }])
      );
      const mergedSources = (latestConfig.sources || []).map((s) => {
        const st = statsById.get(s.id);
        return st ? { ...s, ...st } : s;
      });

      this.store.saveConfig({ ...latestConfig, sources: mergedSources, lastSyncTime: nowIso });

      // Filter out banned items before saving into local cache
      const filteredItems = allItems.filter((it) => !isItemBanned(it, latestConfig.banlist));
      this.store.saveItems(filteredItems);

      diagnosticsService.logAction({
        type: 'sync',
        title: totalCount > 0 ? 'Kompletní synchronizace dokončena' : 'Synchronizace dat dokončena',
        details: `Celkem položek: ${filteredItems.length} (${totalCount > 0 ? `Vlastní zdroje: ${totalCount}, ` : ''}MagicGate: ${mgItems.length}${ghCount > 0 ? `, GitHub: ${ghCount}` : ''})`,
        status: 'success',
      });

      return filteredItems;
    } finally {
      if (!this.pendingResync) {
        onProgress?.({
          total: totalSteps,
          current: totalSteps,
          percentage: 100,
          isComplete: true,
        });
      }
    }
  }

  /**
   * Parses a JSON buffer with BOM stripping, UTF-16LE / Windows-1250 fallback, trailing comma tolerance,
   * array unwrapping, and optional root sharedParams merging.
   */
  private parseItemsFromBuffer(buf: Buffer, sourceLabel: string): LauncherItem[] {
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
            throw new Error(`Neplatný formát JSON (${sourceLabel}): ${err?.message || err}`);
          }
        }
      }
    }

    // Unwrap array if root object has data, items, results, etc.
    let itemsArray: any[] | null = null;
    let rootSharedParams: Record<string, any> | null = null;

    if (Array.isArray(parsed)) {
      itemsArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (parsed.sharedParams && typeof parsed.sharedParams === 'object' && !Array.isArray(parsed.sharedParams)) {
        rootSharedParams = parsed.sharedParams;
      }
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
      throw new Error(`Zdroj (${sourceLabel}) neobsahuje pole JSON objektů [{ ... }]`);
    }

    if (rootSharedParams) {
      return itemsArray.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const merged: any = { ...item };
        for (const [k, v] of Object.entries(rootSharedParams!)) {
          if (v !== undefined && v !== '' && (merged[k] === undefined || merged[k] === '' || merged[k] === null)) {
            merged[k] = k === 'priority' ? Number(v) : v;
          }
        }
        return merged as LauncherItem;
      });
    }

    return itemsArray;
  }

  /**
   * Reads a local/network JSON file (or remote HTTP/HTTPS static JSON URL) with timeout, BOM stripping, UTF-16 fallback and array unwrapping
   */
  private async syncFileSource(src: FileSource): Promise<LauncherItem[]> {
    const targetPath = (src.path || '').trim();
    if (!targetPath) {
      throw new Error('Chybí cesta k JSON souboru');
    }

    // Support remote HTTP/HTTPS URLs entered into FileSource
    if (/^https?:\/\//i.test(targetPath)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(targetPath, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'IADonkey-Launcher/1.0',
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Vzdálený soubor vrátil HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuf = await response.arrayBuffer();
        return this.parseItemsFromBuffer(Buffer.from(arrayBuf), src.name || targetPath);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error(`Vypršel časový limit (15 s) při stahování souboru: ${targetPath}`);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    const buf = await readFileWithTimeout(targetPath, 12000);
    return this.parseItemsFromBuffer(buf, src.name || targetPath);
  }

  /**
   * Fetches data from remote API or remote static JSON URL, handling getToken auth if required
   */
  private async syncApiSource(src: ApiSource): Promise<LauncherItem[]> {
    const targetUrl = (src.url || '').trim();
    if (!targetUrl) {
      throw new Error('Chybí URL adresa API');
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'IADonkey-Launcher/1.0',
    };

    // Handle authentication
    if (src.authType === 'getToken') {
      const token = await this.obtainAuthToken(src);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API vrátilo kód ${response.status}: ${response.statusText}`);
      }

      const arrayBuf = await response.arrayBuffer();
      return this.parseItemsFromBuffer(Buffer.from(arrayBuf), src.name || targetUrl);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`Vypršel časový limit (20 s) při stahování z URL: ${targetUrl}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
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
      signal: AbortSignal.timeout(30000),
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
