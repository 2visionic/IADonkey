import fs from 'node:fs';
import type { LauncherItem } from '../src/types';

function getAttribute(attrsString: string, attrName: string): string {
  const match = new RegExp(`${attrName}=["']([^"']*)["']`, 'i').exec(attrsString);
  return match ? match[1] : '';
}

function getAllAttributes(attrsString: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrsString)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

/**
 * Parses MagicGate deploy XML content into LauncherItem objects.
 * - Strips XML comments
 * - Ignores servers matching "bench"
 * - Extracts instances (ignoring instances matching "bench")
 * - Extracts valid apps (ignoring empty or "#" URLs)
 * - First app becomes main item
 * - Remaining apps become options (subitems) with mapped names and image: '{favicon}'
 */
export function parseMagicGateXml(xmlContent: string): LauncherItem[] {
  // 1. Strip XML comments to avoid parsing disabled/commented-out blocks
  const cleanXml = xmlContent.replace(/<!--[\s\S]*?-->/g, '');

  const items: LauncherItem[] = [];

  // 2. Find all <Server ...>...</Server> blocks
  const serverRegex = /<Server\s+([^>]*?)>([\s\S]*?)<\/Server>/gi;
  let serverMatch: RegExpExecArray | null;

  while ((serverMatch = serverRegex.exec(cleanXml)) !== null) {
    const serverAttrs = serverMatch[1];
    const serverBody = serverMatch[2];

    const serverName = getAttribute(serverAttrs, 'Name');
    // Rule: exclude BenchServer / BenchMarking
    if (serverName.toLowerCase().includes('bench')) {
      continue;
    }

    // 3. Find all <Instance ...>...</Instance> or <Instance ... /> blocks
    const instanceRegex = /<Instance\s+([^>]*?)(?:>([\s\S]*?)<\/Instance>|\/>)/gi;
    let instanceMatch: RegExpExecArray | null;

    while ((instanceMatch = instanceRegex.exec(serverBody)) !== null) {
      const instanceAttrs = instanceMatch[1];
      const instanceBody = instanceMatch[2] || '';

      const instanceName = getAttribute(instanceAttrs, 'Name');
      if (!instanceName || instanceName.toLowerCase().includes('bench')) {
        continue;
      }

      // 4. Find all <App ... />, <Check ... />, or <Alias ... /> inside the instance
      const appRegex = /<(?:App|Check|Alias)\s+([^>]*?)(?:\/>|>[\s\S]*?<\/(?:App|Check|Alias)>)/gi;
      let appMatch: RegExpExecArray | null;
      const validApps: { name: string; url: string }[] = [];

      while ((appMatch = appRegex.exec(instanceBody)) !== null) {
        const appAttrs = appMatch[1];
        const rawName = getAttribute(appAttrs, 'Name') || '';
        const rawUrl = (getAttribute(appAttrs, 'Url') || '').trim();

        if (
          !rawUrl ||
          rawUrl === '#' ||
          rawUrl.toLowerCase() === 'http://' ||
          rawUrl.toLowerCase() === 'https://'
        ) {
          continue;
        }

        validApps.push({
          name: rawName,
          url: rawUrl,
        });
      }

      if (validApps.length === 0) {
        continue;
      }

      // First app becomes main item
      const mainApp = validApps[0];
      const otherApps = validApps.slice(1);

      const options: LauncherItem[] = otherApps.map((app, idx) => {
        let displayName = app.name;
        const upper = app.name.trim().toUpperCase();
        if (upper === 'A') {
          displayName = 'Administrace';
        } else if (upper === 'W' || upper === 'WEB') {
          displayName = 'Web';
        } else if (upper === 'API') {
          displayName = 'API';
        } else if (upper === 'BO') {
          displayName = 'BO';
        }

        const safeKey = (app.name || `sub-${idx}`).toLowerCase().replace(/[^a-z0-9]/g, '_');
        return {
          id: `mg-xml-${instanceName.toLowerCase()}-${safeKey}-${idx}`,
          name: displayName || app.name || 'Aplikace',
          location: app.url,
          action: 'open',
          icon: 'public',
          image: '{favicon}',
        };
      });

      // Extract detailed info from server and instance
      const serverLocation = getAttribute(serverAttrs, 'ServerLocation');
      const dbServer = getAttribute(serverAttrs, 'DbServer');
      const providerName = getAttribute(serverAttrs, 'ProviderName');
      const rootPath = getAttribute(serverAttrs, 'RootPath');
      const webService = getAttribute(serverAttrs, 'WebService');
      const ftpUrl = getAttribute(serverAttrs, 'FtpUrl');
      const dbBackupPath = getAttribute(serverAttrs, 'DBServerBackupPath');
      const subReqId = getAttribute(instanceAttrs, 'DeploySubRequirementID');
      const keepBackup = getAttribute(instanceAttrs, 'KeepBackupForDays');
      const backupDownload = getAttribute(instanceAttrs, 'BackupDownload');
      const storageBackup = getAttribute(instanceAttrs, 'StorageBackupDownload');
      const perflog = getAttribute(instanceAttrs, 'PerflogPrefix');

      // Find Administration app URL for API operations (CmsFsContentHandler.ashx)
      const adminApp = validApps.find((app) => app.name.trim().toUpperCase() === 'A') || validApps[0];
      const adminUrl = adminApp?.url || '';

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
      if (instanceName) info['Instance'] = instanceName;
      if (adminUrl) info['Admin URL'] = adminUrl;
      if (dbServer) info['DB Server'] = dbServer;
      if (serverLocation) info['Umístění serveru'] = serverLocation;
      if (providerName) info['Provider'] = providerName;
      if (subReqId) info['MLog Požadavek'] = `R${subReqId}`;
      if (rootPath) info['Root Path'] = rootPath;
      if (webService) info['Web Service'] = webService;
      if (ftpUrl) info['FTP'] = ftpUrl;
      if (keepBackup) info['Zálohy (dny)'] = keepBackup;
      if (backupDownload) info['Stahování záloh'] = backupDownload;
      if (storageBackup) info['Zálohy úložiště'] = storageBackup;
      if (dbBackupPath) info['Cesta záloh DB'] = dbBackupPath;
      if (perflog) info['Perflog Prefix'] = perflog;

      // Known server and instance attribute names already processed
      const knownAttrs = new Set([
        'name',
        'serverlocation',
        'dbserver',
        'providername',
        'rootpath',
        'webservice',
        'ftpurl',
        'dbserverbackuppath',
        'deploysubrequirementid',
        'keepbackupfordays',
        'backupdownload',
        'storagebackupdownload',
        'perflogprefix',
      ]);

      // Automatically harvest any additional custom attributes from <Server>
      const allServerAttrs = getAllAttributes(serverAttrs);
      for (const [key, val] of Object.entries(allServerAttrs)) {
        if (val && !knownAttrs.has(key.toLowerCase()) && info[key] === undefined) {
          info[key] = val;
        }
      }

      // Automatically harvest any additional custom attributes from <Instance>
      const allInstanceAttrs = getAllAttributes(instanceAttrs);
      for (const [key, val] of Object.entries(allInstanceAttrs)) {
        if (val && !knownAttrs.has(key.toLowerCase()) && info[key] === undefined) {
          info[key] = val;
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
 * Safely loads and parses MagicGate XML file from disk.
 */
export function loadMagicGateXml(filePath: string): LauncherItem[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseMagicGateXml(raw);
  } catch (err) {
    console.error(`[MagicGateXml] Error loading or parsing XML from "${filePath}":`, err);
    return [];
  }
}
