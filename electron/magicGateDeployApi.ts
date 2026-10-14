import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import type { LauncherItem, MagicGateSettings } from '../src/types';

const USER_DATA_PATH = app?.getPath
  ? app.getPath('userData')
  : path.join(process.cwd(), '.user_data');

const DEPLOY_CACHE_FILE = path.join(USER_DATA_PATH, 'magicgate_deploy_cache.json');

export const DEFAULT_DEPLOY_BASE_URL = '';

export interface DeployInstance {
  id: number;
  name: string;
  instanceRoot?: string;
  path?: string;
  agentId: number;
  productId?: string;
  currentVersion?: string | null;
  currentVersionBuiltAt?: string | null;
  version?: string | null;
  missingSince?: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  adminUrls?: string[];
  webUrls?: string[];
  dbServerName?: string | null;
  database?: string | null;
  meta?: {
    database?: string;
    iis?: string;
    dialect?: string;
    [key: string]: any;
  };
  resourceKeys?: string[];
  deployWindow?: string | null;
  converted?: boolean;
  properties?: Record<string, string>;
}

export interface DeployAgent {
  id: number;
  name: string;
  machineName?: string;
  agentVersion?: string;
  pwshVersion?: string;
  ring?: string;
  lastSeenAt?: string;
  revoked?: boolean;
  identityNote?: string | null;
  discoveryError?: string | null;
  properties?: Record<string, string>;
  instances?: DeployInstance[];
}

export interface DeployMeInfo {
  signedIn: boolean;
  email?: string;
  name?: string;
  role?: string;
  allowedDomain?: string;
  googleConfigured?: boolean;
  version?: string;
}

export function normalizeDeployBaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function getHostnameLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
}

function isValidHttpUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed === '#' ||
    trimmed.toLowerCase() === 'http://' ||
    trimmed.toLowerCase() === 'https://'
  ) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed);
}

function sortWebUrls(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const hostA = getHostnameLabel(a).toLowerCase();
    const hostB = getHostnameLabel(b).toLowerCase();
    const isContentA = hostA.endsWith('.iscontent.cz') ? 1 : 0;
    const isContentB = hostB.endsWith('.iscontent.cz') ? 1 : 0;
    return isContentA - isContentB;
  });
}

function extractDbServerFromResourceKeys(resourceKeys?: string[]): string {
  if (!Array.isArray(resourceKeys)) return '';
  for (const key of resourceKeys) {
    if (typeof key === 'string' && key.toLowerCase().startsWith('db:')) {
      return key.slice(3).trim();
    }
  }
  return '';
}

/**
 * Converts DeployAgent[] from /api/ui/agents into IADonkey LauncherItem[]
 * matching the structure and capabilities of parseMagicGateXml().
 */
export function parseMagicGateDeployAgents(agents: DeployAgent[]): LauncherItem[] {
  if (!Array.isArray(agents)) return [];

  const items: LauncherItem[] = [];

  for (const agent of agents) {
    if (!agent || agent.revoked) continue;

    const serverName = (agent.name || agent.machineName || '').trim();
    const machineName = (agent.machineName || '').trim();
    if (
      serverName.toLowerCase().includes('bench') ||
      machineName.toLowerCase().includes('bench')
    ) {
      continue;
    }

    const instances = Array.isArray(agent.instances) ? agent.instances : [];
    for (const inst of instances) {
      if (!inst || !inst.name) continue;
      const instanceName = inst.name.trim();
      if (!instanceName || instanceName.toLowerCase().includes('bench')) {
        continue;
      }

      // Skip missing or archived instances
      if (inst.missingSince || inst.archivedAt) {
        continue;
      }

      const adminUrls = (Array.isArray(inst.adminUrls) ? inst.adminUrls : [])
        .map((u) => (u || '').trim())
        .filter(isValidHttpUrl);

      const webUrls = sortWebUrls(
        (Array.isArray(inst.webUrls) ? inst.webUrls : [])
          .map((u) => (u || '').trim())
          .filter(isValidHttpUrl)
      );

      const validApps: { name: string; url: string }[] = [];

      // 1. Administration URLs
      adminUrls.forEach((url, idx) => {
        if (idx === 0) {
          validApps.push({ name: 'Administrace', url });
        } else {
          validApps.push({ name: `Administrace (${getHostnameLabel(url)})`, url });
        }
      });

      // 2. Web / API / BO URLs
      const nonContentWebUrls = webUrls.filter(
        (u) => !getHostnameLabel(u).toLowerCase().endsWith('.iscontent.cz')
      );

      webUrls.forEach((url) => {
        // Avoid duplicate URL if identical to an adminUrl
        if (adminUrls.some((au) => au.toLowerCase() === url.toLowerCase())) {
          return;
        }
        const host = getHostnameLabel(url);
        const hostLower = host.toLowerCase();

        let label = 'Web';
        if (hostLower.startsWith('api.') || url.toLowerCase().includes('/api')) {
          label = 'API';
        } else if (
          hostLower.startsWith('bo.') ||
          hostLower.startsWith('b2b.') ||
          hostLower.startsWith('sis.')
        ) {
          label = 'BO';
        } else if (hostLower.endsWith('.iscontent.cz')) {
          label = nonContentWebUrls.length === 0 ? 'Web (iscontent)' : `Content (${host})`;
        } else if (nonContentWebUrls.length > 1) {
          label = `Web (${host})`;
        }

        validApps.push({ name: label, url });
      });

      if (validApps.length === 0) {
        continue;
      }

      const mainApp = validApps[0];
      const otherApps = validApps.slice(1);

      const options: LauncherItem[] = otherApps.map((appItem, idx) => {
        const safeKey = (appItem.name || `sub-${idx}`)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_');
        return {
          id: `mg-xml-${instanceName.toLowerCase()}-${safeKey}-${idx}`,
          name: appItem.name || 'Aplikace',
          location: appItem.url,
          action: 'open',
          icon: 'public',
          image: '{favicon}',
        };
      });

      const adminUrl = adminUrls[0] || mainApp.url || '';

      const actions = adminUrl
        ? [
            {
              name: 'Klonovat repozitáře instance (git clone)...',
              action: 'mgclone',
              location: adminUrl,
              settings: 'magicgate',
              icon: 'cloud_download',
            },
          ]
        : undefined;

      const info: Record<string, any> = {};
      if (serverName) info['Server'] = serverName;
      if (machineName && machineName.toLowerCase() !== serverName.toLowerCase()) {
        info['Stroj'] = machineName;
      }
      info['Instance'] = instanceName;

      const currentVer = inst.currentVersion || inst.version;
      if (currentVer) info['Verze'] = currentVer;
      if (adminUrl) info['Admin URL'] = adminUrl;
      if (webUrls.length > 0) info['Web URL'] = webUrls.join(', ');

      const dbServer = inst.dbServerName || extractDbServerFromResourceKeys(inst.resourceKeys);
      if (dbServer) info['DB Server'] = dbServer;

      const dbName = inst.database || inst.meta?.database;
      if (dbName) info['Databáze'] = dbName;

      const rootPath = inst.instanceRoot || inst.path;
      if (rootPath) info['Cesta na serveru'] = rootPath;

      const serverLocation = agent.properties?.location;
      if (serverLocation) info['Umístění serveru'] = serverLocation;

      if (inst.deployWindow) info['Nasazovací okno'] = inst.deployWindow;

      // Include any additional agent properties
      if (agent.properties && typeof agent.properties === 'object') {
        for (const [k, v] of Object.entries(agent.properties)) {
          if (v && k.toLowerCase() !== 'location' && info[k] === undefined) {
            info[k] = v;
          }
        }
      }

      // Include any additional instance properties
      if (inst.properties && typeof inst.properties === 'object') {
        for (const [k, v] of Object.entries(inst.properties)) {
          if (v && info[k] === undefined) {
            info[k] = v;
          }
        }
      }

      items.push({
        id: `mg-xml-${instanceName.toLowerCase()}`,
        name: instanceName,
        location: mainApp.url,
        action: 'open',
        settings: 'magicgate',
        priority: 1,
        icon: 'public',
        image: './assets/magicgate-icon.png',
        sourceId: 'magicgate-xml',
        actions,
        options: options.length > 0 ? options : undefined,
        info: Object.keys(info).length > 0 ? info : undefined,
      });
    }
  }

  return items;
}

/**
 * Reads all cookies for baseUrl from Electron's defaultSession.
 */
export async function extractAndPersistSessionCookies(baseUrl: string): Promise<string> {
  try {
    const sesCookies = await session.defaultSession.cookies.get({ url: baseUrl });
    if (!sesCookies || sesCookies.length === 0) return '';
    try {
      await session.defaultSession.cookies.flushStore();
    } catch {}
    return sesCookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

function mergeCookieStrings(savedCookie?: string, liveSessionCookie?: string): string {
  const map = new Map<string, string>();
  const addFrom = (raw?: string) => {
    if (!raw) return;
    for (const part of raw.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && v) map.set(k, v);
      }
    }
  };
  addFrom(savedCookie);
  addFrom(liveSessionCookie);
  if (map.size === 0) return (savedCookie || liveSessionCookie || '').trim();
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Builds Cookie / Authorization headers for requests to the Deploy server
 */
export async function buildDeployRequestHeaders(
  baseUrl: string,
  explicitCookieOrToken?: string
): Promise<{ headers: Record<string, string>; resolvedCookie: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-MW-Deploy': 'ui',
  };

  const rawExplicit = (explicitCookieOrToken || '').trim();
  if (/^Bearer\s+/i.test(rawExplicit)) {
    headers['Authorization'] = rawExplicit;
    return { headers, resolvedCookie: rawExplicit };
  }

  const sessionCookie = await extractAndPersistSessionCookies(baseUrl);
  const cookieValue = mergeCookieStrings(rawExplicit, sessionCookie);

  if (cookieValue) {
    if (cookieValue.includes('=')) {
      headers['Cookie'] = cookieValue;
    } else {
      headers['Cookie'] = `.AspNetCore.Cookies=${cookieValue}`;
    }
  }

  return { headers, resolvedCookie: cookieValue };
}

/**
 * Checks /api/ui/me on Deploy server
 */
export async function checkDeployMe(
  baseUrl?: string,
  cookieOrToken?: string
): Promise<{ ok: boolean; me?: DeployMeInfo; cookie?: string; error?: string }> {
  const normUrl = normalizeDeployBaseUrl(baseUrl);
  if (!normUrl) {
    return {
      ok: false,
      error: 'Není zadána URL serveru Deploy v Nastavení -> MagicGate.',
    };
  }
  try {
    const { headers, resolvedCookie } = await buildDeployRequestHeaders(normUrl, cookieOrToken);
    const res = await fetch(`${normUrl}/api/ui/me`, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
      };
    }

    const data = (await res.json()) as DeployMeInfo;
    return {
      ok: true,
      me: data,
      cookie: resolvedCookie,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Nepodařilo se spojit se serverem Deploy.',
    };
  }
}

let activeSilentReauthPromise: Promise<{
  ok: boolean;
  email?: string;
  role?: string;
  cookie?: string;
}> | null = null;

/**
 * Attempts a silent, invisible background re-authentication via Google SSO (show: false BrowserWindow).
 * Succeeds if the user's Google session in Electron is still valid.
 */
export async function trySilentDeployReauth(
  rawBaseUrl?: string,
  preferredEmail?: string,
  timeoutMs: number = 9000
): Promise<{
  ok: boolean;
  email?: string;
  role?: string;
  cookie?: string;
}> {
  if (activeSilentReauthPromise) {
    return activeSilentReauthPromise;
  }

  const baseUrl = normalizeDeployBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    return { ok: false };
  }
  const targetHost = getHostnameLabel(baseUrl).toLowerCase();
  const loginUrl = `${baseUrl}/auth/login?returnUrl=${encodeURIComponent('/')}`;

  activeSilentReauthPromise = new Promise((resolve) => {
    let resolved = false;
    let verifying = false;

    const finish = (result: { ok: boolean; email?: string; role?: string; cookie?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      } catch {}
      try {
        if (!silentWin.isDestroyed()) {
          silentWin.destroy();
        }
      } catch {}
      activeSilentReauthPromise = null;
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false });
    }, timeoutMs);

    const silentWin = new BrowserWindow({
      width: 520,
      height: 680,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const tryVerifySilent = async () => {
      if (resolved || verifying) return;
      verifying = true;
      try {
        const cookieHeader = await extractAndPersistSessionCookies(baseUrl);
        if (!cookieHeader) {
          verifying = false;
          return;
        }
        const meCheck = await checkDeployMe(baseUrl, cookieHeader);
        if (meCheck.ok && meCheck.me?.signedIn) {
          finish({
            ok: true,
            email: meCheck.me.email,
            role: meCheck.me.role,
            cookie: cookieHeader,
          });
          return;
        }
      } catch {
        // ignore transient redirect errors
      } finally {
        verifying = false;
      }
    };

    const onCookieChanged = (_event: any, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
      if (removed || resolved) return;
      const cookieDomain = (cookie.domain || '').toLowerCase().replace(/^\./, '');
      if (cookieDomain && (cookieDomain === targetHost || targetHost.endsWith(cookieDomain))) {
        setTimeout(() => {
          tryVerifySilent();
        }, 200);
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);

    silentWin.webContents.on('did-navigate', (_event, url) => {
      if (url.startsWith(baseUrl) && !url.includes('/auth/login') && !url.includes('/signin-google')) {
        tryVerifySilent();
      }
    });

    silentWin.webContents.on('did-finish-load', async () => {
      if (resolved || silentWin.isDestroyed()) return;
      const currentUrl = silentWin.webContents.getURL();
      if (currentUrl.startsWith(baseUrl) && !currentUrl.includes('/auth/login')) {
        tryVerifySilent();
        return;
      }

      // If Google OAuth Account Chooser is shown with an already signed-in account, click it silently
      if (currentUrl.includes('accounts.google.com')) {
        try {
          const targetEmail = (preferredEmail || '').trim().toLowerCase();
          await silentWin.webContents.executeJavaScript(`
            (() => {
              const target = ${JSON.stringify(targetEmail)};
              const candidates = Array.from(document.querySelectorAll('[data-identifier], [data-email]'));
              const match = (target && candidates.find(el => {
                const id = (el.getAttribute('data-identifier') || el.getAttribute('data-email') || '').toLowerCase();
                return id === target;
              })) || candidates[0];
              if (match && typeof match.click === 'function') {
                match.click();
                return true;
              }
              return false;
            })();
          `);
        } catch {}
      }
    });

    silentWin.loadURL(loginUrl).catch(() => {
      finish({ ok: false });
    });
  });

  return activeSilentReauthPromise;
}

/**
 * Fetches /api/ui/agents from Deploy API and converts to LauncherItem[].
 * If the session cookie expired (401/302), automatically attempts silent Google SSO re-authentication in background.
 */
export async function fetchMagicGateDeployItems(
  settings?: MagicGateSettings,
  options?: { allowSilentReauth?: boolean }
): Promise<{
  ok: boolean;
  items: LauncherItem[];
  email?: string;
  role?: string;
  cookie?: string;
  error?: string;
}> {
  const baseUrl = normalizeDeployBaseUrl(settings?.apiBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      items: [],
      error: 'Není zadána URL serveru Deploy v Nastavení -> MagicGate.',
    };
  }
  let cookieOrToken = settings?.apiAuthCookie;
  const allowSilent = options?.allowSilentReauth !== false;

  try {
    let { headers, resolvedCookie } = await buildDeployRequestHeaders(baseUrl, cookieOrToken);

    let res = await fetch(`${baseUrl}/api/ui/agents`, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    let refreshedEmail: string | undefined;
    let refreshedRole: string | undefined;

    // If unauthorized / session expired, try silent background Google SSO re-auth
    if (
      (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) &&
      allowSilent
    ) {
      const silentRes = await trySilentDeployReauth(baseUrl, settings?.apiUserEmail);
      if (silentRes.ok && silentRes.cookie) {
        cookieOrToken = silentRes.cookie;
        refreshedEmail = silentRes.email;
        refreshedRole = silentRes.role;
        const rebuilt = await buildDeployRequestHeaders(baseUrl, cookieOrToken);
        headers = rebuilt.headers;
        resolvedCookie = rebuilt.resolvedCookie;

        res = await fetch(`${baseUrl}/api/ui/agents`, {
          method: 'GET',
          headers,
          redirect: 'manual',
        });
      }
    }

    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      return {
        ok: false,
        items: [],
        error: 'Nejste přihlášeni k Deploy serveru (platnost přihlášení vypršela). Přihlaste se prosím v Nastavení -> MagicGate.',
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        items: [],
        error: `Deploy server vrátil chybu HTTP ${res.status}.`,
      };
    }

    const agents = (await res.json()) as DeployAgent[];
    const items = parseMagicGateDeployAgents(agents);

    // Save to local cache for offline resilience
    saveMagicGateDeployCache(items);

    // Keep email/role fresh
    let email = refreshedEmail || settings?.apiUserEmail;
    let role = refreshedRole || settings?.apiUserRole;
    if (!refreshedEmail) {
      try {
        const meRes = await checkDeployMe(baseUrl, resolvedCookie || cookieOrToken);
        if (meRes.ok && meRes.me?.signedIn) {
          email = meRes.me.email || email;
          role = meRes.me.role || role;
        }
      } catch {}
    }

    return {
      ok: true,
      items,
      email,
      role,
      cookie: resolvedCookie || cookieOrToken,
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      error: err?.message || 'Chyba při stahování instancí z Deploy API.',
    };
  }
}

/**
 * Saves fetched Deploy API items to disk cache
 */
export function saveMagicGateDeployCache(items: LauncherItem[]): void {
  try {
    const tmpFile = `${DEPLOY_CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(items, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DEPLOY_CACHE_FILE);
  } catch (err) {
    console.error('[MagicGateDeployApi] Failed to save deploy cache:', err);
  }
}

/**
 * Loads cached Deploy API items from disk
 */
export function loadMagicGateDeployCache(): LauncherItem[] {
  try {
    if (fs.existsSync(DEPLOY_CACHE_FILE)) {
      const raw = fs.readFileSync(DEPLOY_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[MagicGateDeployApi] Failed to load deploy cache:', err);
  }
  return [];
}

/**
 * Opens an interactive Electron BrowserWindow for Google SSO login to the configured Deploy server
 * and resolves with the captured session cookie and user identity once signed in.
 */
export async function loginToMagicGateDeployInteractive(
  rawBaseUrl?: string,
  parentWindow?: BrowserWindow | null
): Promise<{
  ok: boolean;
  email?: string;
  role?: string;
  cookie?: string;
  instanceCount?: number;
  error?: string;
}> {
  const baseUrl = normalizeDeployBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Zadejte prosím nejprve URL serveru Deploy.',
    };
  }
  const targetHost = getHostnameLabel(baseUrl).toLowerCase();
  const loginUrl = `${baseUrl}/auth/login?returnUrl=${encodeURIComponent('/')}`;

  return new Promise((resolve) => {
    let resolved = false;
    let verifying = false;

    const finish = (result: {
      ok: boolean;
      email?: string;
      role?: string;
      cookie?: string;
      instanceCount?: number;
      error?: string;
    }) => {
      if (resolved) return;
      resolved = true;
      try {
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      } catch {}
      try {
        if (!authWin.isDestroyed()) {
          authWin.close();
        }
      } catch {}
      resolve(result);
    };

    const authWin = new BrowserWindow({
      width: 540,
      height: 700,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: false,
      show: true,
      autoHideMenuBar: true,
      title: 'Přihlášení – Deploy API',
      backgroundColor: '#0f1117',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const tryVerifyLogin = async () => {
      if (resolved || verifying) return;
      verifying = true;
      try {
        const cookieHeader = await extractAndPersistSessionCookies(baseUrl);
        if (!cookieHeader) {
          verifying = false;
          return;
        }

        const meCheck = await checkDeployMe(baseUrl, cookieHeader);
        if (meCheck.ok && meCheck.me?.signedIn) {
          const fetchRes = await fetchMagicGateDeployItems(
            {
              username: '',
              password: '',
              sourceMode: 'api',
              apiBaseUrl: baseUrl,
              apiAuthCookie: cookieHeader,
              apiUserEmail: meCheck.me.email,
              apiUserRole: meCheck.me.role,
            },
            { allowSilentReauth: false }
          );

          finish({
            ok: true,
            email: meCheck.me.email,
            role: meCheck.me.role,
            cookie: cookieHeader,
            instanceCount: fetchRes.ok ? fetchRes.items.length : undefined,
          });
          return;
        }
      } catch {
        // Ignore transient errors during redirects
      } finally {
        verifying = false;
      }
    };

    const onCookieChanged = (_event: any, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
      if (removed || resolved) return;
      const cookieDomain = (cookie.domain || '').toLowerCase().replace(/^\./, '');
      if (cookieDomain && (cookieDomain === targetHost || targetHost.endsWith(cookieDomain))) {
        setTimeout(() => {
          tryVerifyLogin();
        }, 200);
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);

    authWin.webContents.on('did-navigate', (_event, url) => {
      if (url.startsWith(baseUrl) && !url.includes('/auth/login') && !url.includes('/signin-google')) {
        tryVerifyLogin();
      }
    });

    authWin.webContents.on('did-finish-load', () => {
      if (authWin.isDestroyed()) return;
      const currentUrl = authWin.webContents.getURL();
      if (currentUrl.startsWith(baseUrl) && !currentUrl.includes('/auth/login')) {
        tryVerifyLogin();
      }
    });

    authWin.on('closed', () => {
      if (!resolved) {
        finish({
          ok: false,
          error: 'Přihlašovací okno bylo zavřeno před dokončením přihlášení.',
        });
      }
    });

    authWin.loadURL(loginUrl).catch((err) => {
      finish({
        ok: false,
        error: `Nepodařilo se načíst přihlašovací stránku (${err?.message || err}).`,
      });
    });
  });
}

/**
 * Clears Electron session cookies for configured Deploy server
 */
export async function logoutFromMagicGateDeploy(rawBaseUrl?: string): Promise<void> {
  const baseUrl = normalizeDeployBaseUrl(rawBaseUrl);
  if (!baseUrl) return;
  try {
    const cookies = await session.defaultSession.cookies.get({ url: baseUrl });
    for (const c of cookies) {
      await session.defaultSession.cookies.remove(baseUrl, c.name);
    }
    await session.defaultSession.cookies.flushStore();
  } catch (err) {
    console.error('[MagicGateDeployApi] Error clearing cookies:', err);
  }
}
