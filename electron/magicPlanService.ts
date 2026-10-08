import fs from 'node:fs';
import path from 'node:path';
import { net, BrowserWindow, app } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppStore } from './store';
import type { MagicPlanData, PlanTaskItem, MagicPlanSettings, PlanDayInfo, PlanPersonInfo, WorklogTimelineEntry } from '../src/types';
import { notificationService } from './notificationService';
import { diagnosticsService } from './diagnosticsService';

const execAsync = promisify(exec);

const USER_DATA_PATH = app?.getPath
  ? app.getPath('userData')
  : path.join(process.cwd(), '.user_data');

const CACHE_FILE = path.join(USER_DATA_PATH, 'magicplan_cache.json');

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeStr(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesPersonName(planNameOrClean: string, worklogName: string): boolean {
  if (!planNameOrClean || !worklogName) return false;
  const pNorm = normalizeStr(planNameOrClean);
  const wNorm = normalizeStr(worklogName);
  if (pNorm === wNorm || pNorm.includes(wNorm) || wNorm.includes(pNorm)) return true;
  const pTokens = pNorm.split(/\s+/).filter(Boolean).sort().join(' ');
  const wTokens = wNorm.split(/\s+/).filter(Boolean).sort().join(' ');
  return pTokens === wTokens;
}

function formatTimeHHMM(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculateTimeStart(timeEnd: string, hours: number): string {
  if (!timeEnd) return '';
  const parts = timeEnd.split(':');
  if (parts.length < 2) return timeEnd;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const endMinutes = h * 60 + m;
  const durationMinutes = Math.round(hours * 60);
  const startMinutes = (endMinutes - durationMinutes + 24 * 60) % (24 * 60);
  const startH = Math.floor(startMinutes / 60);
  const startM = startMinutes % 60;
  return `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
}

export function isTaskForUser(
  task: PlanTaskItem,
  targetUser?: string,
  availablePersons?: PlanPersonInfo[]
): boolean {
  if (!targetUser) return true;
  if (!task) return false;

  const tNorm = task.userName ? task.userName.trim().toLowerCase() : '';
  const taskUserId = task.userId ? String(task.userId).trim().toLowerCase() : '';
  const uNorm = targetUser.trim().toLowerCase();

  // 1. Direct match on userId if present
  if (taskUserId && taskUserId === uNorm) {
    return true;
  }

  // 2. Direct match on name string
  if (tNorm && (tNorm === uNorm || tNorm.includes(uNorm) || uNorm.includes(tNorm))) {
    return true;
  }

  // 3. Resolve targetUser or task via availablePersons
  if (availablePersons && availablePersons.length > 0) {
    const targetPerson = availablePersons.find(
      (p) =>
        String(p.id).trim().toLowerCase() === uNorm ||
        (p.name && p.name.trim().toLowerCase() === uNorm) ||
        (p.cleanName && p.cleanName.trim().toLowerCase() === uNorm) ||
        (p.shortcut && p.shortcut.trim().toLowerCase() === uNorm)
    );

    if (targetPerson) {
      const pIdNorm = String(targetPerson.id).trim().toLowerCase();
      const pNameNorm = (targetPerson.name || '').trim().toLowerCase();
      const pCleanNorm = (targetPerson.cleanName || '').trim().toLowerCase();
      const pScNorm = (targetPerson.shortcut || '').trim().toLowerCase();

      if (taskUserId && taskUserId === pIdNorm) return true;
      if (tNorm) {
        if (pNameNorm && (tNorm === pNameNorm || tNorm.includes(pNameNorm) || pNameNorm.includes(tNorm))) return true;
        if (pCleanNorm && (tNorm === pCleanNorm || tNorm.includes(pCleanNorm) || pCleanNorm.includes(tNorm))) return true;
        if (pScNorm && tNorm.includes(`(${pScNorm})`)) return true;
      }
    }
  }

  return false;
}

interface WorklogParsedItem {
  date?: string;
  userName?: string;
  reqId: string;
  taskId: string;
  parentTaskId?: string;
  title: string;
  project: string;
  isService: boolean;
  isDev: boolean;
  hours: number;
  timeEnd?: string;
  timeStart?: string;
  description?: string;
}

export interface MagicPlanQueryLog {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'offline';
  url: string;
  durationMs: number;
  htmlLength: number;
  myTasksCount: number;
  unassignedTasksCount: number;
  totalHours: number;
  newTasks: string[];
  completedTasks: string[];
  changedTasks: string[];
  error?: string;
  myTasks: PlanTaskItem[];
  unassignedTasks: PlanTaskItem[];
}

/**
 * Returns a stable unique business fingerprint for a plan task, independent of transient DOM IDs
 */
export function getTaskFingerprint(task: PlanTaskItem): string {
  const userPrefix = task.userName ? `${task.userName.trim().toLowerCase()}::` : (task.userId ? `${task.userId.trim().toLowerCase()}::` : '');
  if (task.isNotAvailable) {
    return `${userPrefix}NOTAVAILABLE::${task.dates?.[0] || task.taskId}`;
  }
  const codes: string[] = [];
  if (task.requirementId && task.requirementId !== 'R0') codes.push(task.requirementId.toUpperCase().trim());
  if (task.taskIdentifier) codes.push(task.taskIdentifier.toUpperCase().trim());
  if (codes.length > 0) {
    return `${userPrefix}${codes.sort().join('::')}`;
  }
  const normTitle = normalizeStr(task.customName || task.title || '');
  const normProject = normalizeStr(task.project || '');
  if (normTitle) {
    return `${userPrefix}TITLE::${normProject}::${normTitle}`;
  }
  return `${userPrefix}RAW::${task.taskId}`;
}

/**
 * Universal business key identifying the task entity across columns and assignees
 */
export function getTaskBusinessKey(task: PlanTaskItem): string {
  if (task.isNotAvailable) {
    return `NOTAVAILABLE::${task.dates?.[0] || task.taskId}`;
  }
  const codes: string[] = [];
  if (task.requirementId && task.requirementId !== 'R0') codes.push(task.requirementId.toUpperCase().trim());
  if (task.taskIdentifier) codes.push(task.taskIdentifier.toUpperCase().trim());
  if (codes.length > 0) {
    return codes.sort().join('::');
  }
  const normTitle = normalizeStr(task.customName || task.title || '');
  const normProject = normalizeStr(task.project || '');
  if (normTitle) {
    return `TITLE::${normProject}::${normTitle}`;
  }
  return `RAW::${task.taskId}`;
}

export interface TrackedTaskSnapshot {
  key: string;
  location: 'queue' | 'me' | 'other';
  userName: string;
  task: PlanTaskItem;
  isSolved: boolean;
  isCritical: boolean;
  totalHours: number;
}

export class MagicPlanService {
  private store: AppStore;
  private timer: NodeJS.Timeout | null = null;
  private cachedData: MagicPlanData | null = null;
  private previousMyTasks: Map<string, PlanTaskItem> = new Map();
  private previousUnassignedTasks: Map<string, PlanTaskItem> = new Map();
  private previousSnapshot: Map<string, TrackedTaskSnapshot> = new Map();
  private queryHistory: MagicPlanQueryLog[] = [];
  private isFetching = false;
  private currentUserConfigKey: string = '';
  private knownPersonsMap: Map<string, PlanPersonInfo> = new Map();

  constructor(store: AppStore) {
    this.store = store;
    const cfg = this.store.getConfig().magicplan;
    this.currentUserConfigKey = JSON.stringify({
      urls: cfg?.urls || (cfg?.url ? [cfg.url] : []),
      users: cfg?.userColumns || (cfg?.userColumn ? [cfg.userColumn] : []),
    });
    const { myTasks: loadedMyTasks, unassignedTasks: loadedUnassigned, availablePersons: loadedPersons } = this.loadDiskCache();
    this.previousMyTasks = loadedMyTasks;
    this.previousUnassignedTasks = loadedUnassigned;

    const uCols = (cfg?.userColumns && cfg.userColumns.length > 0)
      ? cfg.userColumns.map((u: string) => u.trim()).filter(Boolean)
      : (cfg?.userColumn?.trim() ? [cfg.userColumn.trim()] : []);
    const curU = (cfg?.currentUserColumn?.trim() || uCols[0] || '').toLowerCase();
    const qName = cfg?.unassignedColumn?.trim() || 'FK';

    for (const t of loadedMyTasks.values()) {
      const key = getTaskBusinessKey(t);
      const isMe = isTaskForUser(t, curU, loadedPersons) || (!t.userName && !t.userId && uCols.length <= 1);
      this.previousSnapshot.set(key, {
        key,
        location: isMe ? 'me' : 'other',
        userName: t.userName?.trim() || (isMe ? 'Já' : 'Kolega'),
        task: t,
        isSolved: Boolean(t.isSolved || t.isCompleted),
        isCritical: Boolean(t.isCritical),
        totalHours: t.totalHours || 0,
      });
    }

    for (const t of loadedUnassigned.values()) {
      const key = getTaskBusinessKey(t);
      this.previousSnapshot.set(key, {
        key,
        location: 'queue',
        userName: qName,
        task: t,
        isSolved: Boolean(t.isSolved || t.isCompleted),
        isCritical: Boolean(t.isCritical),
        totalHours: t.totalHours || 0,
      });
    }

    if (this.previousMyTasks.size > 0 || this.previousUnassignedTasks.size > 0 || loadedPersons.length > 0) {
      const myTasks = Array.from(this.previousMyTasks.values());
      const unassignedTasks = Array.from(this.previousUnassignedTasks.values());
      const totalMyHours = myTasks.reduce((sum, t) => sum + (t.totalHours || 0), 0);
      this.cachedData = {
        lastChecked: new Date().toLocaleTimeString('cs-CZ'),
        myTasks,
        unassignedTasks,
        totalMyHours,
        availablePersons: loadedPersons,
      };
    }
  }

  private recordQueryLog(entry: MagicPlanQueryLog): void {
    this.queryHistory.unshift(entry);
    if (this.queryHistory.length > 10) {
      this.queryHistory.pop();
    }
  }

  public getDevLogs(): {
    cachedData: MagicPlanData | null;
    diskCache: { lastUpdated: string; tasks: Record<string, any> };
    history: MagicPlanQueryLog[];
  } {
    let diskCacheData: any = { lastUpdated: '', tasks: {} };
    try {
      if (fs.existsSync(CACHE_FILE)) {
        diskCacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
    } catch (err) {
      console.warn('[MagicPlan] Chyba čtení souboru diskové mezipaměti:', err);
    }

    return {
      cachedData: this.cachedData,
      diskCache: diskCacheData,
      history: [...this.queryHistory],
    };
  }

  private loadDiskCache(): {
    myTasks: Map<string, PlanTaskItem>;
    unassignedTasks: Map<string, PlanTaskItem>;
    availablePersons: PlanPersonInfo[];
  } {
    const myTasks = new Map<string, PlanTaskItem>();
    const unassignedTasks = new Map<string, PlanTaskItem>();
    const availablePersons: PlanPersonInfo[] = [];
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.tasks && typeof parsed.tasks === 'object') {
          for (const [key, t] of Object.entries(parsed.tasks)) {
            const task = t as PlanTaskItem;
            const fp = getTaskFingerprint(task) || key;
            myTasks.set(fp, task);
          }
        }
        if (parsed?.unassignedTasks && typeof parsed.unassignedTasks === 'object') {
          for (const [key, t] of Object.entries(parsed.unassignedTasks)) {
            const task = t as PlanTaskItem;
            const fp = getTaskFingerprint(task) || key;
            unassignedTasks.set(fp, task);
          }
        }
        if (Array.isArray(parsed?.availablePersons)) {
          for (const p of parsed.availablePersons) {
            if (p && p.id) {
              availablePersons.push(p);
              this.knownPersonsMap.set(String(p.id).trim(), p);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[MagicPlan] Chyba načítání diskové mezipaměti:', err);
    }
    return { myTasks, unassignedTasks, availablePersons };
  }

  private saveDiskCache(
    tasks: PlanTaskItem[],
    unassignedTasks: PlanTaskItem[] = [],
    availablePersons: PlanPersonInfo[] = []
  ): void {
    try {
      const serializeTask = (t: PlanTaskItem) => ({
        taskId: t.taskId,
        userId: t.userId,
        requirementId: t.requirementId,
        taskIdentifier: t.taskIdentifier,
        title: t.title,
        customName: t.customName,
        totalHours: t.totalHours,
        project: t.project,
        taskType: t.taskType,
        dates: t.dates,
        author: t.author,
        isCompleted: t.isCompleted,
        isSolved: t.isSolved,
        isGodday: t.isGodday,
        userName: t.userName,
        url: t.url,
        isNotAvailable: t.isNotAvailable,
        isCritical: t.isCritical,
      });

      const tasksObj: Record<string, any> = {};
      for (const t of tasks) {
        const fp = getTaskFingerprint(t);
        tasksObj[fp] = serializeTask(t);
      }

      const unassignedObj: Record<string, any> = {};
      for (const t of unassignedTasks) {
        const fp = getTaskFingerprint(t);
        unassignedObj[fp] = serializeTask(t);
      }

      const personsToSave = availablePersons.length > 0
        ? availablePersons
        : (this.cachedData?.availablePersons && this.cachedData.availablePersons.length > 0
            ? this.cachedData.availablePersons
            : Array.from(this.knownPersonsMap.values()));

      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify(
          {
            lastUpdated: new Date().toISOString(),
            tasks: tasksObj,
            unassignedTasks: unassignedObj,
            availablePersons: personsToSave,
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (err) {
      console.warn('[MagicPlan] Chyba ukládání diskové mezipaměti:', err);
    }
  }

  public clearData(): void {
    this.cachedData = null;
    this.previousMyTasks.clear();
    this.previousUnassignedTasks.clear();
    this.previousSnapshot.clear();
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
      }
    } catch (err) {
      console.warn('[MagicPlan] Chyba při mazání souboru mezipaměti:', err);
    }
    const emptyData: MagicPlanData = {
      lastChecked: new Date().toLocaleTimeString('cs-CZ'),
      myTasks: [],
      unassignedTasks: [],
      totalMyHours: 0,
      days: [],
    };
    this.cachedData = emptyData;
    this.broadcastData(emptyData);
  }

  public onUserColumnChanged(newUserColumn?: string, newUserColumns?: string[], newUrls?: string[]): void {
    const key = JSON.stringify({
      urls: (newUrls && newUrls.length > 0) ? newUrls : (newUserColumn ? [newUserColumn] : []),
      users: (newUserColumns && newUserColumns.length > 0) ? newUserColumns : (newUserColumn ? [newUserColumn] : []),
    });
    if (this.currentUserConfigKey !== key) {
      this.clearData();
      this.currentUserConfigKey = key;
      this.restart();
    }
  }

  public start(): void {
    this.stop();
    const config = this.store.getConfig();
    const isExtensionEnabled = config.extensions?.magicplan === true;
    const isPlanEnabled = config.magicplan?.enabled !== false;
    const urls = (config.magicplan?.urls && config.magicplan.urls.length > 0)
      ? config.magicplan.urls.map((u) => u.trim()).filter(Boolean)
      : (config.magicplan?.url?.trim() ? [config.magicplan.url.trim()] : []);
    const userColumns = (config.magicplan?.userColumns && config.magicplan.userColumns.length > 0)
      ? config.magicplan.userColumns.map((u) => u.trim()).filter(Boolean)
      : (config.magicplan?.userColumn?.trim() ? [config.magicplan.userColumn.trim()] : []);

    const worklogUrl = config.magicplan?.worklogUrl ?? 'http://mlog/Logs.aspx';
    const currentKey = JSON.stringify({ urls, users: userColumns, worklogUrl });
    // If user configuration changed from what was previously stored, clear old user data
    if (this.currentUserConfigKey && this.currentUserConfigKey !== currentKey) {
      this.clearData();
    }
    this.currentUserConfigKey = currentKey;

    if (!isExtensionEnabled || !isPlanEnabled || urls.length === 0 || userColumns.length === 0) {
      return;
    }

    const intervalMinutes = Math.max(1, config.magicplan?.pollIntervalMinutes || 2);
    const intervalMs = intervalMinutes * 60 * 1000;

    // Run first check shortly after app startup
    setTimeout(() => {
      this.fetchAndDiff().catch((err) => {
        console.error('[MagicPlan] Initial fetch error:', err);
      });
    }, 2000);

    this.timer = setInterval(() => {
      this.fetchAndDiff().catch((err) => {
        console.error('[MagicPlan] Polling fetch error:', err);
      });
    }, intervalMs);

    console.log(`[MagicPlan] Služba aktivována (interval: ${intervalMinutes} min).`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public restart(): void {
    this.stop();
    this.start();
  }

  public getCachedData(): MagicPlanData | null {
    return this.cachedData;
  }

  public async manualRefresh(): Promise<MagicPlanData> {
    return this.fetchAndDiff();
  }

  /**
  /**
   * Builds direct link to task or requirement respecting TaskManager extension settings
   */
  private buildTaskUrl(
    requirementId?: string,
    taskIdentifier?: string,
    linkWithTaskManager: boolean = true,
    mlogBaseUrl?: string,
    mlogTaskPrefix: string = 'T',
    mlogRequestPrefix: string = 'R'
  ): string | undefined {
    if (!linkWithTaskManager) {
      return undefined;
    }
    const cleanBase = mlogBaseUrl?.trim().replace(/\/+$/, '');
    if (!cleanBase) {
      return undefined;
    }

    const tPref = (mlogTaskPrefix || 'T').trim();
    const rPref = (mlogRequestPrefix || 'R').trim();

    if (taskIdentifier) {
      const numOnly = taskIdentifier.replace(/\D/g, '');
      if (numOnly) {
        return `${cleanBase}/${tPref}${numOnly}`;
      }
    }
    if (requirementId) {
      const numOnly = requirementId.replace(/\D/g, '');
      if (numOnly) {
        return `${cleanBase}/${rPref}${numOnly}`;
      }
    }
    return undefined;
  }

  /**
   * Fetches plan HTML from server, parses tasks, checks differences and broadcasts updates
   */
  public async fetchAndDiff(): Promise<MagicPlanData> {
    if (this.isFetching) {
      return this.cachedData || {
        lastChecked: new Date().toLocaleTimeString('cs-CZ'),
        myTasks: [],
        unassignedTasks: [],
        totalMyHours: 0,
      };
    }

    this.isFetching = true;
    const startTime = Date.now();
    const config = this.store.getConfig();
    const planConfig: MagicPlanSettings = config.magicplan || {};
    const urls = (planConfig.urls && planConfig.urls.length > 0)
      ? planConfig.urls.map((u) => u.trim()).filter(Boolean)
      : (planConfig.url?.trim() ? [planConfig.url.trim()] : []);
    const userColumns = (planConfig.userColumns && planConfig.userColumns.length > 0)
      ? planConfig.userColumns.map((u) => u.trim()).filter(Boolean)
      : (planConfig.userColumn?.trim() ? [planConfig.userColumn.trim()] : []);
    const queueColumnIdentifier = planConfig.unassignedColumn?.trim() || '';
    const linkWithTaskManager = planConfig.linkWithTaskManager !== false;
    const mlogBaseUrl = config.mlog?.baseUrl;
    const mlogTaskPrefix = config.mlog?.taskPrefix || 'T';
    const mlogRequestPrefix = config.mlog?.requestPrefix || 'R';

    if (urls.length === 0) {
      this.isFetching = false;
      const emptyData: MagicPlanData = {
        lastChecked: new Date().toLocaleTimeString('cs-CZ'),
        myTasks: [],
        unassignedTasks: [],
        totalMyHours: 0,
        availablePersons: [],
        error: 'Nastavte URL adresu plánu v nastavení MagicPlan.',
        isOffline: true,
      };
      this.cachedData = emptyData;
      return emptyData;
    }

    try {
      let allMyTasks: PlanTaskItem[] = [];
      let allUnassignedTasks: PlanTaskItem[] = [];
      let combinedDays: PlanDayInfo[] = [];
      let allAvailablePersons: PlanPersonInfo[] = [];
      let planNumber: string | undefined;
      let planRange: string | undefined;
      let totalHtmlLen = 0;
      let successfulUrls = 0;

      for (const currentUrl of urls) {
        try {
          const html = await this.fetchHtmlWithCredentials(currentUrl);
          totalHtmlLen += html.length;
          const parsed = this.parsePlanHtml(
            html,
            userColumns,
            queueColumnIdentifier,
            linkWithTaskManager,
            mlogBaseUrl,
            mlogTaskPrefix,
            mlogRequestPrefix
          );
          if (!planNumber && parsed.planNumber) planNumber = parsed.planNumber;
          if (!planRange && parsed.planRange) planRange = parsed.planRange;
          if (combinedDays.length === 0 && parsed.days && parsed.days.length > 0) {
            combinedDays = parsed.days;
          }
          if (parsed.availablePersons && parsed.availablePersons.length > 0) {
            for (const p of parsed.availablePersons) {
              const existing = allAvailablePersons.find((x) => x.id === p.id);
              if (!existing) {
                allAvailablePersons.push({ ...p });
              } else {
                if (!existing.shortcut && p.shortcut) existing.shortcut = p.shortcut;
                if (!existing.cleanName && p.cleanName) existing.cleanName = p.cleanName;
                if (existing.name === existing.id && p.name !== p.id) existing.name = p.name;
              }
            }
          }
          allMyTasks.push(...parsed.myTasks);
          allUnassignedTasks.push(...parsed.unassignedTasks);
          successfulUrls++;
        } catch (fetchErr: any) {
          console.warn(`[MagicPlan] Chyba načtení plánu z URL (${currentUrl}):`, fetchErr?.message || fetchErr);
        }
      }

      if (successfulUrls === 0 && urls.length > 0) {
        throw new Error('Nelze se připojit k žádné ze zadaných URL adres plánu.');
      }

      // 2b. Fetch and integrate worklogs from MLog Logs.aspx
      const worklogBase = planConfig.worklogUrl !== undefined
        ? planConfig.worklogUrl.trim()
        : 'http://mlog/Logs.aspx';

      let dailyUserWorklogs: Record<string, Record<string, number>> | undefined = undefined;
      let worklogTimelineEntries: WorklogTimelineEntry[] | undefined = undefined;
      if (worklogBase && combinedDays.length > 0) {
        try {
          const wlRes = await this.fetchAndApplyWorklogs(
            worklogBase,
            combinedDays,
            allMyTasks,
            allAvailablePersons,
            userColumns,
            linkWithTaskManager,
            mlogBaseUrl,
            mlogTaskPrefix,
            mlogRequestPrefix
          );
          dailyUserWorklogs = wlRes.dailyUserWorklogs;
          worklogTimelineEntries = wlRes.worklogTimelineEntries;
        } catch (wlErr: any) {
          console.warn('[MagicPlan] Chyba načtení worklogu:', wlErr?.message || wlErr);
        }
      }

      allAvailablePersons.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '', 'cs'));
      const myTasks = this.deduplicateTasks(allMyTasks);
      const unassignedTasks = this.deduplicateTasks(allUnassignedTasks);
      const totalMyHours = myTasks.reduce((sum, t) => sum + (t.totalHours || 0), 0);

      const nowIso = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const newData: MagicPlanData = {
        planNumber,
        planRange,
        days: combinedDays,
        lastChecked: nowIso,
        myTasks,
        unassignedTasks,
        totalMyHours,
        availablePersons: allAvailablePersons,
        dailyUserWorklogs,
        worklogTimelineEntries,
        isOffline: false,
      };

      this.cachedData = newData;

      // Check diffs and show notifications
      const diffResult = this.checkDiffsAndNotify(myTasks, unassignedTasks, planConfig);

      this.broadcastData(newData);

      // Record query log for developer inspection
      this.recordQueryLog({
        id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        url: urls.join(', '),
        durationMs: Date.now() - startTime,
        htmlLength: totalHtmlLen,
        myTasksCount: myTasks.length,
        unassignedTasksCount: unassignedTasks.length,
        totalHours: totalMyHours,
        newTasks: diffResult.newTasks,
        completedTasks: diffResult.completedTasks,
        changedTasks: diffResult.changedTasks,
        myTasks,
        unassignedTasks,
      });

      diagnosticsService.logAction({
        type: 'sync',
        title: 'MagicPlan: synchronizace plánu',
        details: `Načteno ${myTasks.length} mých úkolů (${totalMyHours}h), ${unassignedTasks.length} ve frontě (${planRange || 'akt. období'}) z ${urls.length} plánů`,
        status: 'success',
      });

      return newData;
    } catch (err: any) {
      console.warn('[MagicPlan] Chyba načtení plánu (možná offline / mimo VPN):', err?.message || err);

      const nowIso = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const offlineData: MagicPlanData = {
        ...(this.cachedData || {
          myTasks: [],
          unassignedTasks: [],
          totalMyHours: 0,
        }),
        lastChecked: nowIso,
        error: err?.message || 'Nelze se připojit k internímu serveru plánu',
        isOffline: true,
      };

      this.recordQueryLog({
        id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        status: 'error',
        url: urls.join(', ') || '',
        durationMs: Date.now() - startTime,
        htmlLength: 0,
        myTasksCount: 0,
        unassignedTasksCount: 0,
        totalHours: 0,
        newTasks: [],
        completedTasks: [],
        changedTasks: [],
        error: err?.message || String(err),
        myTasks: [],
        unassignedTasks: [],
      });

      this.cachedData = offlineData;
      this.broadcastData(offlineData);
      return offlineData;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Fetches HTML from internal URL using Chromium net.fetch with NTLM credentials,
   * falling back to Windows PowerShell Invoke-WebRequest if needed.
   */
  private async fetchHtmlWithCredentials(url: string, validator?: (html: string) => boolean): Promise<string> {
    const isValid = validator || ((text: string) => Boolean(text && (text.includes('class="plan"') || text.includes('TitleHeading') || text.includes('Denní přehled MLog') || text.includes('<table'))));

    // 1. Try Chromium net.fetch (handles Windows Integrated Authentication natively)
    try {
      const response = await net.fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IADonkey/2.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.ok) {
        const text = await response.text();
        if (text && isValid(text)) {
          return text;
        }
      }
    } catch (err) {
      // Net.fetch failed or intranet zone requires explicit default credentials, proceed to fallback
    }

    // 2. Windows native curl with Negotiate/NTLM authentication (fast and robust)
    try {
      const curlCommand = `curl.exe -s --negotiate -u : "${url}"`;
      const { stdout: curlOut } = await execAsync(curlCommand, {
        maxBuffer: 15 * 1024 * 1024,
        timeout: 10000,
        encoding: 'utf-8',
      });
      if (curlOut && isValid(curlOut)) {
        return curlOut;
      }
    } catch (err) {
      // Fallback to PowerShell
    }

    // 3. Fallback: PowerShell Invoke-WebRequest with current Windows user credentials
    const psCommand = `powershell -NoProfile -NonInteractive -Command "$res = Invoke-WebRequest -Uri '${url}' -UseDefaultCredentials -UseBasicParsing -TimeoutSec 15; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $res.Content"`;
    const { stdout, stderr } = await execAsync(psCommand, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 20000,
    });

    if (stderr && !stdout) {
      throw new Error(`PowerShell fetch failed: ${stderr}`);
    }

    if (!stdout || !isValid(stdout)) {
      throw new Error('Server vrátil neúplná nebo prázdná data');
    }

    return stdout;
  }

  /**
   * Parses worklog entries from MLog Logs.aspx HTML
   */
  private parseWorklogHtml(html: string, date: string = ''): Map<string, WorklogParsedItem[]> {
    const result = new Map<string, WorklogParsedItem[]>();
    if (!html) return result;

    const userSections = html.split(/<h1[^>]*>/i);
    for (let i = 1; i < userSections.length; i++) {
      const sec = userSections[i];
      const nameMatch = sec.match(/^([^<]+)<\/h1>/i);
      if (!nameMatch) continue;
      const userName = decodeHtmlEntities(nameMatch[1]).trim();
      if (!userName || userName.toLowerCase().includes('denní přehled')) continue;

      const tableMatch = sec.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
      if (!tableMatch) continue;

      const trMatches = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      const userTasks: WorklogParsedItem[] = [];

      for (let r = 1; r < trMatches.length - 1; r += 2) {
        const tr1 = trMatches[r];
        const tr2 = trMatches[r + 1];
        if (!tr1 || !tr2) break;

        const isService = /class=["'][^"']*service[^"']*["']/i.test(tr1);
        const isDev = /class=["'][^"']*dev[^"']*["']/i.test(tr1);

        const rMatch =
          tr1.match(/mlog:\/\/(R\d+)/i) ||
          tr1.match(/>\s*(R\d+)\s*<\/a>/i) ||
          tr1.match(/\b(R\d+)\b/i) ||
          tr2.match(/mlog:\/\/(R\d+)/i) ||
          tr2.match(/\b(R\d+)\b/i);
        const reqId = rMatch ? rMatch[1].toUpperCase() : '';

        const strongMatch = tr1.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
        const title = strongMatch ? decodeHtmlEntities(strongMatch[1].replace(/<[^>]+>/g, '')).trim() : '';

        const projMatch = tr1.match(/<\/strong>\s*-\s*([^<]+)/i);
        const project = projMatch ? decodeHtmlEntities(projMatch[1]).trim() : '';

        const tdMatches2 = tr2.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        let rowFallbackHours = 0;
        for (const td of tdMatches2) {
          const hMatch = td.match(/([\d,\.]+)\s*h(?:od)?\b/i);
          if (hMatch) {
            rowFallbackHours = parseFloat(hMatch[1].replace(',', '.')) || 0;
            if (rowFallbackHours > 0) break;
          }
        }
        if (rowFallbackHours === 0 && tdMatches2.length >= 2) {
          const hText = tdMatches2[1].replace(/<[^>]+>/g, '').replace('h', '').replace(',', '.').trim();
          rowFallbackHours = parseFloat(hText) || 0;
        }

        // Row-level fallback task IDs
        const rowParentMatch =
          tr2.match(/<a\s+[^>]*href=["']mlog:\/\/(T\d+)["'][^>]*title=["'][^"']*úkol[^"']*["']/i) ||
          tr2.match(/<a\s+[^>]*href=["']mlog:\/\/(T\d+)["'][^>]*>[\s\S]*?úkol[\s\S]*?<\/a>/i) ||
          tr2.match(/data-parent(?:task)?id=["']?(T\d+)["']?/i) ||
          tr1.match(/data-parent(?:task)?id=["']?(T\d+)["']?/i);
        const rowParentTaskId = rowParentMatch ? rowParentMatch[1].toUpperCase() : undefined;

        const rowTMatch =
          tr2.match(/mlog:\/\/(T\d+)/i) ||
          tr2.match(/\((T\d+)\)/i) ||
          tr2.match(/\b(T\d+)\b/i) ||
          tr1.match(/mlog:\/\/(T\d+)/i) ||
          tr1.match(/\((T\d+)\)/i) ||
          tr1.match(/\b(T\d+)\b/i);
        const rowFallbackTaskId = rowTMatch ? rowTMatch[1].toUpperCase() : '';

        // Search for individual worklog sub-entries: (HH:MM / Xh)
        const descCell = tdMatches2.length >= 3 ? tdMatches2[2] : tr2;
        const subEntryRegex = /\(\s*(\d{1,2}:\d{2})\s*\/\s*([\d,\.]+)\s*h(?:od)?\s*\)/gi;
        const subMatches: Array<{ timeStr: string; hours: number; index: number }> = [];
        let sm: RegExpExecArray | null;
        while ((sm = subEntryRegex.exec(descCell)) !== null) {
          subMatches.push({
            timeStr: sm[1],
            hours: parseFloat(sm[2].replace(',', '.')) || 0,
            index: sm.index,
          });
        }

        if (subMatches.length > 0) {
          for (let mIdx = 0; mIdx < subMatches.length; mIdx++) {
            const curr = subMatches[mIdx];
            const nextIdx = subMatches[mIdx + 1]?.index ?? descCell.length;
            const segment = descCell.slice(curr.index, nextIdx);

            const timeEnd = formatTimeHHMM(curr.timeStr);
            const subHours = curr.hours;
            const timeStart = calculateTimeStart(timeEnd, subHours);

            // Link parsing:
            // 1. Priority 1: Link to parent task (indicated by "úkol" in text or title, or explicit data-parenttaskid)
            const explicitParentMatch =
              segment.match(/<a\s+[^>]*href=["']mlog:\/\/(T\d+)["'][^>]*title=["'][^"']*úkol[^"']*["']/i) ||
              segment.match(/<a\s+[^>]*href=["']mlog:\/\/(T\d+)["'][^>]*>[\s\S]*?úkol[\s\S]*?<\/a>/i) ||
              segment.match(/data-parent(?:task)?id=["']?(T\d+)["']?/i);
            const subParentTaskId = explicitParentMatch ? explicitParentMatch[1].toUpperCase() : undefined;

            // 2. Priority 2: Worklog bubble link (mlog://T...)
            const allTLinks = Array.from(segment.matchAll(/href=["']mlog:\/\/(T\d+)["']/gi)).map((m) => m[1].toUpperCase());
            const subFallbackTaskId = allTLinks.find((t) => t !== subParentTaskId) ||
              allTLinks[0] ||
              segment.match(/\((T\d+)\)/i)?.[1]?.toUpperCase() ||
              segment.match(/\b(T\d+)\b/i)?.[1]?.toUpperCase() ||
              '';

            const effectiveTaskId = subParentTaskId || subFallbackTaskId || rowParentTaskId || rowFallbackTaskId;

            let subDesc = segment
              .replace(/^\s*\(\s*\d{1,2}:\d{2}\s*\/\s*[\d,\.]+\s*h(?:od)?\s*\)/i, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/[↑▲]/g, '')
              .replace(/úkol\s+T\d+/gi, '')
              .replace(/\s*\|\s*$/, '')
              .trim();
            subDesc = decodeHtmlEntities(subDesc);

            userTasks.push({
              date,
              userName,
              reqId,
              taskId: effectiveTaskId,
              parentTaskId: subParentTaskId || rowParentTaskId,
              title,
              project,
              isService,
              isDev,
              hours: subHours,
              timeEnd,
              timeStart,
              description: subDesc || title,
            });
          }
        } else {
          // Fallback to row-level entry if no (HH:MM / Xh) blocks were found
          const effectiveTaskId = rowParentTaskId || rowFallbackTaskId;
          userTasks.push({
            date,
            userName,
            reqId,
            taskId: effectiveTaskId,
            parentTaskId: rowParentTaskId,
            title,
            project,
            isService,
            isDev,
            hours: rowFallbackHours,
            description: title,
          });
        }
      }

      if (userTasks.length > 0) {
        result.set(userName, userTasks);
      }
    }

    return result;
  }

  /**
   * Fetches worklogs from Logs.aspx for days from Monday to current day,
   * aggregates hours per person and task, rounds to 0.5h, and reconciles with allMyTasks.
   */
  private async fetchAndApplyWorklogs(
    worklogBaseUrl: string,
    combinedDays: PlanDayInfo[],
    allMyTasks: PlanTaskItem[],
    allAvailablePersons: PlanPersonInfo[],
    userColumns: string[] = [],
    linkWithTaskManager: boolean = true,
    mlogBaseUrl?: string,
    mlogTaskPrefix: string = 'T',
    mlogRequestPrefix: string = 'R'
  ): Promise<{
    dailyUserWorklogs: Record<string, Record<string, number>>;
    worklogTimelineEntries: WorklogTimelineEntry[];
  }> {
    if (!worklogBaseUrl || combinedDays.length === 0) {
      return { dailyUserWorklogs: {}, worklogTimelineEntries: [] };
    }

    // Always query all 5 days of the plan week so all worklogs in the week are aggregated
    const targetDays = combinedDays.slice(0, 5);

    if (targetDays.length === 0) {
      return { dailyUserWorklogs: {}, worklogTimelineEntries: [] };
    }

    const dailyResults = await Promise.all(
      targetDays.map(async (day) => {
        try {
          const [y, m, dNum] = day.date.split('-');
          const dateParam = `${dNum}.${m}.${y}`;
          const sep = worklogBaseUrl.includes('?') ? '&' : '?';
          const url = `${worklogBaseUrl}${sep}Date=${dateParam}`;
          const html = await this.fetchHtmlWithCredentials(url, (t) => Boolean(t && (t.includes('TitleHeading') || t.includes('table'))));
          return { date: day.date, usersMap: this.parseWorklogHtml(html, day.date) };
        } catch (err: any) {
          console.warn(`[MagicPlan] Chyba načtení worklogu pro ${day.date}:`, err?.message || err);
          return { date: day.date, usersMap: new Map<string, WorklogParsedItem[]>() };
        }
      })
    );

    // Aggregate worklog items across all days per person
    const aggregatedByUser = new Map<string, Map<string, {
      reqId: string;
      taskId: string;
      title: string;
      project: string;
      isService: boolean;
      isDev: boolean;
      totalRawHours: number;
    }>>();

    for (const dayRes of dailyResults) {
      for (const [wUser, items] of dayRes.usersMap.entries()) {
        let userTasksMap = aggregatedByUser.get(wUser);
        if (!userTasksMap) {
          userTasksMap = new Map();
          aggregatedByUser.set(wUser, userTasksMap);
        }

        for (const item of items) {
          const normTaskId = (item.taskId || '').trim().toUpperCase();
          const normReqId = (item.reqId || '').trim().toUpperCase();
          const normDigitsTask = normTaskId.replace(/\D/g, '');
          const normDigitsReq = normReqId.replace(/\D/g, '');
          const normTitle = item.title ? normalizeStr(item.title) : '';

          if (!normTaskId && !normReqId && !normTitle) continue;

          // Find existing entry in userTasksMap that belongs to the same task / requirement
          let existing: {
            reqId: string;
            taskId: string;
            title: string;
            project: string;
            isService: boolean;
            isDev: boolean;
            totalRawHours: number;
          } | undefined;

          for (const cand of userTasksMap.values()) {
            const candTaskId = (cand.taskId || '').toUpperCase();
            const candReqId = (cand.reqId || '').toUpperCase();
            const candTaskDigits = candTaskId.replace(/\D/g, '');
            const candReqDigits = candReqId.replace(/\D/g, '');

            // 1. Pokud má položka kód úkolu T: sloučit POUZE a VÝHRADNĚ při shodě čísla T!
            if (normDigitsTask) {
              if (candTaskDigits && normDigitsTask === candTaskDigits) {
                existing = cand;
                break;
              }
              // Položky s různými kódy T nikdy neslučovat ani podle R!
              continue;
            }

            // 2. Pouze pokud ani položka ani kandidát NEMÁ kód úkolu T:
            if (!normDigitsTask && !candTaskDigits) {
              if (normDigitsReq && candReqDigits && normDigitsReq === candReqDigits) {
                if (normTitle && cand.title && normalizeStr(cand.title) === normTitle) {
                  existing = cand;
                  break;
                }
              }
              if (normTitle && cand.title && normalizeStr(cand.title) === normTitle) {
                existing = cand;
                break;
              }
            }
          }

          if (!existing) {
            const primaryKey = normDigitsTask
              ? `task-${normDigitsTask}`
              : (normDigitsReq ? `req-${normDigitsReq}-${normTitle}` : (normTitle || Math.random().toString()));
            userTasksMap.set(primaryKey, {
              reqId: item.reqId,
              taskId: item.taskId,
              title: item.title,
              project: item.project,
              isService: item.isService,
              isDev: item.isDev,
              totalRawHours: item.hours,
            });
          } else {
            existing.totalRawHours += item.hours;
            if (!existing.reqId && item.reqId) existing.reqId = item.reqId;
            if (!existing.taskId && item.taskId) existing.taskId = item.taskId;
            if (!existing.title && item.title) existing.title = item.title;
            if (!existing.project && item.project) existing.project = item.project;
            if (item.isService) existing.isService = true;
            if (item.isDev) existing.isDev = true;
          }
        }
      }
    }

    // Helper to verify if person is included in the plan / userColumns
    const isUserMonitored = (wUser: string, person?: PlanPersonInfo): boolean => {
      if (userColumns.length === 0) return true;

      // 1. Direct check of wUser against userColumns
      for (const uCol of userColumns) {
        if (!uCol) continue;
        if (matchesPersonName(uCol, wUser)) return true;
        const normU = normalizeStr(uCol);
        const normW = normalizeStr(wUser);
        if (normU === normW || normW.includes(normU) || normU.includes(normW)) return true;
      }

      // 2. Check if matched person matches any userColumn
      if (person) {
        for (const uCol of userColumns) {
          if (!uCol) continue;
          const normU = normalizeStr(uCol);
          if (person.id && normalizeStr(person.id) === normU) return true;
          if (person.shortcut && normalizeStr(person.shortcut) === normU) return true;
          if (person.name && (normalizeStr(person.name) === normU || matchesPersonName(person.name, uCol))) return true;
          if (person.cleanName && (normalizeStr(person.cleanName) === normU || matchesPersonName(person.cleanName, uCol))) return true;
        }
      }

      // 3. Check if any existing task in allMyTasks belongs to this user
      if (allMyTasks.some((t) => {
        if (person && t.userId && person.id && t.userId === person.id) return true;
        return matchesPersonName(t.userName, wUser) || (person && (matchesPersonName(t.userName, person.name) || matchesPersonName(t.userName, person.cleanName || '')));
      })) {
        return true;
      }

      return false;
    };

    // Now reconcile with allMyTasks
    for (const [wUser, taskMap] of aggregatedByUser.entries()) {
      const matchedPerson = allAvailablePersons.find(
        (p) =>
          matchesPersonName(p.cleanName || '', wUser) ||
          matchesPersonName(p.name || '', wUser)
      );

      // Strictly skip any persons that are not part of the monitored plan!
      if (!isUserMonitored(wUser, matchedPerson)) {
        continue;
      }

      for (const [, wTask] of taskMap.entries()) {
        const realRawWorklog = Math.round(wTask.totalRawHours * 100) / 100;
        const roundedHours = Math.max(0.5, Math.ceil(wTask.totalRawHours * 2) / 2);
        const wTaskDigits = (wTask.taskId || '').replace(/\D/g, '');
        const wReqDigits = (wTask.reqId || '').replace(/\D/g, '');

        const matchingTasks = allMyTasks.filter((t) => {
          if (matchedPerson) {
            const isUserMatch =
              t.userId === matchedPerson.id ||
              matchesPersonName(t.userName, matchedPerson.cleanName || matchedPerson.name) ||
              matchesPersonName(t.userName, wUser);
            if (!isUserMatch) return false;
          } else {
            if (!matchesPersonName(t.userName, wUser)) return false;
          }

          const tTaskDigits = (t.taskIdentifier || '').replace(/\D/g, '');
          const tReqDigits = (t.requirementId || '').replace(/\D/g, '');

          // 1. Pokud worklog obsahuje kód úkolu T (v naprosté většině případů):
          if (wTaskDigits) {
            // Pokud má úkol v plánu kód T: musí se čísla T shodovat!
            if (tTaskDigits) {
              return wTaskDigits === tTaskDigits;
            }
            // Pokud úkol v plánu nemá explicitní taskIdentifier, ale kód T je v titulku:
            if (wTask.taskId && new RegExp(`\\b${wTask.taskId}\\b`, 'i').test(t.title || '')) {
              return true;
            }
            // Jinak shoda NENÍ možná – nikdy nepárovat podle R, pokud jde o úkol T!
            return false;
          }

          // 2. Pouze pokud worklog NEMÁ žádný kód T a ani úkol v plánu nemá žádný kód T:
          if (!wTaskDigits && !tTaskDigits) {
            if (wReqDigits && tReqDigits && wReqDigits === tReqDigits) {
              if (wTask.title && t.title && normalizeStr(t.title) === normalizeStr(wTask.title)) {
                return true;
              }
            }
            if (wTask.title && t.title && normalizeStr(t.title) === normalizeStr(wTask.title)) {
              return true;
            }
          }

          return false;
        });

        if (matchingTasks.length > 0) {
          for (const existingTask of matchingTasks) {
            const isTaskSolvedInPlan = Boolean(existingTask.isCompleted || existingTask.isSolved);
            if (isTaskSolvedInPlan) {
              existingTask.isCompleted = true;
              existingTask.isSolved = true;
              if (!existingTask.estimatedHours) {
                existingTask.estimatedHours = existingTask.totalHours;
              }
              existingTask.totalHours = roundedHours;
              existingTask.worklogHours = realRawWorklog;
            } else {
              // U nevyřešeného požadavku počítáme reálný sloučený worklog bez zaokrouhlování
              existingTask.worklogHours = realRawWorklog;
            }
            if (wTask.isService) existingTask.taskType = 'service';
            else if (wTask.isDev) existingTask.taskType = 'dev';
            if (!existingTask.project && wTask.project) existingTask.project = wTask.project;
            if (!existingTask.title && wTask.title) existingTask.title = wTask.title;
            if (!existingTask.requirementId && wTask.reqId) existingTask.requirementId = wTask.reqId;
            if (!existingTask.taskIdentifier && wTask.taskId) existingTask.taskIdentifier = wTask.taskId;
          }
        } else {
          const code = wTask.taskId || wTask.reqId || '';
          let taskUrl = '';
          if (linkWithTaskManager && mlogBaseUrl && code) {
            const numOnly = code.replace(/\D/g, '');
            const prefix = code.startsWith('T') ? mlogTaskPrefix : mlogRequestPrefix;
            taskUrl = `${mlogBaseUrl.replace(/\/+$/, '')}/${prefix}${numOnly}`;
          }

          const newTask: PlanTaskItem = {
            taskId: `wl-${wTask.taskId || wTask.reqId || Math.random().toString(36).slice(2, 8)}`,
            requirementId: wTask.reqId || undefined,
            taskIdentifier: wTask.taskId || undefined,
            title: wTask.title || (wTask.reqId ? `${wTask.reqId}: Úkol z worklogu` : 'Úkol z worklogu'),
            project: wTask.project || '',
            userId: matchedPerson?.id || '',
            userName: matchedPerson?.name || wUser,
            totalHours: roundedHours,
            worklogHours: realRawWorklog,
            isPinned: false,
            isSolved: true,
            isCompleted: true,
            taskType: wTask.isService ? 'service' : 'dev',
            dates: targetDays.map((d) => d.date),
            url: taskUrl || undefined,
          };
          allMyTasks.push(newTask);
        }
      }
    }

    // Build daily worklog totals per user
    const dailyUserWorklogs: Record<string, Record<string, number>> = {};
    for (const dayRes of dailyResults) {
      for (const [wUser, items] of dayRes.usersMap.entries()) {
        const dayHours = items.reduce((sum, item) => sum + (item.hours || 0), 0);
        if (dayHours > 0) {
          const matchedPerson = allAvailablePersons.find(
            (p) =>
              matchesPersonName(p.cleanName || '', wUser) ||
              matchesPersonName(p.name || '', wUser)
          );
          const keysToSet = new Set<string>();
          keysToSet.add(wUser);
          if (matchedPerson) {
            if (matchedPerson.id) keysToSet.add(matchedPerson.id);
            if (matchedPerson.name) keysToSet.add(matchedPerson.name);
            if (matchedPerson.cleanName) keysToSet.add(matchedPerson.cleanName);
          }
          const cleanHours = Math.round(dayHours * 100) / 100;
          for (const k of keysToSet) {
            if (!dailyUserWorklogs[k]) dailyUserWorklogs[k] = {};
            dailyUserWorklogs[k][dayRes.date] = cleanHours;
          }
        }
      }
    }

    // Build granular chronological timeline entries for Real timeline log
    const worklogTimelineEntries: WorklogTimelineEntry[] = [];
    for (const dayRes of dailyResults) {
      for (const [wUser, items] of dayRes.usersMap.entries()) {
        const matchedPerson = allAvailablePersons.find(
          (p) =>
            matchesPersonName(p.cleanName || '', wUser) ||
            matchesPersonName(p.name || '', wUser)
        );
        if (!isUserMonitored(wUser, matchedPerson)) {
          continue;
        }

        for (const item of items) {
          if (item.timeStart && item.timeEnd && item.hours > 0) {
            worklogTimelineEntries.push({
              date: item.date || dayRes.date,
              userName: matchedPerson?.name || wUser,
              reqId: item.reqId || undefined,
              taskId: item.taskId,
              parentTaskId: item.parentTaskId,
              title: item.title,
              project: item.project,
              isService: item.isService,
              isDev: item.isDev,
              hours: item.hours,
              timeStart: item.timeStart,
              timeEnd: item.timeEnd,
              description: item.description,
            });
          }
        }
      }
    }

    worklogTimelineEntries.sort((a, b) => {
      const dCmp = a.date.localeCompare(b.date);
      if (dCmp !== 0) return dCmp;
      const uCmp = a.userName.localeCompare(b.userName, 'cs');
      if (uCmp !== 0) return uCmp;
      return a.timeStart.localeCompare(b.timeStart);
    });

    return {
      dailyUserWorklogs,
      worklogTimelineEntries,
    };
  }

  /**
   * Parses the HTML structure of plan page
   */
  private parsePlanHtml(
    html: string,
    userColumnIdentifiers: string[],
    queueColumnIdentifier: string,
    linkWithTaskManager: boolean,
    mlogBaseUrl?: string,
    mlogTaskPrefix: string = 'T',
    mlogRequestPrefix: string = 'R'
  ): {
    planNumber?: string;
    planRange?: string;
    days: PlanDayInfo[];
    myTasks: PlanTaskItem[];
    unassignedTasks: PlanTaskItem[];
    totalMyHours: number;
    availablePersons: PlanPersonInfo[];
  } {
    // 1. Extract plan number and date range from dropdown
    let planNumber: string | undefined;
    let planRange: string | undefined;

    const planOptionMatch = html.match(
      /<select[^>]*class="[^"]*plan-selection[^"]*"[^>]*>[\s\S]*?<option[^>]*value="(\d+)"[^>]*selected[^>]*>\s*([^<]+)\s*<\/option>/i
    );
    if (planOptionMatch) {
      planNumber = planOptionMatch[1];
      planRange = decodeHtmlEntities(planOptionMatch[2]);
    }

    // 2. Extract day blocks with top positions to map task slices to dates
    const dayBlocks: { date: string; top: number; dayLabel: string; isWeekend: boolean; isToday: boolean }[] = [];
    const dayRegex =
      /<div class="block[^"]*"[^>]*style="[^"]*top:\s*(\d+)px[^"]*"[^>]*data-date="([^"]*)"[^>]*>[\s\S]*?<div class="date-label\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    let dm: RegExpExecArray | null;
    const seenDates = new Set<string>();

    while ((dm = dayRegex.exec(html)) !== null) {
      const top = parseInt(dm[1], 10);
      const fullDate = dm[2].split(' ')[0]; // '2026-09-28'
      const isToday = dm[3].includes('today');
      const rawLabel = decodeHtmlEntities(dm[4]);
      const cleanLabel = rawLabel.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
      const isWeekend = cleanLabel.startsWith('so') || cleanLabel.startsWith('ne');

      if (!seenDates.has(fullDate)) {
        seenDates.add(fullDate);
        dayBlocks.push({
          date: fullDate,
          top,
          dayLabel: cleanLabel,
          isWeekend,
          isToday,
        });
      }
    }
    dayBlocks.sort((a, b) => a.top - b.top);

    const getDateForTop = (topPx: number): string => {
      for (let i = dayBlocks.length - 1; i >= 0; i--) {
        if (topPx >= dayBlocks[i].top) {
          return dayBlocks[i].date;
        }
      }
      return dayBlocks[0]?.date || '';
    };

    // 3. Extract user columns
    const normQueueId = normalizeStr(queueColumnIdentifier);

    // Robust user regex matching <div class="user" or <div id="..." class="user"...>
    const userRegex =
      /<div\s+([^>]*\bclass=["'][^"']*\buser\b[^"']*["'][^>]*)>[\s\S]*?<div\s+class=["']header["'][^>]*>([\s\S]*?)<\/div>([\s\S]*?)(?=(?:<div\s+[^>]*\bclass=["'][^"']*\buser\b[^"']*["']|$))/gi;
    let match: RegExpExecArray | null;

    let myTasksRaw: PlanTaskItem[] = [];
    let unassignedTasksRaw: PlanTaskItem[] = [];
    const availablePersons: PlanPersonInfo[] = [];

    while ((match = userRegex.exec(html)) !== null) {
      const userAttrs = match[1] || '';
      const headerRaw = match[2] || '';
      const headerText = decodeHtmlEntities(headerRaw.replace(/<[^>]+>/g, '')).trim();
      const normHeader = normalizeStr(headerText);
      const columnBody = match[3] || '';

      const shortcutMatch = headerText.match(/\(([^)]+)\)$/);
      const shortcut = shortcutMatch ? shortcutMatch[1].trim() : '';
      const cleanName = shortcut ? headerText.replace(/\s*\([^)]+\)$/, '').trim() : headerText;

      let detectedPersonId = '';
      const userAttrMatch =
        userAttrs.match(/data-user[-_]?id=["']([^"']+)["']/i) ||
        userAttrs.match(/id=["']user[-_]?(\d+)["']/i) ||
        userAttrs.match(/data-person[-_]?id=["']([^"']+)["']/i) ||
        userAttrs.match(/data-id=["']([^"']+)["']/i);
      if (userAttrMatch) {
        detectedPersonId = userAttrMatch[1];
      } else {
        const bodyAttrMatch =
          columnBody.match(/data-user[-_]?id=["']([^"']+)["']/i) ||
          columnBody.match(/data-person[-_]?id=["']([^"']+)["']/i) ||
          columnBody.match(/id=["']user[-_]?(\d+)["']/i);
        if (bodyAttrMatch) {
          detectedPersonId = bodyAttrMatch[1];
        } else {
          const headerIdMatch = headerText.match(/\((\d+)\)/) || headerText.match(/\bID:?\s*(\d+)\b/i);
          if (headerIdMatch) {
            detectedPersonId = headerIdMatch[1];
          }
        }
      }

      // Check known persons cache if not detected directly from HTML
      if (!detectedPersonId) {
        for (const kp of this.knownPersonsMap.values()) {
          if (
            (normHeader && (normalizeStr(kp.name) === normHeader || normalizeStr(kp.cleanName || '') === normHeader)) ||
            (shortcut && normalizeStr(kp.shortcut || '') === normalizeStr(shortcut))
          ) {
            detectedPersonId = kp.id;
            break;
          }
        }
      }

      const isQueueColumn = Boolean(
        normQueueId &&
        (normHeader === normQueueId ||
          normHeader.includes(normQueueId) ||
          userAttrs.includes(`data-user-id="${normQueueId}"`) ||
          userAttrs.includes(`data-user-id='${normQueueId}'`) ||
          columnBody.includes(`data-user-id="${normQueueId}"`) ||
          columnBody.includes(`data-user-id='${normQueueId}'`) ||
          (detectedPersonId && normalizeStr(detectedPersonId) === normQueueId))
      );

      if (headerText) {
        const personId = detectedPersonId || headerText;
        const personObj: PlanPersonInfo = {
          id: personId,
          name: headerText,
          cleanName,
          shortcut,
        };
        const existing = availablePersons.find((p) => p.id === personId);
        if (!existing) {
          availablePersons.push(personObj);
        } else {
          if (!existing.shortcut && shortcut) existing.shortcut = shortcut;
          if (!existing.cleanName && cleanName) existing.cleanName = cleanName;
        }
        if (personId && personId !== headerText) {
          this.knownPersonsMap.set(personId, personObj);
        }
      }

      const matchedUserId = userColumnIdentifiers.find((uId) => {
        const normUId = normalizeStr(uId);
        if (!normUId) return false;
        if (detectedPersonId && normalizeStr(detectedPersonId) === normUId) return true;
        if (
          userAttrs.includes(`data-user-id="${normUId}"`) ||
          userAttrs.includes(`data-user-id='${normUId}'`) ||
          columnBody.includes(`data-user-id="${normUId}"`) ||
          columnBody.includes(`data-user-id='${normUId}'`)
        ) return true;
        if (normHeader === normUId || normHeader.includes(normUId)) return true;
        if (shortcut && normalizeStr(shortcut) === normUId) return true;
        if (cleanName && (normalizeStr(cleanName) === normUId || normalizeStr(cleanName).includes(normUId))) return true;

        const kp = this.knownPersonsMap.get(normUId);
        if (kp) {
          if (normHeader && (normalizeStr(kp.name) === normHeader || normalizeStr(kp.cleanName || '') === normHeader)) return true;
          if (shortcut && normalizeStr(kp.shortcut || '') === normalizeStr(shortcut)) return true;
        }
        return false;
      });
      const isMyColumn = Boolean(matchedUserId);

      if (isMyColumn) {
        const resolvedUserName = headerText || (matchedUserId ? matchedUserId.trim() : '');
        const columnUserId = detectedPersonId || matchedUserId || '';
        const userTasks = this.extractTasksFromColumn(
          columnBody,
          resolvedUserName,
          getDateForTop,
          linkWithTaskManager,
          mlogBaseUrl,
          mlogTaskPrefix,
          mlogRequestPrefix,
          columnUserId
        );
        myTasksRaw.push(...userTasks);
      } else if (isQueueColumn) {
        const queueTasks = this.extractTasksFromColumn(
          columnBody,
          headerText,
          getDateForTop,
          linkWithTaskManager,
          mlogBaseUrl,
          mlogTaskPrefix,
          mlogRequestPrefix,
          detectedPersonId
        );
        unassignedTasksRaw.push(...queueTasks);
      }
    }

    // Deduplicate and group tasks by taskId
    const myTasks = this.deduplicateTasks(myTasksRaw);
    const unassignedTasks = this.deduplicateTasks(unassignedTasksRaw);
    const totalMyHours = myTasks.reduce((sum, t) => sum + (t.totalHours || 0), 0);

    // Correlate extracted tasks to discover / reconcile user IDs for availablePersons
    for (const t of [...myTasks, ...unassignedTasks]) {
      if (t.userId && t.userName) {
        const uId = String(t.userId).trim();
        const normName = normalizeStr(t.userName);
        const existing = availablePersons.find(
          (p) => p.id === uId || normalizeStr(p.name) === normName
        );
        if (existing) {
          if (existing.id !== uId && /^\d+$/.test(uId)) {
            existing.id = uId;
          }
          if (!existing.shortcut) {
            const scMatch = t.userName.match(/\(([^)]+)\)$/);
            if (scMatch) existing.shortcut = scMatch[1].trim();
          }
          if (!existing.cleanName) {
            existing.cleanName = existing.shortcut
              ? t.userName.replace(/\s*\([^)]+\)$/, '').trim()
              : t.userName;
          }
          this.knownPersonsMap.set(uId, existing);
        } else {
          const scMatch = t.userName.match(/\(([^)]+)\)$/);
          const sc = scMatch ? scMatch[1].trim() : '';
          const personObj: PlanPersonInfo = {
            id: uId,
            name: t.userName,
            cleanName: sc ? t.userName.replace(/\s*\([^)]+\)$/, '').trim() : t.userName,
            shortcut: sc,
          };
          availablePersons.push(personObj);
          this.knownPersonsMap.set(uId, personObj);
        }
      }
    }

    const days: PlanDayInfo[] = dayBlocks.map((d) => ({
      date: d.date,
      dayLabel: d.dayLabel,
      isWeekend: d.isWeekend,
      isToday: d.isToday,
    }));

    return {
      planNumber,
      planRange,
      days,
      myTasks,
      unassignedTasks,
      totalMyHours,
      availablePersons,
    };
  }

  /**
   * Extracts individual task DOM elements from a column
   */
  private extractTasksFromColumn(
    columnHtml: string,
    userName: string,
    getDateForTop: (topPx: number) => string,
    linkWithTaskManager: boolean,
    mlogBaseUrl?: string,
    mlogTaskPrefix: string = 'T',
    mlogRequestPrefix: string = 'R',
    columnUserId: string = ''
  ): PlanTaskItem[] {
    const tasks: PlanTaskItem[] = [];

    // Regex matching each task DIV block until the next task or column end
    const taskBlockRegex =
      /<div\s+class="task\s+([^"]*)"([^>]*)>([\s\S]*?)(?=<div\s+class="task\s+|$)/gi;

    let m: RegExpExecArray | null;
    while ((m = taskBlockRegex.exec(columnHtml)) !== null) {
      const classNames = m[1] || '';
      const attrs = m[2] || '';
      const innerContent = m[3] || '';
      const fullTaskHtml = m[0] || '';

      const styleMatch = attrs.match(/style="([^"]*)"/i);
      const style = styleMatch ? styleMatch[1] : '';

      const titleMatch = attrs.match(/title="([^"]*)"/i);
      const rawTitle = decodeHtmlEntities(titleMatch ? titleMatch[1] : '');

      const userIdMatch = attrs.match(/data-user-id="([^"]*)"/i);
      const userId = userIdMatch ? userIdMatch[1] : '';

      const taskIdMatch = attrs.match(/data-task-id="([^"]*)"/i);
      const guidMatch = classNames.match(/([a-f0-9\-]{36})/i);
      const taskId = (taskIdMatch ? taskIdMatch[1] : (guidMatch ? guidMatch[1] : '')) || `task-${Math.random()}`;

      const identMatch = attrs.match(/data-task-identifier="([^"]*)"/i);
      let taskIdentifier = identMatch ? identMatch[1] : '';
      if (!taskIdentifier) {
        const tMatch = rawTitle.match(/\b(T\d+)\b/i) || innerContent.match(/\b(T\d+)\b/i);
        if (tMatch) taskIdentifier = tMatch[1];
      }

      // Extract hours from all possible sources (data attributes, inner hours span, title)
      const attrHoursMatch =
        attrs.match(/data-task-total-hours="([^"]*)"/i) ||
        attrs.match(/data-task-hours="([^"]*)"/i) ||
        attrs.match(/data-hours="([^"]*)"/i);
      const attrHours = parseFloat(attrHoursMatch ? attrHoursMatch[1].replace(',', '.') : '0') || 0;

      const innerHoursMatch = innerContent.match(/<span[^>]*class="[^"]*hours[^"]*"[^>]*>\s*([\d,\.]+)\s*h?<\/span>/i);
      const spanHours = innerHoursMatch ? parseFloat(innerHoursMatch[1].replace(',', '.')) || 0 : 0;

      const titleHoursMatch = rawTitle.match(/\b([\d,\.]+)\s*h(?:od)?\b/i);
      const titleHours = titleHoursMatch ? parseFloat(titleHoursMatch[1].replace(',', '.')) || 0 : 0;

      let totalHours = spanHours > 0 ? spanHours : (attrHours > 0 ? attrHours : titleHours);
      if (spanHours > 0 && attrHours > 0) {
        totalHours = Math.max(spanHours, attrHours);
      }
      if (titleHours > 0) {
        totalHours = Math.max(totalHours, titleHours);
      }

      const customNameMatch = attrs.match(/data-task-custom-name="([^"]*)"/i);
      const customName = decodeHtmlEntities(customNameMatch ? customNameMatch[1] : '');

      const pinMatch = attrs.match(/data-task-pin-state="([^"]*)"/i);
      const pinState = pinMatch ? pinMatch[1] : 'unpinned';

      // Parse requirement ID (e.g. R134695)
      const reqMatch = rawTitle.match(/\b(R\d+)\b/i) || innerContent.match(/href="[^"]*(?:R|req-link[^"]*)(\d+)"/i) || innerContent.match(/\b(R\d+)\b/i);
      const requirementId = reqMatch ? (reqMatch[1].startsWith('R') ? reqMatch[1] : `R${reqMatch[1]}`) : undefined;

      // Parse project name from parentheses at end or from project-name span
      let project: string | undefined;
      const projMatch = rawTitle.match(/\(([^)]+)\)\s*$/);
      if (projMatch) {
        project = projMatch[1].trim();
      } else {
        const projSpan = innerContent.match(/<span[^>]*class="project-name"[^>]*>\s*([^<]+)\s*<\/span>/i);
        if (projSpan) {
          project = decodeHtmlEntities(projSpan[1]).trim();
        }
      }

      // Extract author initials (e.g. "KR", "VM", "PK", "JB")
      let author: string | undefined;
      const authorSpan = innerContent.match(/<span[^>]*class="[^"]*(?:author|user|zadavatel|creator|creator-user|owner|initials)[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/i);
      if (authorSpan) {
        author = decodeHtmlEntities(authorSpan[1]).trim();
      } else {
        const acronymMatch = innerContent.match(/<span[^>]*>\s*([A-Z]{2,4})\s*<\/span>/);
        if (acronymMatch) {
          author = acronymMatch[1].trim();
        }
      }
      if (!author) {
        const titleAcronym = rawTitle.match(/\[([A-Z]{2,4})\]/) || rawTitle.match(/\(([A-Z]{2,4})\)/) || rawTitle.match(/\b([A-Z]{2,3})\b(?:\s*:\s*|\s*-\s*|\s*$)/);
        if (titleAcronym) {
          author = titleAcronym[1].trim();
        }
      }

      // Check if task is completed / solved
      const isCompleted =
        classNames.includes('solved') ||
        classNames.includes('completed') ||
        classNames.includes('done') ||
        classNames.includes('finished') ||
        classNames.includes('closed') ||
        pinState === 'completed' ||
        pinState === 'solved' ||
        rawTitle.toLowerCase().includes('splněno') ||
        rawTitle.toLowerCase().includes('dokončeno') ||
        rawTitle.toLowerCase().includes('hotovo');

      // Check priority (priority-1 is critical)
      const isCritical =
        classNames.includes('priority-1') ||
        attrs.includes('priority-1') ||
        innerContent.includes('priority-1') ||
        fullTaskHtml.includes('priority-1') ||
        innerContent.includes("class='priority-1'") ||
        innerContent.includes('class="priority-1"') ||
        innerContent.toLowerCase().includes("title='kritická'") ||
        innerContent.toLowerCase().includes('title="kritická"') ||
        rawTitle.toLowerCase().includes('priority-1') ||
        customName.toLowerCase().includes('priority-1');

      // Determine task type (dev vs service)
      let taskType: 'dev' | 'service' | 'other' = 'other';
      if (classNames.includes('dev-')) taskType = 'dev';
      else if (classNames.includes('service-')) taskType = 'service';

      // Clean display title
      let cleanTitle = customName;
      if (!cleanTitle) {
        const reqNameSpan = innerContent.match(/<span[^>]*class="requirement-name"[^>]*>\s*([^<]+)\s*<\/span>/i);
        if (reqNameSpan) {
          cleanTitle = decodeHtmlEntities(reqNameSpan[1]).trim();
        }
      }
      if (!cleanTitle && rawTitle) {
        cleanTitle = rawTitle.replace(/\b[RT]\d+\b/g, '').replace(/\(([^)]+)\)\s*$/, '').trim();
      }

      // Determine scheduled date from top style coordinate
      const topMatch = style.match(/top:\s*(\d+)px/i);
      const topPx = topMatch ? parseInt(topMatch[1], 10) : 0;
      const scheduledDate = getDateForTop(topPx);

      const directUrlMatch = innerContent.match(/href="([^"]+)"/i) || fullTaskHtml.match(/href="([^"]+)"/i);
      let directUrl = directUrlMatch ? decodeHtmlEntities(directUrlMatch[1]).replace(/&amp;/g, '&') : undefined;
      if (!directUrl) {
        const urlInText = innerContent.match(/https?:\/\/[^\s"'<>]+/i) || rawTitle.match(/https?:\/\/[^\s"'<>]+/i);
        if (urlInText) {
          directUrl = urlInText[0];
        }
      }

      const isGodday = Boolean(
        requirementId === 'R0' ||
        /godday/i.test(`${rawTitle} ${customName} ${project || ''} ${directUrl || ''} ${innerContent}`)
      );

      let taskUrl = this.buildTaskUrl(
        requirementId,
        taskIdentifier || undefined,
        linkWithTaskManager,
        mlogBaseUrl,
        mlogTaskPrefix,
        mlogRequestPrefix
      );

      if (isGodday && directUrl) {
        taskUrl = directUrl;
      }

      tasks.push({
        taskId,
        requirementId,
        taskIdentifier: taskIdentifier || undefined,
        title: cleanTitle || rawTitle || 'Bez názvu',
        customName: customName || undefined,
        project,
        userId: userId || columnUserId || '',
        userName,
        totalHours,
        estimatedHours: totalHours,
        isPinned: pinState === 'pinned',
        isSolved: classNames.includes('solved') || pinState === 'solved',
        taskType,
        dates: scheduledDate ? [scheduledDate] : [],
        url: taskUrl,
        author,
        isCompleted,
        isCritical,
        isGodday,
        topPx,
      });
    }

    // Also extract not-available blocks (e.g. holidays, vacations, sick leaves)
    const naBlockRegex =
      /<div\s+class="[^"]*block[^"]*not-available[^"]*"[^>]*style="([^"]*)"[^>]*title="([^"]*)"[^>]*data-user-id="([^"]*)"[^>]*data-date="([^"]*)"/gi;
    let naMatch: RegExpExecArray | null;
    const naByDate = new Map<string, { count: number; userId: string; topPx: number }>();

    while ((naMatch = naBlockRegex.exec(columnHtml)) !== null) {
      const naStyle = naMatch[1] || '';
      const naUserId = naMatch[3] || '';
      const naDateRaw = naMatch[4] || ''; // e.g. "2026-09-28 00:00"
      const datePart = naDateRaw.split(' ')[0];
      const parsedTop = parseInt((naStyle.match(/top:\s*(\d+)px/i) || [])[1] || '0', 10);
      const scheduledDate =
        datePart ||
        getDateForTop(parsedTop);

      if (scheduledDate) {
        const prev = naByDate.get(scheduledDate) || { count: 0, userId: naUserId, topPx: parsedTop };
        prev.count += 1;
        if (!prev.userId && naUserId) prev.userId = naUserId;
        if (parsedTop < prev.topPx) prev.topPx = parsedTop;
        naByDate.set(scheduledDate, prev);
      }
    }

    for (const [naDate, info] of naByDate.entries()) {
      const userKey = (userName || info.userId || 'user').trim().replace(/\s+/g, '_');
      tasks.push({
        taskId: `notavailable-${userKey}-${naDate}`,
        title: 'Nedostupný / Volno',
        customName: 'Nedostupný / Volno',
        project: 'Absence / Svátek',
        userId: info.userId || columnUserId || '',
        userName,
        totalHours: info.count,
        isPinned: false,
        taskType: 'other',
        dates: [naDate],
        isCompleted: false,
        isNotAvailable: true,
        topPx: info.topPx,
      });
    }

    tasks.sort((a, b) => {
      const aDate = a.dates && a.dates.length > 0 ? a.dates[0] : '';
      const bDate = b.dates && b.dates.length > 0 ? b.dates[0] : '';
      if (aDate && bDate && aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return (a.topPx ?? 0) - (b.topPx ?? 0);
    });

    return tasks;
  }

  /**
   * Deduplicates tasks sharing the same taskId across multiple day slices
   */
  private deduplicateTasks(tasks: PlanTaskItem[]): PlanTaskItem[] {
    const map = new Map<string, PlanTaskItem>();

    for (const t of tasks) {
      const key = t.taskIdentifier
        ? `ident-${t.taskIdentifier.toUpperCase()}`
        : t.taskId;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...t, dates: [...t.dates] });
      } else {
        // Keep highest totalHours if slice had partial
        if (t.totalHours > existing.totalHours) {
          existing.totalHours = t.totalHours;
        }
        if (t.estimatedHours && (!existing.estimatedHours || t.estimatedHours > existing.estimatedHours)) {
          existing.estimatedHours = t.estimatedHours;
        }
        if (t.worklogHours && (!existing.worklogHours || t.worklogHours > existing.worklogHours)) {
          existing.worklogHours = t.worklogHours;
        }
        if (typeof t.topPx === 'number') {
          if (typeof existing.topPx !== 'number' || t.topPx < existing.topPx) {
            existing.topPx = t.topPx;
          }
        }
        if (!existing.requirementId && t.requirementId) {
          existing.requirementId = t.requirementId;
        }
        if (!existing.taskIdentifier && t.taskIdentifier) {
          existing.taskIdentifier = t.taskIdentifier;
        }
        if (!existing.project && t.project) {
          existing.project = t.project;
        }
        if (!existing.author && t.author) {
          existing.author = t.author;
        }
        if (t.isCompleted) {
          existing.isCompleted = true;
        }
        if (t.isSolved) {
          existing.isSolved = true;
        }
        if (t.isGodday) {
          existing.isGodday = true;
        }
        if (t.isNotAvailable) {
          existing.isNotAvailable = true;
        }
        if (t.isCritical) {
          existing.isCritical = true;
        }
        if (!existing.userName && t.userName) {
          existing.userName = t.userName;
        }
        if (!existing.url && t.url) {
          existing.url = t.url;
        }
        for (const d of t.dates) {
          if (!existing.dates.includes(d)) {
            existing.dates.push(d);
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aDate = a.dates && a.dates.length > 0 ? a.dates[0] : '';
      const bDate = b.dates && b.dates.length > 0 ? b.dates[0] : '';
      if (aDate && bDate && aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return (a.topPx ?? 0) - (b.topPx ?? 0);
    });
  }

  /**
   * Compares current tasks with previous snapshot using stable fingerprints and fires Windows toast notifications
   */
  private checkDiffsAndNotify(
    currentTasks: PlanTaskItem[],
    currentUnassigned: PlanTaskItem[],
    planConfig: MagicPlanSettings
  ): {
    newTasks: string[];
    completedTasks: string[];
    changedTasks: string[];
  } {
    const config = this.store.getConfig();
    const notificationsEnabled = config.notifications?.enabled !== false && config.notifications?.magicplan !== false;

    const diffResult = {
      newTasks: [] as string[],
      completedTasks: [] as string[],
      changedTasks: [] as string[],
    };

    // Safety guard: if server returned 0 tasks for both (parsing issue or error), never wipe out known baseline
    if (currentTasks.length === 0 && currentUnassigned.length === 0) {
      return diffResult;
    }

    const formatTaskDesc = (t: PlanTaskItem): string => {
      const codePrefix = [t.requirementId, t.taskIdentifier].filter((c) => Boolean(c && c !== 'R0')).join(' / ');
      const label = codePrefix ? `[${codePrefix}] ` : (t.isGodday ? '[godday] ' : '');
      const hoursLabel = t.totalHours ? ` (${t.totalHours}h)` : '';
      return `${label}${t.customName || t.title}${hoursLabel}`;
    };

    const formatTaskTitle = (t: PlanTaskItem): string => {
      const codePrefix = [t.requirementId, t.taskIdentifier].filter((c) => Boolean(c && c !== 'R0')).join(' / ');
      const label = codePrefix ? `[${codePrefix}] ` : (t.isGodday ? '[godday] ' : '');
      return `${label}${t.customName || t.title}`;
    };

    const userColumns = (planConfig.userColumns && planConfig.userColumns.length > 0)
      ? planConfig.userColumns.map((u) => u.trim()).filter(Boolean)
      : (planConfig.userColumn?.trim() ? [planConfig.userColumn.trim()] : []);
    const currentUserName = (planConfig.currentUserColumn?.trim() || userColumns[0] || '').toLowerCase();

    const rawQueue = planConfig.unassignedColumn?.trim() || 'FK';
    const queuePerson = this.knownPersonsMap.get(rawQueue) || this.cachedData?.availablePersons?.find((p) => p.id === rawQueue);
    const cleanQueueName = queuePerson?.cleanName || queuePerson?.name || rawQueue;
    const queueName = cleanQueueName.toLowerCase().startsWith('nástěnk') || cleanQueueName.toLowerCase().startsWith('nasten')
      ? cleanQueueName
      : `Nástěnka (${cleanQueueName})`;

    const currentSnapshot = new Map<string, TrackedTaskSnapshot>();
    const currentMap = new Map<string, PlanTaskItem>();
    const currentUnassignedMap = new Map<string, PlanTaskItem>();

    const personsList = this.cachedData?.availablePersons || Array.from(this.knownPersonsMap.values());

    for (const t of currentTasks) {
      const fp = getTaskFingerprint(t);
      currentMap.set(fp, t);

      const key = getTaskBusinessKey(t);
      const isMe = isTaskForUser(t, currentUserName, personsList) || (!t.userName && !t.userId && userColumns.length <= 1);
      const location: 'me' | 'other' = isMe ? 'me' : 'other';
      const userName = t.userName?.trim() || (isMe ? 'Já' : 'Kolega');

      currentSnapshot.set(key, {
        key,
        location,
        userName,
        task: t,
        isSolved: Boolean(t.isSolved || t.isCompleted),
        isCritical: Boolean(t.isCritical),
        totalHours: t.totalHours || 0,
      });
    }

    for (const t of currentUnassigned) {
      const fp = getTaskFingerprint(t);
      currentUnassignedMap.set(fp, t);

      const key = getTaskBusinessKey(t);
      currentSnapshot.set(key, {
        key,
        location: 'queue',
        userName: queueName,
        task: t,
        isSolved: Boolean(t.isSolved || t.isCompleted),
        isCritical: Boolean(t.isCritical),
        totalHours: t.totalHours || 0,
      });
    }

    // On the very first run (no cache exists on disk), record baseline without spamming notifications
    if (this.previousSnapshot.size === 0) {
      this.previousSnapshot = currentSnapshot;
      this.previousMyTasks = currentMap;
      this.previousUnassignedTasks = currentUnassignedMap;
      this.saveDiskCache(currentTasks, currentUnassigned);
      return diffResult;
    }

    // 1. Process tasks present in current snapshot
    for (const [key, curr] of currentSnapshot) {
      const prev = this.previousSnapshot.get(key);
      const taskDesc = formatTaskDesc(curr.task);
      const taskTitle = formatTaskTitle(curr.task);

      if (!prev) {
        // Completely new task
        if (curr.location === 'queue') {
          // Situace 1: požadavek se objevil ve frontě
          diffResult.newTasks.push(`[${queueName}] ${taskDesc}`);
          if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
            notificationService.show({
              type: 'magicPlan',
              subType: curr.isCritical ? 'critical' : 'queue',
              title: curr.isCritical ? `Nový kritický požadavek ve frontě (${queueName})` : `Nový úkol ve frontě (${queueName})`,
              body: taskDesc,
              mpSituation: 1,
              isCritical: !!curr.isCritical,
              taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
            });
          }
        } else if (curr.location === 'me') {
          // Situace 2: požadavek se objevil u mě (při předchozím načtení v plánu nebyl)
          diffResult.newTasks.push(taskDesc);
          if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
            notificationService.show({
              type: 'magicPlan',
              subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
              title: curr.isCritical ? 'Nový kritický požadavek v plánu' : 'Nový požadavek v plánu',
              body: taskDesc,
              mpSituation: 2,
              isCritical: !!curr.isCritical,
              taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
            });
          }
        } else {
          // Situace 5: požadavek se objevil u kolegy (při předchozím načtení v plánu nebyl)
          diffResult.newTasks.push(`[${curr.userName}] ${taskDesc}`);
          if (notificationsEnabled && planConfig.notifyColleagueTasks !== false) {
            notificationService.show({
              type: 'magicPlan',
              subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
              title: curr.isCritical ? `${curr.userName} má nový kritický úkol` : `${curr.userName} má nový úkol v plánu`,
              body: taskDesc,
              mpSituation: 5,
              isCritical: !!curr.isCritical,
              taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
            });
          }
        }
      } else {
        // Existing task - check movements & state changes
        const locationChanged = prev.location !== curr.location;
        const colleagueChanged = prev.location === 'other' && curr.location === 'other' && prev.userName !== curr.userName;

        if (locationChanged || colleagueChanged) {
          if (prev.location === 'queue' && curr.location === 'me') {
            // Situace 3: požadavek se objevil u mě a byl ve frontě
            diffResult.newTasks.push(taskDesc);
            if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? 'Přiřazení kritického úkolu z fronty' : 'Přiřazení úkolu z fronty',
                body: taskDesc,
                mpSituation: 3,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          } else if (prev.location === 'queue' && curr.location === 'other') {
            // Situace 6: požadavek se objevil u kolegy a byl ve frontě
            diffResult.newTasks.push(`[${curr.userName}] ${taskDesc}`);
            if (notificationsEnabled && planConfig.notifyColleagueTasks !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? `${curr.userName} byl přiřazen kritický úkol` : `${curr.userName} byl přiřazen úkol z fronty`,
                body: taskDesc,
                mpSituation: 6,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          } else if (prev.location === 'me' && curr.location === 'queue') {
            // Situace 9: požadavek se objevil ve frontě a byl u mě
            diffResult.newTasks.push(`[${queueName}] ${taskDesc}`);
            if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : 'queue',
                title: curr.isCritical ? 'Váš kritický úkol byl vrácen do fronty' : 'Váš úkol byl vrácen do fronty',
                body: taskDesc,
                mpSituation: 9,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          } else if (prev.location === 'other' && curr.location === 'queue') {
            // Situace 10: požadavek se objevil ve frontě a byl u kolegy
            // Bez zapnutí notifikace kolegů se bere jako nový úkol ve frontě (Situace 1)
            diffResult.newTasks.push(`[${queueName}] ${taskDesc}`);
            if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
              const notifyColleagues = planConfig.notifyColleagueTasks !== false;
              if (notifyColleagues) {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : 'queue',
                  title: curr.isCritical ? `Kritický úkol od ${prev.userName} byl vrácen do fronty` : `Úkol od ${prev.userName} byl vrácen do fronty`,
                  body: taskDesc,
                  mpSituation: 10,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              } else {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : 'queue',
                  title: curr.isCritical ? 'Kritický úkol ve frontě (Nástěnka)' : 'Nový úkol ve frontě (Nástěnka)',
                  body: taskDesc,
                  mpSituation: 1,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              }
            }
          } else if (prev.location === 'other' && curr.location === 'me') {
            // Situace 4: požadavek se objevil u mě a byl u kolegy
            // Bez zapnutí notifikace kolegů se úkol od kolegy bere jako požadavek z fronty (Situace 3)
            diffResult.newTasks.push(taskDesc);
            if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
              const notifyColleagues = planConfig.notifyColleagueTasks !== false;
              if (notifyColleagues) {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                  title: curr.isCritical ? `Kritický úkol od ${prev.userName} byl přiřazen k vám` : `Úkol od ${prev.userName} byl přiřazen k vám`,
                  body: taskDesc,
                  mpSituation: 4,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              } else {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                  title: curr.isCritical ? 'Přiřazení kritického úkolu z fronty' : 'Přiřazení úkolu z fronty',
                  body: taskDesc,
                  mpSituation: 3,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              }
            }
          } else if (prev.location === 'me' && curr.location === 'other') {
            // Situace 7: požadavek se objevil u kolegy a byl u mě
            // Pokud jsou notifikace kolegů vypnuté, úkol byl odebrán z mého sloupce (fallback na Situaci 9 - vrácen/odebrán)
            if (notificationsEnabled && planConfig.notifyNewTasks !== false) {
              const notifyColleagues = planConfig.notifyColleagueTasks !== false;
              if (notifyColleagues) {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                  title: curr.isCritical ? `${curr.userName} převzal váš kritický úkol` : `${curr.userName} převzal váš úkol`,
                  body: taskDesc,
                  mpSituation: 7,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              } else {
                notificationService.show({
                  type: 'magicPlan',
                  subType: curr.isCritical ? 'critical' : 'queue',
                  title: curr.isCritical ? 'Váš kritický úkol byl vrácen do fronty' : 'Váš úkol byl vrácen do fronty',
                  body: taskDesc,
                  mpSituation: 9,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              }
            }
          } else if (colleagueChanged) {
            // Situace 8: požadavek se objevil u kolegy a byl u jiného kolegy
            diffResult.newTasks.push(`[${curr.userName}] ${taskDesc}`);
            if (notificationsEnabled && planConfig.notifyColleagueTasks !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? `Kritický úkol přesunut: ${prev.userName} ➜ ${curr.userName}` : `Úkol přesunut od ${prev.userName} k ${curr.userName}`,
                body: taskDesc,
                mpSituation: 8,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          }
        }

        // Change to critical / non-critical
        if (!prev.isCritical && curr.isCritical) {
          diffResult.changedTasks.push(`[Kritický] ${taskDesc}`);
          if (notificationsEnabled && planConfig.notifyTaskChanges !== false) {
            if (curr.location === 'queue') {
              // Situace 17: ve frontě se změnil úkol na kritický
              notificationService.show({
                type: 'magicPlan',
                subType: 'critical',
                title: 'Úkol ve frontě změněn na kritický!',
                body: `${taskDesc} (nově priorita 1)`,
                mpSituation: 17,
                isCritical: true,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            } else if (curr.location === 'me') {
              // Situace 18: u mě se změnil úkol na kritický
              notificationService.show({
                type: 'magicPlan',
                subType: 'critical',
                title: 'Váš úkol označen jako kritický!',
                body: `${taskDesc} (přiřazena priorita 1)`,
                mpSituation: 18,
                isCritical: true,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          }
        } else if (prev.isCritical && !curr.isCritical) {
          diffResult.changedTasks.push(`[Zrušena priorita] ${taskDesc}`);
          if (notificationsEnabled && planConfig.notifyTaskChanges !== false) {
            if (curr.location === 'queue') {
              // Situace 19: ve frontě se změnil úkol na nekritický
              notificationService.show({
                type: 'magicPlan',
                subType: 'queue',
                title: 'Úkol ve frontě již není kritický',
                body: `${taskDesc} (priorita snížena na běžnou)`,
                mpSituation: 19,
                isCritical: false,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            } else if (curr.location === 'me') {
              // Situace 20: u mě se změnil úkol na nekritický
              notificationService.show({
                type: 'magicPlan',
                subType: curr.task.taskType === 'service' ? 'service' : 'dev',
                title: 'U vašeho úkolu zrušena kritická priorita',
                body: `${taskDesc} (priorita snížena na běžnou)`,
                mpSituation: 20,
                isCritical: false,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          }
        }

        // Newly marked as solved while in place
        if (!prev.isSolved && curr.isSolved) {
          diffResult.completedTasks.push(taskTitle);
          if (notificationsEnabled && planConfig.notifyCompletedTasks !== false) {
            if (curr.location === 'me') {
              // Situace 14: úkol u mě změnil stav na solved
              notificationService.show({
                type: 'magicPlan',
                subType: 'completed',
                title: 'Úkol v plánu splněn',
                body: taskTitle,
                mpSituation: 14,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            } else if (curr.location === 'other') {
              // Situace 16: kolegovi úkol přepnul stav na solved
              if (planConfig.notifyColleagueTasks !== false) {
                notificationService.show({
                  type: 'magicPlan',
                  subType: 'completed',
                  title: `${curr.userName} označil úkol za splněný`,
                  body: taskTitle,
                  mpSituation: 16,
                  isCritical: !!curr.isCritical,
                  taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
                });
              }
            }
          }
        }

        // Hours changed
        if (curr.location === 'me' && !curr.isSolved && prev.totalHours !== curr.totalHours) {
          if (curr.totalHours > prev.totalHours) {
            // Situace 11: požadavek u mě změnil čas na vyšší
            diffResult.changedTasks.push(`${taskTitle} (navýšeno: ${prev.totalHours}h → ${curr.totalHours}h)`);
            if (notificationsEnabled && planConfig.notifyTaskChanges !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? 'Zvýšení času u kritického úkolu' : 'Zvýšení odhadu času úkolu',
                body: `${taskTitle} (navýšeno: ${prev.totalHours}h → ${curr.totalHours}h)`,
                mpSituation: 11,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          } else {
            // Situace 12: požadavek u mě změnil čas na nižší
            diffResult.changedTasks.push(`${taskTitle} (zkráceno: ${prev.totalHours}h → ${curr.totalHours}h)`);
            if (notificationsEnabled && planConfig.notifyTaskChanges !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? 'Snížení času u kritického úkolu' : 'Snížení odhadu času úkolu',
                body: `${taskTitle} (zkráceno: ${prev.totalHours}h → ${curr.totalHours}h)`,
                mpSituation: 12,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          }
        } else if (curr.location === 'other' && !curr.isSolved && prev.totalHours !== curr.totalHours) {
          if (curr.totalHours > prev.totalHours) {
            diffResult.changedTasks.push(`[${curr.userName}] ${taskTitle} (navýšeno: ${prev.totalHours}h → ${curr.totalHours}h)`);
            if (notificationsEnabled && planConfig.notifyColleagueTasks !== false && planConfig.notifyTaskChanges !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? `${curr.userName}: Zvýšení času u kritického úkolu` : `${curr.userName}: Zvýšení odhadu času úkolu`,
                body: `${taskTitle} (navýšeno: ${prev.totalHours}h → ${curr.totalHours}h)`,
                mpSituation: 11,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          } else {
            diffResult.changedTasks.push(`[${curr.userName}] ${taskTitle} (zkráceno: ${prev.totalHours}h → ${curr.totalHours}h)`);
            if (notificationsEnabled && planConfig.notifyColleagueTasks !== false && planConfig.notifyTaskChanges !== false) {
              notificationService.show({
                type: 'magicPlan',
                subType: curr.isCritical ? 'critical' : (curr.task.taskType === 'service' ? 'service' : 'dev'),
                title: curr.isCritical ? `${curr.userName}: Snížení času u kritického úkolu` : `${curr.userName}: Snížení odhadu času úkolu`,
                body: `${taskTitle} (zkráceno: ${prev.totalHours}h → ${curr.totalHours}h)`,
                mpSituation: 12,
                isCritical: !!curr.isCritical,
                taskType: curr.task.taskType === 'service' ? 'service' : 'dev',
              });
            }
          }
        }
      }
    }

    // 2. Process tasks that disappeared from the plan
    for (const [key, prev] of this.previousSnapshot) {
      if (!currentSnapshot.has(key)) {
        const prevTaskTitle = formatTaskTitle(prev.task);

        if (prev.location === 'queue') {
          // Disappeared from queue without being assigned to monitored columns: no notification
          continue;
        }

        // If the task was ALREADY solved, its disappearance is expected and MUST NOT be notified
        if (prev.isSolved) {
          continue;
        }

        // An unsolved task disappeared from ME or OTHER without returning to queue: it was completed/solved!
        if (prev.location === 'me') {
          // Situace 13: úkol u mě zmizel a neobjevil se jinde
          diffResult.completedTasks.push(prevTaskTitle);
          if (notificationsEnabled && planConfig.notifyCompletedTasks !== false) {
            notificationService.show({
              type: 'magicPlan',
              subType: 'completed',
              title: 'Úkol v plánu vyřešen',
              body: prevTaskTitle,
              mpSituation: 13,
              isCritical: !!prev.isCritical,
              taskType: prev.task.taskType === 'service' ? 'service' : 'dev',
            });
          }
        } else if (prev.location === 'other') {
          // Situace 15: kolegovi zmizel úkol a nikde jinde se neobjevil
          diffResult.completedTasks.push(`[${prev.userName}] ${prevTaskTitle}`);
          if (notificationsEnabled && planConfig.notifyCompletedTasks !== false && planConfig.notifyColleagueTasks !== false) {
            notificationService.show({
              type: 'magicPlan',
              subType: 'completed',
              title: `${prev.userName} dokončil úkol`,
              body: prevTaskTitle,
              mpSituation: 15,
              isCritical: !!prev.isCritical,
              taskType: prev.task.taskType === 'service' ? 'service' : 'dev',
            });
          }
        }
      }
    }

    this.previousSnapshot = currentSnapshot;
    this.previousMyTasks = currentMap;
    this.previousUnassignedTasks = currentUnassignedMap;
    this.saveDiskCache(currentTasks, currentUnassigned);
    return diffResult;
  }

  /**
   * Sends updated plan data to all open BrowserWindow instances
   */
  private broadcastData(data: MagicPlanData): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('magicplan:data-updated', data);
      }
    }
  }
}
