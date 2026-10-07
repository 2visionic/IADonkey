export interface LauncherAction {
  name: string;
  action: 'open' | 'clone' | 'clonerecursive' | 'copy' | string;
  location?: string | null;
  icon?: string | null;
  settings?: 'git' | string | null;
}

export interface LauncherItem {
  id?: string;
  name: string;
  location?: string | null;
  action?: 'open' | 'copy' | string | null;
  icon?: string | null;
  image?: string | null;
  priority?: number | null;
  settings?: 'magicgate' | 'git' | string | null;
  sourceId?: string;
  options?: LauncherItem[];
  shortcuts?: string[];
  actions?: LauncherAction[];
  info?: Record<string, any>;
  colorPreview?: string;
  imagePreview?: string;
}

export type SourceType = 'file' | 'api' | 'static';

export interface FieldMappingRule {
  type: 'field' | 'fixed';
  value: string;
}

export type MappingTargetKey = 'name' | 'location' | 'action' | 'icon' | 'image' | 'priority' | 'settings';

export interface SourceFieldMapping {
  name?: FieldMappingRule;
  location?: FieldMappingRule;
  action?: FieldMappingRule;
  icon?: FieldMappingRule;
  image?: FieldMappingRule;
  priority?: FieldMappingRule;
  settings?: FieldMappingRule;
}

export interface BaseSource {
  id: string;
  name: string;
  type: SourceType;
  enabled: boolean;
  lastSync?: string;
  itemCount?: number;
  error?: string;
  mapping?: SourceFieldMapping;
}

export interface FileSource extends BaseSource {
  type: 'file';
  path: string;
}

export interface ApiSource extends BaseSource {
  type: 'api';
  url: string;
  authType: 'none' | 'getToken';
  tokenUrl?: string;
  tokenUsername?: string;
  tokenPassword?: string;
  tokenPayload?: string; // Optional custom JSON payload
  cachedToken?: string;
  tokenExpiresAt?: number;
}

export interface StaticSource extends BaseSource {
  type: 'static';
  sharedParams?: Record<string, string>;
  items: LauncherItem[];
}

export type DataSource = FileSource | ApiSource | StaticSource;

export interface MagicGateSettings {
  username: string;
  password: string;
  xmlPath?: string;
  instanceSourceCodesPath?: string;
}

export interface MlogSettings {
  baseUrl: string;
  taskPrefix?: string;
  requestPrefix?: string;
}

export interface ExtensionsConfig {
  magicgate: boolean;
  mlog: boolean;
  github: boolean;
  vscode?: boolean;
  androidStudio?: boolean;
  donkeyTools?: boolean;
  magicplan?: boolean;
}

export interface MagicPlanSettings {
  enabled?: boolean;
  url?: string;
  urls?: string[];
  userColumn?: string;
  userColumns?: string[];
  currentUserColumn?: string;
  unassignedColumn?: string;
  pollIntervalMinutes?: number;
  notifyNewTasks?: boolean;
  notifyCompletedTasks?: boolean;
  notifyTaskChanges?: boolean;
  notifyQueueTasks?: boolean;
  notifyColleagueTasks?: boolean;
  linkWithTaskManager?: boolean;
  timelineTimeMode?: 'real8h' | 'custom';
  timelineCustomStart?: string;
  timelineCustomEnd?: string;
  showAllTasks?: boolean;
  compactDayView?: boolean;
  worklogUrl?: string;
  showWorklogProgressBar?: boolean;
}

export interface PlanDayInfo {
  date: string;
  dayLabel: string;
  isWeekend: boolean;
  isToday: boolean;
}

export interface PlanTaskItem {
  taskId: string;
  requirementId?: string; // e.g. "R134695"
  taskIdentifier?: string; // e.g. "T789857"
  title: string;
  customName?: string;
  project?: string;
  userId: string;
  userName: string;
  totalHours: number;
  estimatedHours?: number;
  worklogHours?: number;
  isPinned: boolean;
  isSolved?: boolean;
  taskType: 'dev' | 'service' | 'other';
  dates: string[];
  url?: string;
  author?: string; // Zadavatel / zkratka zadavatele (např. VM)
  isCompleted?: boolean;
  isNotAvailable?: boolean;
  isCritical?: boolean; // priority-1 in planning HTML (critical priority)
  isGodday?: boolean;
  topPx?: number; // Svislá pozice v pixelovém rozvrhu HTML stránky
}

export interface PlanPersonInfo {
  id: string;
  name: string;
  cleanName?: string;
  shortcut?: string;
}

export interface WorklogTimelineEntry {
  date: string;          // e.g. "2026-10-07"
  userName: string;      // e.g. "Petr Kulhánek"
  reqId?: string;        // e.g. "R134497"
  taskId: string;        // e.g. "T788343" (nebo parentTaskId)
  parentTaskId?: string; // explicitní hodnota z data-parenttaskid pokud existuje
  title?: string;
  project?: string;
  isService: boolean;
  isDev: boolean;
  hours: number;         // e.g. 1.54
  timeEnd: string;       // "08:28"
  timeStart: string;     // "06:56"
  description?: string;
  isGap?: boolean;
}

export interface MagicPlanData {
  planNumber?: string;
  planRange?: string;
  days?: PlanDayInfo[];
  lastChecked: string;
  myTasks: PlanTaskItem[];
  unassignedTasks: PlanTaskItem[];
  totalMyHours: number;
  availablePersons?: PlanPersonInfo[];
  dailyUserWorklogs?: Record<string, Record<string, number>>;
  worklogTimelineEntries?: WorklogTimelineEntry[];
  error?: string;
  isOffline?: boolean;
}

export interface ColorPalette {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  colors: (string | null)[];
}

export interface ColorMasterSettings {
  enabled: boolean;
  hotkey?: string;
  paletteHotkey?: string;
  defaultFormat?: 'hex' | 'hex8' | 'hex-no-hash' | 'rgb' | 'rgba' | 'hsl';
}

export interface QuickCapSettings {
  enabled: boolean;
  hotkey?: string;
  saveDirectory?: string;
}

export type FastSnapSettings = QuickCapSettings;

export interface QuickCapRecentItem {
  name: string;
  path: string;
  createdAt: number;
  size: number;
  dataUrl?: string;
  width?: number;
  height?: number;
}

export type FastSnapRecentItem = QuickCapRecentItem;

export interface ScreenRulerSettings {
  enabled: boolean;
  hotkey?: string;
  defaultUnit?: 'px' | '%' | 'dp';
  color?: string;
  overlayColor?: string;
}

export interface EasyClipSettings {
  enabled: boolean;
  hotkey?: string;
  maxItems?: number;
}

export interface EasyClipItem {
  id: string;
  type: 'text' | 'image';
  text?: string;
  dataUrl?: string;
  filePath?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  previewText?: string;
  lineCount?: number;
  charCount?: number;
  timestamp: number;
}

export interface DonkeyToolsSettings {
  colorMaster?: ColorMasterSettings;
  quickCap?: QuickCapSettings;
  fastSnap?: QuickCapSettings;
  screenRuler?: ScreenRulerSettings;
  easyClip?: EasyClipSettings;
}

export interface VscodeSettings {
  path?: string;
}

export interface AndroidStudioSettings {
  path?: string;
}

export type GitHubAuthMode = 'pat' | 'oauth';

export interface GitHubOAuthUser {
  login: string;
  name?: string;
  avatar_url?: string;
}

export interface GithubSettings {
  authMode?: GitHubAuthMode;
  username?: string;
  token: string;
  clientId?: string;
  oauthToken?: string;
  oauthUser?: GitHubOAuthUser;
  org?: string;
  apiUrl?: string;
  defaultCloneDir?: string;
}

export interface BannedItem {
  id?: string;
  name: string;
  location?: string | null;
  sourceId?: string | null;
  bannedAt: string;
}

export interface NotificationSettings {
  enabled: boolean;
  silent?: boolean;
  quickCap?: boolean;
  colorMaster?: boolean;
  screenRuler?: boolean;
  syncComplete?: boolean;
  updates?: boolean;
  clipboard?: boolean;
  errors?: boolean;
  magicplan?: boolean;
}

export interface AppConfig {
  hotkey: string;
  sources: DataSource[];
  magicgate: MagicGateSettings;
  mlog?: MlogSettings;
  github?: GithubSettings;
  vscode?: VscodeSettings;
  androidStudio?: AndroidStudioSettings;
  extensions?: ExtensionsConfig;
  donkeyTools?: DonkeyToolsSettings;
  magicplan?: MagicPlanSettings;
  notifications?: NotificationSettings;
  feedback?: import('./feedback').FeedbackSettings;
  banlist?: BannedItem[];
  updateUrl: string;
  lastDeclinedVersion: string | null;
  lastDeclinedTime: number | null;
  autoSyncIntervalMinutes: number;
  lastSyncTime?: string | null;
  primaryColor?: string;
  actionsColor?: string;
  lastSeenVersion?: string | null;
  searchInstalledApps?: boolean;
  searchGoogle?: boolean;
  defaultSearchEngine?: string;
  snippets?: SnippetsConfig;
  colorPalettes?: ColorPalette[];
  iconsLastDownloadedAt?: string | null;
  iconsCount?: number;
}

export interface MaterialIconDef {
  name: string;
  category: string;
  tags: string[];
}

export interface CustomSnippet {
  id: string;
  name: string;
  location: string;
  icon?: string;
  shortcuts: string[];
}

export interface SnippetsConfig {
  signature?: string;
  name?: string;
  ico?: string;
  dic?: string;
  address?: string;
  phone?: string;
  email?: string;
  custom?: CustomSnippet[];
}

export interface SyncProgress {
  total: number;
  current: number;
  percentage: number;
  sourceName?: string;
  isComplete: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  releaseNotes?: string;
  downloadUrl?: string;
  isSimulated?: boolean;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  type: 'shortcut' | 'color-picker' | 'color-master' | 'action' | 'window' | 'sync' | 'error' | 'options' | 'ui';
  title: string;
  details?: string;
  status: 'success' | 'error' | 'warn' | 'info';
}

export interface CrashLogEntry {
  id: string;
  fileName: string;
  filePath: string;
  timestamp: string;
  action: string;
  errorSnippet: string;
  fullContent: string;
}

export * from './feedback';
