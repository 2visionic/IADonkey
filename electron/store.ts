import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { AppConfig, LauncherItem } from '../src/types';

const USER_DATA_PATH = app?.getPath
  ? app.getPath('userData')
  : path.join(process.cwd(), '.user_data');

if (!fs.existsSync(USER_DATA_PATH)) {
  fs.mkdirSync(USER_DATA_PATH, { recursive: true });
}

const CONFIG_FILE = path.join(USER_DATA_PATH, 'config.json');
const ITEMS_FILE = path.join(USER_DATA_PATH, 'items_cache.json');
const ICONS_FILE = path.join(USER_DATA_PATH, 'icons_cache.json');

const DEFAULT_CONFIG: AppConfig = {
  hotkey: 'Ctrl+Alt+Space',
  developMode: false,
  sources: [],
  magicgate: {
    username: '',
    password: '',
    sourceMode: 'xml',
    apiBaseUrl: '',
    enableFtp: true,
    allowFtpWithoutSlash: false,
  },
  mlog: {
    baseUrl: '',
    taskPrefix: 'T',
    requestPrefix: 'R',
  },
  github: {
    authMode: 'pat',
    username: '',
    token: '',
    clientId: 'Ov23liKwJB5JD7CEPsO3',
    oauthToken: '',
    org: '',
    apiUrl: 'https://api.github.com',
    defaultCloneDir: '',
  },
  vscode: {
    path: '',
  },
  androidStudio: {
    path: '',
  },
  ssms: {
    path: '',
    allowWithoutSlash: false,
    localServer: 'localhost',
    authMode: 'windows',
    sqlUsername: '',
    sqlPassword: '',
    recentDatabases: [],
  },
  donkeyTools: {
    colorMaster: {
      enabled: false,
      hotkey: '',
      defaultFormat: 'hex',
    },
    quickCap: {
      enabled: false,
      hotkey: '',
      saveDirectory: '',
    },
    screenRuler: {
      enabled: false,
      hotkey: '',
      defaultUnit: 'px',
      color: '#f43f5e',
      overlayColor: '#f43f5e',
    },
    easyClip: {
      enabled: false,
      hotkey: '',
      maxItems: 50,
    },
  },
  extensions: {
    magicgate: false,
    mlog: false,
    github: false,
    vscode: false,
    androidStudio: false,
    ssms: false,
    donkeyTools: false,
    magicplan: false,
  },
  magicplan: {
    enabled: false,
    url: '',
    userColumn: '',
    unassignedColumn: '',
    authorFilter: '',
    pollIntervalMinutes: 2,
    notifyNewTasks: true,
    notifyCompletedTasks: true,
    notifyTaskChanges: true,
    notifyQueueTasks: true,
    linkWithTaskManager: true,
  },
  notifications: {
    enabled: true,
    silent: false,
    quickCap: true,
    colorMaster: true,
    screenRuler: true,
    syncComplete: true,
    updates: true,
    clipboard: true,
    errors: true,
    magicplan: true,
    feedback: true,
  },
  updateUrl: 'https://raw.githubusercontent.com/magicware/IADonkey/main/version.json',
  lastDeclinedVersion: null,
  lastDeclinedTime: null,
  autoSyncIntervalMinutes: 30,
  primaryColor: '#6366f1',
  actionsColor: '#a855f7',
  lastSeenVersion: null,
  searchInstalledApps: true,
  searchGoogle: true,
  defaultSearchEngine: 'google',
  defaultBrowserPath: '',
};

import { tryImportWoxCredentials } from './magicGate';

export class AppStore {
  private config: AppConfig;
  private items: LauncherItem[];

  constructor() {
    this.config = this.loadConfig();
    this.items = this.loadItems();
  }

  private loadConfig(): AppConfig {
    let cfg = { ...DEFAULT_CONFIG };
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        cfg = { ...DEFAULT_CONFIG, ...parsed };

        if (parsed.magicgate) {
          cfg.magicgate = {
            ...DEFAULT_CONFIG.magicgate,
            ...parsed.magicgate,
          };
          if (
            cfg.magicgate.apiAuthCookie &&
            cfg.magicgate.apiAuthCookie.startsWith('enc:') &&
            safeStorage?.isEncryptionAvailable?.()
          ) {
            try {
              const encryptedBuf = Buffer.from(cfg.magicgate.apiAuthCookie.slice(4), 'base64');
              cfg.magicgate.apiAuthCookie = safeStorage.decryptString(encryptedBuf);
            } catch (decErr) {
              console.warn('[Store] Failed to decrypt MagicGate apiAuthCookie:', decErr);
            }
          }
        }

        if (parsed.ssms) {
          cfg.ssms = {
            ...DEFAULT_CONFIG.ssms,
            ...parsed.ssms,
          };
          if (
            cfg.ssms?.sqlPassword &&
            cfg.ssms.sqlPassword.startsWith('enc:') &&
            safeStorage?.isEncryptionAvailable?.()
          ) {
            try {
              const encryptedBuf = Buffer.from(cfg.ssms.sqlPassword.slice(4), 'base64');
              cfg.ssms.sqlPassword = safeStorage.decryptString(encryptedBuf);
            } catch (decErr) {
              console.warn('[Store] Failed to decrypt SSMS sqlPassword:', decErr);
            }
          }
        }

        if (parsed.donkeyTools) {
          cfg.donkeyTools = {
            ...DEFAULT_CONFIG.donkeyTools,
            ...parsed.donkeyTools,
            colorMaster: { ...DEFAULT_CONFIG.donkeyTools?.colorMaster, ...parsed.donkeyTools?.colorMaster },
            quickCap: { ...DEFAULT_CONFIG.donkeyTools?.quickCap, ...parsed.donkeyTools?.quickCap },
            screenRuler: { ...DEFAULT_CONFIG.donkeyTools?.screenRuler, ...parsed.donkeyTools?.screenRuler },
            easyClip: { ...DEFAULT_CONFIG.donkeyTools?.easyClip, ...parsed.donkeyTools?.easyClip },
          };
        }

        if (parsed.notifications) {
          cfg.notifications = {
            ...DEFAULT_CONFIG.notifications,
            ...parsed.notifications,
          };
        }
      }

      // Backward compatibility / migration for default search engine
      if (cfg.defaultSearchEngine === undefined) {
        cfg.defaultSearchEngine = cfg.searchGoogle === false ? 'none' : 'google';
      }

      // Auto-migrate legacy / dummy placeholder repository URL
      if (!cfg.updateUrl || cfg.updateUrl.includes('iadonkey/launcher')) {
        cfg.updateUrl = DEFAULT_CONFIG.updateUrl;
      }

      // Backward compatibility / migration for extensions:
      // If user had MLog or MagicGate configured, automatically enable the extension and persist to disk
      let hasModifiedExtensions = false;
      if (!cfg.extensions) {
        cfg.extensions = {
          magicgate: !!(cfg.magicgate?.username?.trim() || cfg.magicgate?.xmlPath?.trim()),
          mlog: !!(cfg.mlog?.baseUrl?.trim()),
          github: !!(cfg.github?.token?.trim()),
        };
        hasModifiedExtensions = true;
      } else {
        if (cfg.extensions.magicgate === undefined) {
          cfg.extensions.magicgate = !!(cfg.magicgate?.username?.trim() || cfg.magicgate?.xmlPath?.trim());
          hasModifiedExtensions = true;
        }
        if (cfg.extensions.mlog === undefined) {
          cfg.extensions.mlog = !!(cfg.mlog?.baseUrl?.trim());
          hasModifiedExtensions = true;
        }
        if (cfg.extensions.github === undefined) {
          cfg.extensions.github = !!(cfg.github?.token?.trim());
          hasModifiedExtensions = true;
        }
        if (cfg.extensions.magicplan === undefined) {
          cfg.extensions.magicplan = false;
          hasModifiedExtensions = true;
        }
      }

      if (hasModifiedExtensions) {
        try {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
        } catch {}
      }
    } catch (err) {
      console.error('[Store] Failed to load config, falling back to defaults:', err);
    }

    // Auto-prefill MagicGate credentials from Wox if empty
    if (!cfg.magicgate?.username || !cfg.magicgate?.password) {
      const wox = tryImportWoxCredentials();
      if (wox && (wox.username || wox.password)) {
        cfg.magicgate = {
          ...cfg.magicgate,
          username: cfg.magicgate?.username || wox.username,
          password: cfg.magicgate?.password || wox.password,
        };
        try {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
        } catch {}
      }
    }

    return cfg;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public saveConfig(newConfig: AppConfig): void {
    try {
      const prevMg = this.config?.magicgate;
      const nextMg = newConfig?.magicgate;
      const mergedMagicgate = nextMg
        ? {
            ...prevMg,
            ...nextMg,
            apiAuthCookie:
              nextMg.apiAuthCookie !== undefined &&
              (nextMg.apiAuthCookie !== '' || nextMg.apiUserEmail === '')
                ? nextMg.apiAuthCookie
                : prevMg?.apiAuthCookie,
            apiUserEmail:
              nextMg.apiUserEmail !== undefined ? nextMg.apiUserEmail : prevMg?.apiUserEmail,
            apiUserRole:
              nextMg.apiUserRole !== undefined ? nextMg.apiUserRole : prevMg?.apiUserRole,
            lastApiSyncAt:
              nextMg.lastApiSyncAt !== undefined ? nextMg.lastApiSyncAt : prevMg?.lastApiSyncAt,
            apiInstanceCount:
              nextMg.apiInstanceCount !== undefined
                ? nextMg.apiInstanceCount
                : prevMg?.apiInstanceCount,
          }
        : prevMg;

      this.config = {
        ...this.config,
        ...newConfig,
        magicgate: mergedMagicgate as any,
      };
      const diskConfig: AppConfig = {
        ...this.config,
        magicgate: this.config.magicgate ? { ...this.config.magicgate } : this.config.magicgate,
        ssms: this.config.ssms ? { ...this.config.ssms } : this.config.ssms,
      };
      if (
        diskConfig.magicgate?.apiAuthCookie &&
        !diskConfig.magicgate.apiAuthCookie.startsWith('enc:') &&
        safeStorage?.isEncryptionAvailable?.()
      ) {
        try {
          const enc = safeStorage.encryptString(diskConfig.magicgate.apiAuthCookie).toString('base64');
          diskConfig.magicgate.apiAuthCookie = `enc:${enc}`;
        } catch {}
      }
      if (
        diskConfig.ssms?.sqlPassword &&
        !diskConfig.ssms.sqlPassword.startsWith('enc:') &&
        safeStorage?.isEncryptionAvailable?.()
      ) {
        try {
          const enc = safeStorage.encryptString(diskConfig.ssms.sqlPassword).toString('base64');
          diskConfig.ssms.sqlPassword = `enc:${enc}`;
        } catch {}
      }
      const tmpFile = `${CONFIG_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(diskConfig, null, 2), 'utf-8');
      fs.renameSync(tmpFile, CONFIG_FILE);
    } catch (err) {
      console.error('[Store] Failed to save config:', err);
    }
  }

  private loadItems(): LauncherItem[] {
    try {
      if (fs.existsSync(ITEMS_FILE)) {
        const raw = fs.readFileSync(ITEMS_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[Store] Failed to load cached items:', err);
    }
    return [];
  }

  public getItems(): LauncherItem[] {
    return this.items;
  }

  public saveItems(items: LauncherItem[]): void {
    try {
      this.items = items;
      const tmpFile = `${ITEMS_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(items, null, 2), 'utf-8');
      fs.renameSync(tmpFile, ITEMS_FILE);
    } catch (err) {
      console.error('[Store] Failed to save items to cache:', err);
    }
  }

  public getMaterialIcons(): any[] | null {
    try {
      if (fs.existsSync(ICONS_FILE)) {
        const raw = fs.readFileSync(ICONS_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[Store] Failed to load cached icons:', err);
    }
    return null;
  }

  public saveMaterialIcons(icons: any[]): void {
    try {
      const tmpFile = `${ICONS_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(icons), 'utf-8');
      fs.renameSync(tmpFile, ICONS_FILE);
    } catch (err) {
      console.error('[Store] Failed to save icons to cache:', err);
    }
  }
}
