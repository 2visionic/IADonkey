import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import type { AppConfig } from '../src/types';
import { diagnosticsService } from './diagnosticsService';

const USER_DATA_PATH = app?.getPath
  ? app.getPath('userData')
  : path.join(process.cwd(), '.user_data');

const LOCAL_DB_CACHE_FILE = path.join(USER_DATA_PATH, 'local_databases_cache.json');

interface LocalDbCachePayload {
  server: string;
  updatedAt: string;
  databases: string[];
}

let memoryLocalDbCache: LocalDbCachePayload | null = null;

/**
 * Automatically detects installed Microsoft SQL Server Management Studio (Ssms.exe)
 * across versions 21, 20, 19, 18, and 17.
 */
export function detectDefaultSsmsPath(): string | null {
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const staticCandidates = [
    // SSMS 22 & 21 (64-bit Visual Studio installer layout)
    path.join(progFiles, 'Microsoft SQL Server Management Studio 22', 'Release', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 22', 'Preview', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 22', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 21', 'Release', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 21', 'Preview', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 21', 'Common7', 'IDE', 'Ssms.exe'),
    // SSMS 20 / 19 / 18 (64-bit & 32-bit Program Files)
    path.join(progFiles, 'Microsoft SQL Server Management Studio 20', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFilesX86, 'Microsoft SQL Server Management Studio 20', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 19', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFilesX86, 'Microsoft SQL Server Management Studio 19', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFiles, 'Microsoft SQL Server Management Studio 18', 'Common7', 'IDE', 'Ssms.exe'),
    path.join(progFilesX86, 'Microsoft SQL Server Management Studio 18', 'Common7', 'IDE', 'Ssms.exe'),
    // SSMS 17
    path.join(progFilesX86, 'Microsoft SQL Server', '140', 'Tools', 'Binn', 'ManagementStudio', 'Ssms.exe'),
  ];

  for (const candidate of staticCandidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }

  // Dynamic scan in Program Files and Program Files (x86) for any "Microsoft SQL Server Management Studio*" folder
  for (const baseDir of [progFiles, progFilesX86]) {
    try {
      if (!fs.existsSync(baseDir)) continue;
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      const ssmsDirs = entries
        .filter((e) => e.isDirectory() && /^Microsoft SQL Server Management Studio/i.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

      for (const dirName of ssmsDirs) {
        const subCandidates = [
          path.join(baseDir, dirName, 'Common7', 'IDE', 'Ssms.exe'),
          path.join(baseDir, dirName, 'Release', 'Common7', 'IDE', 'Ssms.exe'),
        ];
        for (const sub of subCandidates) {
          if (fs.existsSync(sub)) return sub;
        }
      }
    } catch {}
  }

  // Fallback: check Wox.MagicGate Settings.json if present
  try {
    const appData = process.env.APPDATA || '';
    const woxMgPath = path.join(appData, 'Wox', 'Settings', 'Plugins', 'Wox.MagicGate', 'Settings.json');
    if (fs.existsSync(woxMgPath)) {
      const parsed = JSON.parse(fs.readFileSync(woxMgPath, 'utf-8'));
      if (parsed?.SsmsExePath && fs.existsSync(parsed.SsmsExePath)) {
        return parsed.SsmsExePath;
      }
    }
  } catch {}

  return null;
}

const CMIS_MACHINE_TO_DNS: Record<string, string> = {
  aof1948: 'cmisdb1.magicware-int.cz',
  aof1949: 'cmisdb2.magicware-int.cz',
  aof1993: 'cmisdb3.magicware-int.cz',
  'mw-db-mssql-1p': 'cmisdb4.magicware-int.cz',
  aof2116: 'cmisdb5.magicware-int.cz',
  aof2117: 'cmisdb6.magicware-int.cz',
  aof2127: 'cmisdb7.magicware-int.cz',
  cvm2725: 'cmisdb8.magicware-int.cz',
  aof0934: 'saturdb.magicware-int.cz',
  aof0352: 'grecosdb.magicware-int.cz',
};

/**
 * Translates Deploy API DB Server labels (e.g. "cmisdb7 - AOF2127", "AOF1948", "saturdb - AOF0934")
 * into a directly connectable SQL Server host/IP for SSMS.
 */
export function resolveConnectableSqlHost(
  rawDbServer?: string,
  rawDbHost?: string,
  rawServerName?: string
): string {
  const dbServer = (rawDbServer || '').trim();
  const dbHost = (rawDbHost || '').trim();
  const serverName = (rawServerName || '').trim().toLowerCase();

  // 1. Check known CMIS machine code in dbHost or dbServer
  const lowerHost = dbHost.toLowerCase();
  if (CMIS_MACHINE_TO_DNS[lowerHost]) {
    return CMIS_MACHINE_TO_DNS[lowerHost];
  }
  const lowerServer = dbServer.toLowerCase();
  if (CMIS_MACHINE_TO_DNS[lowerServer]) {
    return CMIS_MACHINE_TO_DNS[lowerServer];
  }

  // 2. Check "<prefix> - <machine>" pattern from Deploy API (e.g. "cmisdb7 - AOF2127", "saturdb - AOF0934")
  if (dbServer.includes(' - ')) {
    const [leftPart, rightPart] = dbServer.split(' - ').map((s) => s.trim());
    const leftLower = leftPart.toLowerCase();
    const rightLower = rightPart.toLowerCase();

    if (CMIS_MACHINE_TO_DNS[rightLower]) {
      return CMIS_MACHINE_TO_DNS[rightLower];
    }

    if (/^(cmisdb\d+|saturdb|bluedb|grecosdb)$/i.test(leftLower)) {
      return `${leftLower}.magicware-int.cz`;
    }

    if (leftLower === 'esol1db') return dbHost || 'esol1db.magicware.cz,1450';
    if (leftLower === 'esoltipdb') return dbHost || 'esoltipdb.magicware.cz';
    if (leftLower === 'esolend') return dbHost || 'esolend.magicware.cz,1450';
    if (leftLower === 'esol') return dbHost || '171.25.220.92';

    // For customer servers like "Albatros PROD - AM-CDC-VW-WEBDB", prefer dbHost if available
    if (dbHost) {
      return dbHost;
    }
    return rightPart || leftPart;
  }

  // 3. If dbServer is "localhost" on a remote server (e.g. Bill, VegaTour), map to remote server host
  if (lowerServer === 'localhost' || lowerHost === 'localhost') {
    if (serverName.includes('bill')) return 'bill.mbc.magicware.cz';
    if (serverName.includes('vegatour') || serverName.includes('vegasql')) return '95.80.217.166';
  }

  // 4. Prefer explicit IP/host in dbHost if dbServer is empty or a label
  if (dbHost && (/^\d+\.\d+\.\d+\.\d+/.test(dbHost) || dbHost.includes('\\') || dbHost.includes(','))) {
    return dbHost;
  }

  return dbServer || dbHost || 'localhost';
}

const LOCAL_DB_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastLocalDbFetchAttemptAt = 0;
let inFlightLocalDbFetch: Promise<{ ok: boolean; databases: string[]; error?: string }> | null = null;

export function getCachedLocalDatabases(localServer = 'localhost'): { databases: string[]; isFresh: boolean } {
  const normServer = (localServer || 'localhost').trim().toLowerCase();
  if (memoryLocalDbCache && memoryLocalDbCache.server.toLowerCase() === normServer) {
    const age = Date.now() - new Date(memoryLocalDbCache.updatedAt).getTime();
    const isFresh = Number.isFinite(age) && age >= 0 && age < LOCAL_DB_CACHE_TTL_MS;
    return { databases: memoryLocalDbCache.databases, isFresh };
  }
  try {
    if (fs.existsSync(LOCAL_DB_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_CACHE_FILE, 'utf-8')) as LocalDbCachePayload;
      if (parsed && Array.isArray(parsed.databases)) {
        memoryLocalDbCache = parsed;
        if (!localServer || parsed.server.toLowerCase() === normServer) {
          const age = Date.now() - new Date(parsed.updatedAt).getTime();
          const isFresh = Number.isFinite(age) && age >= 0 && age < LOCAL_DB_CACHE_TTL_MS;
          return { databases: parsed.databases, isFresh };
        }
      }
    }
  } catch {}
  const recentlyAttempted = Date.now() - lastLocalDbFetchAttemptAt < LOCAL_DB_CACHE_TTL_MS;
  return { databases: [], isFresh: recentlyAttempted };
}

/**
 * Queries sys.databases on the local SQL Server instance via PowerShell SqlConnection
 * (matching Wox.QueryStarter behavior without native Node C++ addons).
 */
export async function fetchLocalDatabases(
  localServer = 'localhost',
  forceRefresh = false
): Promise<{ ok: boolean; databases: string[]; error?: string }> {
  const targetServer = (localServer || 'localhost').trim() || 'localhost';

  if (!forceRefresh) {
    const cached = getCachedLocalDatabases(targetServer);
    if (cached.isFresh) {
      return { ok: true, databases: cached.databases };
    }
  }

  if (inFlightLocalDbFetch) {
    return inFlightLocalDbFetch;
  }

  lastLocalDbFetchAttemptAt = Date.now();

  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
try {
  $connStr = "Server=$env:IADONKEY_SQL_SERVER;Database=master;Integrated Security=SSPI;Connection Timeout=2;"
  $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandTimeout = 3
  $cmd.CommandText = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') AND state = 0 ORDER BY name"
  $reader = $cmd.ExecuteReader()
  $list = New-Object System.Collections.Generic.List[string]
  while ($reader.Read()) {
    $list.Add($reader.GetString(0))
  }
  $reader.Close()
  $conn.Close()
  ConvertTo-Json -InputObject @($list) -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`.trim();

  inFlightLocalDbFetch = new Promise<{ ok: boolean; databases: string[]; error?: string }>((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      {
        env: { ...process.env, IADONKEY_SQL_SERVER: targetServer },
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      resolve({
        ok: false,
        databases: getCachedLocalDatabases(targetServer).databases,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          databases: getCachedLocalDatabases(targetServer).databases,
          error: stderr.trim() || `SQL dotaz skončil s kódem ${code}`,
        });
        return;
      }

      try {
        const raw = stdout.trim();
        let parsed: any = raw ? JSON.parse(raw) : [];
        if (typeof parsed === 'string') {
          parsed = [parsed];
        }
        const databases = Array.isArray(parsed)
          ? parsed.map((d) => String(d).trim()).filter(Boolean)
          : [];

        const payload: LocalDbCachePayload = {
          server: targetServer,
          updatedAt: new Date().toISOString(),
          databases,
        };
        memoryLocalDbCache = payload;
        try {
          fs.writeFileSync(LOCAL_DB_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        } catch {}

        resolve({ ok: true, databases });
      } catch (err: any) {
        resolve({
          ok: false,
          databases: getCachedLocalDatabases(targetServer).databases,
          error: err?.message || 'Nepodařilo se zpracovat seznam databází',
        });
      }
    });
  }).finally(() => {
    inFlightLocalDbFetch = null;
  });

  return inFlightLocalDbFetch;
}

/**
 * Opens a new SQL query tab in Microsoft SQL Server Management Studio (SSMS)
 * connected to the specified server and database.
 */
export async function openQueryInSsms(
  params: {
    dbServer: string;
    database: string;
    dbHost?: string;
    serverName?: string;
    instanceName?: string;
    isLocal?: boolean;
  },
  config: AppConfig
): Promise<{ success: boolean; error?: string; resolvedHost?: string }> {
  try {
    const isSsmsEnabled = Boolean(config.extensions?.ssms);
    const ssmsExe = config.ssms?.path?.trim() || '';

    if (!isSsmsEnabled || !ssmsExe) {
      return {
        success: false,
        error: 'Rozšíření SSMS není zapnuté nebo není vybrána cesta k Ssms.exe v Nastavení.',
      };
    }

    if (!fs.existsSync(ssmsExe)) {
      return {
        success: false,
        error: `Soubor Ssms.exe nebyl nalezen na cestě: ${ssmsExe}`,
      };
    }

    const dbName = (params.database || '').trim();
    if (!dbName) {
      return {
        success: false,
        error: 'Chybí název databáze pro otevření v SSMS.',
      };
    }

    const resolvedHost = params.isLocal
      ? (params.dbServer || config.ssms?.localServer || 'localhost').trim()
      : resolveConnectableSqlHost(params.dbServer, params.dbHost, params.serverName);

    // Prepare a temporary .sql file so SSMS opens a new query tab in the existing SSMS instance (or starts SSMS with it)
    const tempDir = path.join(os.tmpdir(), 'IADonkey_SSMS');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clean up old temp .sql files older than 24 hours
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(tempDir)) {
        if (!f.endsWith('.sql')) continue;
        const fp = path.join(tempDir, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fp);
        }
      }
    } catch {}

    const safeDbFile = dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeHostFile = resolvedHost.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sqlFilePath = path.join(tempDir, `${safeDbFile}__${safeHostFile}.sql`);

    const headerLabel = params.instanceName
      ? `${params.instanceName} -> [${dbName}] (${resolvedHost})`
      : `[${dbName}] (${resolvedHost})`;

    const sqlContent = [
      `-- IADonkey SQL Query: ${headerLabel}`,
      `USE [${dbName.replace(/\]/g, ']]')}];`,
      `GO`,
      ``,
      ``,
    ].join('\r\n');

    fs.writeFileSync(sqlFilePath, '\uFEFF' + sqlContent, 'utf-8');

    // SSMS syntax: SSMS.exe [file_name] [-S server] [-d database] [-U user] [-A auth] [-C] [-nosplash]
    const args: string[] = [sqlFilePath, '-S', resolvedHost, '-d', dbName];

    const isLegacySsms17To20 =
      /Management Studio (17|18|19|20)\b/i.test(ssmsExe) || /\\(140|150)\\/i.test(ssmsExe);

    const useSqlAuth =
      !params.isLocal &&
      config.ssms?.authMode === 'sql' &&
      Boolean(config.ssms?.sqlUsername?.trim());

    if (useSqlAuth) {
      args.push('-U', config.ssms!.sqlUsername!.trim());
      if (!isLegacySsms17To20) {
        args.push('-A', 'SqlPassword', '-C');
      } else if (config.ssms?.sqlPassword) {
        const isLegacySsms17To18 = /Management Studio (17|18)\b/i.test(ssmsExe) || /\\140\\/i.test(ssmsExe);
        if (isLegacySsms17To18) {
          args.push('-P', config.ssms.sqlPassword);
        }
      }
    } else {
      // SSMS 21/22+ removed the -E switch (Windows Authentication is default when -U/-A is omitted)
      // and added -C to trust server certificate when encryption is Mandatory by default.
      if (isLegacySsms17To20) {
        args.push('-E');
      } else {
        args.push('-C');
      }
    }

    args.push('-nosplash');

    const child = spawn(ssmsExe, args, {
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
    });
    child.unref();

    diagnosticsService.logAction({
      type: 'action',
      title: `Otevřen SQL dotaz v SSMS: ${dbName}`,
      details: `Server: ${resolvedHost}${params.instanceName ? `, Instance: ${params.instanceName}` : ''}`,
      status: 'success',
    });

    return { success: true, resolvedHost };
  } catch (err: any) {
    diagnosticsService.logAction({
      type: 'error',
      title: `Chyba při otevírání SSMS (${params.database})`,
      details: err?.message || String(err),
      status: 'error',
    });
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}
