import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import type { LauncherItem, MagicGateDeploySchemaField, MagicGateSettings } from '../src/types';
import { diagnosticsService } from './diagnosticsService';

const USER_DATA_PATH = app?.getPath
  ? app.getPath('userData')
  : path.join(process.cwd(), '.user_data');

const DEPLOY_CACHE_FILE = path.join(USER_DATA_PATH, 'magicgate_deploy_cache.json');
const DEPLOY_RAW_AGENTS_CACHE_FILE = path.join(USER_DATA_PATH, 'magicgate_deploy_agents_cache.json');

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
  dbHost?: string | null;
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

function getHostnameLabel(rawUrl: string, keepWww: boolean = false): string {
  try {
    const parsed = new URL(rawUrl);
    return keepWww ? parsed.hostname : parsed.hostname.replace(/^www\./i, '');
  } catch {
    const host = rawUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    return keepWww ? host : host.replace(/^www\./i, '');
  }
}

function normalizeUrlIdentity(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./i, '');
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${pathname}`;
  } catch {
    return rawUrl
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '');
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

function extractPreferredKeywords(adminUrls: string[], instanceName: string = ''): string[] {
  const keywords: string[] = [];
  const genericLabels = new Set([
    'www',
    'admin',
    'administrace',
    'bo',
    'b2b',
    'sis',
    'api',
    'web',
    'portal',
    'intranet',
    'extranet',
    'iscontent',
    'magicware',
    'magic',
    'test',
    'dev',
    'stage',
  ]);

  const addKw = (raw: string) => {
    const clean = raw.trim().toLowerCase();
    if (!clean || clean.length < 2 || genericLabels.has(clean)) return;
    if (!keywords.includes(clean)) keywords.push(clean);
    const noHyphen = clean.replace(/[-_.\s]/g, '');
    if (noHyphen && noHyphen.length >= 2 && !genericLabels.has(noHyphen) && !keywords.includes(noHyphen)) {
      keywords.push(noHyphen);
    }
    const stripped = clean.replace(/^(?:test|dev|stage)[-_]?/i, '').replace(/[-_]?test$/i, '');
    if (stripped && stripped.length >= 2 && !genericLabels.has(stripped) && !keywords.includes(stripped)) {
      keywords.push(stripped);
      const strippedNoHyphen = stripped.replace(/[-_.\s]/g, '');
      if (strippedNoHyphen && strippedNoHyphen.length >= 2 && !genericLabels.has(strippedNoHyphen) && !keywords.includes(strippedNoHyphen)) {
        keywords.push(strippedNoHyphen);
      }
    }
  };

  for (const au of adminUrls) {
    const host = getHostnameLabel(au).toLowerCase();
    const parts = host.split('.').filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      if (!genericLabels.has(parts[i])) {
        addKw(parts[i]);
        break;
      }
    }
  }
  if (instanceName) {
    addKw(instanceName);
  }
  return keywords;
}

/**
 * Returns tier rank for domain classification:
 * 0: Real public customer domains (e.g. .cz, .sk, .eu, .com, .travel, .pl)
 * 1: MagicWare dev / staging (.magicware.cz, .magic.cz)
 * 2: Internal IS Tour backoffice / dashboard (*.istour.cz)
 * 3: Technical CMSinFS content storage (*.iscontent.cz)
 */
function getDomainTier(cleanHost: string): number {
  const host = cleanHost.toLowerCase();
  if (host.endsWith('.iscontent.cz')) return 3;
  if (host.endsWith('.istour.cz')) return 2;
  if (host.endsWith('.magicware.cz') || host.endsWith('.magic.cz')) return 1;
  return 0;
}

/**
 * Sorts MagicGate API web URLs so that:
 * 1) Real public customer domains (Tier 0) are ALWAYS prioritized over dev (Tier 1), internal (Tier 2), and iscontent (Tier 3).
 * 2) Domain families matching the adminUrl / instance keyword (normalized, ignoring hyphens/underscores) come first.
 * 3) 2nd-level domains (e.g. atis.cz, firotour.cz) are placed at the top of their family,
 *    immediately followed by their paired 3rd+ level domains (e.g. atis.neco.cz, prodej.atis.cz).
 * 4) www.<domain> and <domain> are paired together, with www.<domain> first.
 */
export function sortMagicGateWebUrls(
  urls: string[],
  adminUrls: string[] = [],
  instanceName: string = ''
): string[] {
  const preferredKeywords = extractPreferredKeywords(adminUrls, instanceName);
  const normalizeForMatch = (str: string) => str.toLowerCase().replace(/[-_.\s]/g, '');

  interface ParsedDomainEntry {
    url: string;
    rawHost: string;
    cleanHost: string;
    rawParts: string[];
    cleanParts: string[];
    isWww: boolean;
    tier: number;
    tld: string;
    familyKey: string;
    normFamily: string;
    subRank: number;
  }

  const secondLevelBases = new Set<string>();

  const initial = urls.map((url) => {
    let rawHost = '';
    try {
      rawHost = new URL(url.trim()).hostname.toLowerCase();
    } catch {
      rawHost = getHostnameLabel(url, true).toLowerCase();
    }
    const rawParts = rawHost.split('.').filter(Boolean);
    const isWww = rawParts[0] === 'www';
    const cleanParts = isWww ? rawParts.slice(1) : rawParts;
    const cleanHost = cleanParts.join('.');
    const tier = getDomainTier(cleanHost);
    const tld = cleanParts[cleanParts.length - 1] || '';

    if (cleanParts.length === 2 && tier === 0) {
      secondLevelBases.add(cleanParts[0]);
    }

    return {
      url,
      rawHost,
      cleanHost,
      rawParts,
      cleanParts,
      isWww,
      tier,
      tld,
    };
  });

  const sortedBasesByLen = Array.from(secondLevelBases).sort((a, b) => b.length - a.length);

  const resolveFamilyForThirdLevel = (cleanParts: string[], tier: number): string => {
    const first = cleanParts[0] || '';
    const sld = cleanParts[cleanParts.length - 2] || '';
    const innerLabels = cleanParts.slice(0, -1);

    // 1. Exact first label match (e.g. atis.2dovolena.cz -> atis)
    if (secondLevelBases.has(first)) return first;

    // 2. Exact SLD match (e.g. prodej.atis.cz -> atis)
    if (secondLevelBases.has(sld)) return sld;

    // 3. Any inner label exact match (e.g. dashboard.atis.istour.cz -> atis)
    for (const lbl of innerLabels) {
      if (secondLevelBases.has(lbl)) return lbl;
    }

    // 4. Normalized matches without hyphens (e.g. marco-polo.cz -> marcopolo, snail-travel.cz -> snailtravel)
    const normFirst = normalizeForMatch(first);
    const normSld = normalizeForMatch(sld);
    for (const base of sortedBasesByLen) {
      const normBase = normalizeForMatch(base);
      if (normBase === normFirst || normBase === normSld) return base;
      if (normBase.length >= 3 && (normFirst.startsWith(normBase) || normSld.startsWith(normBase))) return base;
    }

    // 5. Prefix match against known 2nd-level bases (e.g. atis23.iscontent.cz -> atis, firo.iscontent.cz -> firotour)
    for (const base of sortedBasesByLen) {
      if (base.length >= 3 && first.startsWith(base)) {
        return base;
      }
    }
    if (first.length >= 4) {
      for (const base of sortedBasesByLen) {
        if (base.startsWith(first)) {
          return base;
        }
      }
    }

    // 6. Match against preferred admin keyword
    for (const kw of preferredKeywords) {
      const normKw = normalizeForMatch(kw);
      if (normFirst === normKw || normSld === normKw || normFirst.startsWith(normKw) || normSld.startsWith(normKw)) {
        return kw;
      }
      if (first === kw || sld === kw || first.startsWith(kw)) {
        return kw;
      }
    }

    return tier === 3 ? first : (sld || first);
  };

  const entries: ParsedDomainEntry[] = initial.map((item) => {
    let familyKey = '';
    let subRank = 2;

    if (item.cleanParts.length === 2 && item.tier === 0) {
      familyKey = item.cleanParts[0];
      subRank = 0; // Both www.atis.cz and atis.cz are top-level family domains
    } else {
      familyKey = resolveFamilyForThirdLevel(item.cleanParts, item.tier);
      if (item.tier === 3) {
        subRank = 3;
      } else if (item.cleanParts[0] === familyKey || normalizeForMatch(item.cleanParts[0]) === normalizeForMatch(familyKey)) {
        subRank = 1; // e.g. atis.neco.cz right under www.atis.cz / atis.cz
      } else {
        subRank = 2; // e.g. prodej.atis.cz, dashboard.atis.istour.cz
      }
    }

    return {
      ...item,
      familyKey,
      normFamily: normalizeForMatch(familyKey),
      subRank,
    };
  });

  const getFamilyAdminRank = (normFamily: string): number => {
    for (let i = 0; i < preferredKeywords.length; i++) {
      const normKw = normalizeForMatch(preferredKeywords[i]);
      if (normFamily === normKw) return i * 4;
      if (normFamily.startsWith(normKw) || normKw.startsWith(normFamily)) return i * 4 + 1;
      if (normFamily.includes(normKw) || normKw.includes(normFamily)) return i * 4 + 2;
    }
    return 100;
  };

  entries.sort((a, b) => {
    // 1. Tier: Real public customer domains (0) always before dev (1), internal (2), content (3)
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }

    // 2. Family matching the instance keyword
    if (a.normFamily !== b.normFamily) {
      const adminRankA = getFamilyAdminRank(a.normFamily);
      const adminRankB = getFamilyAdminRank(b.normFamily);
      if (adminRankA !== adminRankB) return adminRankA - adminRankB;

      const has2ndA = secondLevelBases.has(a.familyKey) ? 0 : 1;
      const has2ndB = secondLevelBases.has(b.familyKey) ? 0 : 1;
      if (has2ndA !== has2ndB) return has2ndA - has2ndB;

      const famCmp = a.familyKey.localeCompare(b.familyKey, 'cs');
      if (famCmp !== 0) return famCmp;
    }

    // 3. SubRank (2nd level domain first, then subdomains)
    if (a.subRank !== b.subRank) {
      return a.subRank - b.subRank;
    }

    // 4. For 2nd-level domains of the same family (e.g. firotour.cz vs firotour.eu), prefer .cz first
    if (a.subRank === 0) {
      const tldOrder: Record<string, number> = { cz: 0, sk: 1, eu: 2, com: 3 };
      const rankTldA = tldOrder[a.tld] ?? 10;
      const rankTldB = tldOrder[b.tld] ?? 10;
      if (rankTldA !== rankTldB) return rankTldA - rankTldB;
    }

    if (a.cleanParts.length !== b.cleanParts.length) {
      return a.cleanParts.length - b.cleanParts.length;
    }

    // 5. Pair www.<domain> and <domain> together, always prioritizing www.<domain> first
    if (a.cleanHost !== b.cleanHost) {
      const cleanCmp = a.cleanHost.localeCompare(b.cleanHost, 'cs');
      if (cleanCmp !== 0) return cleanCmp;
    }

    if (a.isWww !== b.isWww) {
      return a.isWww ? -1 : 1;
    }

    return a.rawHost.localeCompare(b.rawHost, 'cs');
  });

  return entries.map((e) => e.url);
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

export function resolveDeployAgentFtpUrl(agent: DeployAgent, inst?: DeployInstance): string {
  const explicitInstFtp =
    inst?.properties?.ftpUrl ||
    inst?.properties?.FtpUrl ||
    inst?.properties?.ftp ||
    (inst?.meta as any)?.ftpUrl;
  if (explicitInstFtp && String(explicitInstFtp).trim()) {
    return String(explicitInstFtp).trim();
  }

  const explicitAgentFtp =
    agent?.properties?.ftpUrl ||
    agent?.properties?.FtpUrl ||
    agent?.properties?.ftp;
  if (explicitAgentFtp && String(explicitAgentFtp).trim()) {
    return String(explicitAgentFtp).trim();
  }

  const rawName = (agent?.name || '').trim();
  const machine = (agent?.machineName || '').trim().toUpperCase();
  const location = (agent?.properties?.location || '').trim().toUpperCase();

  // Extract short prefix before '(' e.g. "I(CMIS1247)" -> "I", "Medi(AOF1661)" -> "Medi"
  const prefixMatch = rawName.match(/^([A-Za-z0-9_-]+)\s*\(/);
  const shortPrefix = (prefixMatch ? prefixMatch[1] : rawName).trim().toLowerCase();

  if (location === 'CMIS') {
    if (shortPrefix === 'canaria' || machine === 'CMIS1241') return 'g.magicware-int.cz';
    if (shortPrefix === 'aof0933' || machine === 'AOF0933') return 'saturapp.magicware-int.cz';
    if (shortPrefix) return `${shortPrefix}.magicware-int.cz`;
  }

  if (location === 'ESOL') {
    if (machine === 'MAGICWARE-MW1' || shortPrefix === 'esol1') return 'esol1.magicware.cz';
    if (machine === 'MAGIC-VM-01' || shortPrefix === 'brenna') return 'esol2.magicware.cz';
    if (machine === 'MAGICWARE-MW3' || shortPrefix === 'tip') return 'esol3.magicware.cz';
    if (machine === 'MAGIC-VM-06' || shortPrefix === 'marcopolo') return 'esolend.magicware.cz';
    if (shortPrefix) return `${shortPrefix}.magicware.cz`;
  }

  if (shortPrefix === 'bill' || machine === 'BILL') return 'Bill';
  if (shortPrefix === 'globtour' || machine === 'ISTOUR') return 'istour.globtour.eu';
  if (shortPrefix === 'vegatour' || machine === 'VEGASQL') return '95.80.217.166';
  if (shortPrefix === 'liptour') return '46.229.233.29';

  return '';
}

export interface DeployFieldCandidate {
  key: string;
  label: string;
  scope: 'agent' | 'instance';
  jsonPath: string;
  defaultEnabled: boolean;
  value: string;
}

export const REQUIRED_DEPLOY_DB_SCHEMA_KEYS = [
  'agent.name',
  'instance.dbServerName',
  'instance.dbHost',
  'instance.database',
] as const;

const BASE_DEPLOY_SCHEMA_FIELDS: Omit<MagicGateDeploySchemaField, 'sampleValue' | 'presentCount'>[] = [
  // Root data (DeployAgent)
  { key: 'agent.name', label: 'Server', scope: 'agent', jsonPath: 'name', defaultEnabled: true, required: true },
  { key: 'agent.machineName', label: 'Stroj', scope: 'agent', jsonPath: 'machineName', defaultEnabled: true },
  { key: 'agent.ftpUrl', label: 'FTP', scope: 'agent', jsonPath: 'properties.ftpUrl', defaultEnabled: true },
  { key: 'agent.properties.location', label: 'Umístění serveru', scope: 'agent', jsonPath: 'properties.location', defaultEnabled: true },
  { key: 'agent.id', label: 'ID serveru (Agent ID)', scope: 'agent', jsonPath: 'id', defaultEnabled: false },
  { key: 'agent.agentVersion', label: 'Verze agenta', scope: 'agent', jsonPath: 'agentVersion', defaultEnabled: false },
  { key: 'agent.pwshVersion', label: 'Verze PowerShellu', scope: 'agent', jsonPath: 'pwshVersion', defaultEnabled: false },
  { key: 'agent.ring', label: 'Ring (prstenec)', scope: 'agent', jsonPath: 'ring', defaultEnabled: false },
  { key: 'agent.lastSeenAt', label: 'Agent naposledy online', scope: 'agent', jsonPath: 'lastSeenAt', defaultEnabled: false },
  { key: 'agent.identityNote', label: 'Poznámka serveru', scope: 'agent', jsonPath: 'identityNote', defaultEnabled: false },
  { key: 'agent.discoveryError', label: 'Chyba detekce serveru', scope: 'agent', jsonPath: 'discoveryError', defaultEnabled: false },

  // Instance data (DeployInstance in instances[])
  { key: 'instance.name', label: 'Instance', scope: 'instance', jsonPath: 'instances[].name', defaultEnabled: true },
  { key: 'instance.currentVersion', label: 'Verze', scope: 'instance', jsonPath: 'instances[].currentVersion', defaultEnabled: true },
  { key: 'instance.adminUrls', label: 'Admin URL', scope: 'instance', jsonPath: 'instances[].adminUrls', defaultEnabled: true },
  { key: 'instance.webUrls', label: 'Web URL', scope: 'instance', jsonPath: 'instances[].webUrls', defaultEnabled: true },
  { key: 'instance.dbServerName', label: 'DB Server', scope: 'instance', jsonPath: 'instances[].dbServerName', defaultEnabled: true, required: true },
  { key: 'instance.dbHost', label: 'DB Host (adresa)', scope: 'instance', jsonPath: 'instances[].dbHost', defaultEnabled: false, required: true },
  { key: 'instance.database', label: 'Databáze', scope: 'instance', jsonPath: 'instances[].database', defaultEnabled: true, required: true },
  { key: 'instance.instanceRoot', label: 'Cesta na serveru', scope: 'instance', jsonPath: 'instances[].instanceRoot', defaultEnabled: true },
  { key: 'instance.deployWindow', label: 'Nasazovací okno', scope: 'instance', jsonPath: 'instances[].deployWindow', defaultEnabled: true },
  { key: 'instance.id', label: 'ID instance', scope: 'instance', jsonPath: 'instances[].id', defaultEnabled: false },
  { key: 'instance.productId', label: 'Produkt', scope: 'instance', jsonPath: 'instances[].productId', defaultEnabled: false },
  { key: 'instance.currentVersionBuiltAt', label: 'Sestaveno dne', scope: 'instance', jsonPath: 'instances[].currentVersionBuiltAt', defaultEnabled: false },
  { key: 'instance.converted', label: 'Zkonvertováno (Converted)', scope: 'instance', jsonPath: 'instances[].converted', defaultEnabled: false },
  { key: 'instance.resourceKeys', label: 'Klíče zdrojů (resourceKeys)', scope: 'instance', jsonPath: 'instances[].resourceKeys', defaultEnabled: false },
  { key: 'instance.meta.iis', label: 'IIS Site', scope: 'instance', jsonPath: 'instances[].meta.iis', defaultEnabled: false },
  { key: 'instance.meta.dialect', label: 'SQL Dialekt', scope: 'instance', jsonPath: 'instances[].meta.dialect', defaultEnabled: false },
];

const KNOWN_AGENT_ROOT_KEYS = new Set([
  'id',
  'name',
  'machineName',
  'agentVersion',
  'pwshVersion',
  'ring',
  'lastSeenAt',
  'revoked',
  'identityNote',
  'discoveryError',
  'properties',
  'instances',
]);

const KNOWN_INSTANCE_KEYS = new Set([
  'id',
  'name',
  'instanceRoot',
  'path',
  'agentId',
  'productId',
  'currentVersion',
  'currentVersionBuiltAt',
  'version',
  'missingSince',
  'archivedAt',
  'archivedBy',
  'adminUrls',
  'webUrls',
  'dbServerName',
  'dbHost',
  'database',
  'meta',
  'resourceKeys',
  'deployWindow',
  'converted',
  'properties',
]);

function extractDeployInstanceFieldCandidates(
  agent: DeployAgent,
  inst: DeployInstance,
  ctx: {
    serverName: string;
    machineName: string;
    instanceName: string;
    adminUrl: string;
    webUrls: string[];
  }
): DeployFieldCandidate[] {
  const candidates: DeployFieldCandidate[] = [];

  // 1. Root agent fields
  candidates.push({
    key: 'agent.name',
    label: 'Server',
    scope: 'agent',
    jsonPath: 'name',
    defaultEnabled: true,
    value: ctx.serverName,
  });

  candidates.push({
    key: 'agent.machineName',
    label: 'Stroj',
    scope: 'agent',
    jsonPath: 'machineName',
    defaultEnabled: true,
    value: ctx.machineName,
  });

  const resolvedFtp = resolveDeployAgentFtpUrl(agent, inst);
  candidates.push({
    key: 'agent.ftpUrl',
    label: 'FTP',
    scope: 'agent',
    jsonPath: 'properties.ftpUrl',
    defaultEnabled: true,
    value: resolvedFtp,
  });

  candidates.push({
    key: 'agent.properties.location',
    label: 'Umístění serveru',
    scope: 'agent',
    jsonPath: 'properties.location',
    defaultEnabled: true,
    value: agent.properties?.location ? String(agent.properties.location).trim() : '',
  });

  candidates.push({
    key: 'agent.id',
    label: 'ID serveru (Agent ID)',
    scope: 'agent',
    jsonPath: 'id',
    defaultEnabled: false,
    value: agent.id != null ? String(agent.id) : '',
  });

  candidates.push({
    key: 'agent.agentVersion',
    label: 'Verze agenta',
    scope: 'agent',
    jsonPath: 'agentVersion',
    defaultEnabled: false,
    value: agent.agentVersion ? String(agent.agentVersion).trim() : '',
  });

  candidates.push({
    key: 'agent.pwshVersion',
    label: 'Verze PowerShellu',
    scope: 'agent',
    jsonPath: 'pwshVersion',
    defaultEnabled: false,
    value: agent.pwshVersion ? String(agent.pwshVersion).trim() : '',
  });

  candidates.push({
    key: 'agent.ring',
    label: 'Ring (prstenec)',
    scope: 'agent',
    jsonPath: 'ring',
    defaultEnabled: false,
    value: agent.ring ? String(agent.ring).trim() : '',
  });

  candidates.push({
    key: 'agent.lastSeenAt',
    label: 'Agent naposledy online',
    scope: 'agent',
    jsonPath: 'lastSeenAt',
    defaultEnabled: false,
    value: agent.lastSeenAt ? String(agent.lastSeenAt).trim() : '',
  });

  candidates.push({
    key: 'agent.identityNote',
    label: 'Poznámka serveru',
    scope: 'agent',
    jsonPath: 'identityNote',
    defaultEnabled: false,
    value: agent.identityNote ? String(agent.identityNote).trim() : '',
  });

  candidates.push({
    key: 'agent.discoveryError',
    label: 'Chyba detekce serveru',
    scope: 'agent',
    jsonPath: 'discoveryError',
    defaultEnabled: false,
    value: agent.discoveryError ? String(agent.discoveryError).trim() : '',
  });

  // Dynamic agent.properties.*
  if (agent.properties && typeof agent.properties === 'object') {
    for (const [k, v] of Object.entries(agent.properties)) {
      if (!k || k.toLowerCase() === 'location') continue;
      candidates.push({
        key: `agent.properties.${k}`,
        label: k,
        scope: 'agent',
        jsonPath: `properties.${k}`,
        defaultEnabled: true,
        value: v != null ? String(v).trim() : '',
      });
    }
  }

  // Any extra top-level primitive fields on agent
  for (const [k, v] of Object.entries(agent as Record<string, any>)) {
    if (KNOWN_AGENT_ROOT_KEYS.has(k) || v == null || typeof v === 'object') continue;
    candidates.push({
      key: `agent.${k}`,
      label: `Server: ${k}`,
      scope: 'agent',
      jsonPath: k,
      defaultEnabled: false,
      value: String(v).trim(),
    });
  }

  // 2. Instance fields (instances[])
  candidates.push({
    key: 'instance.name',
    label: 'Instance',
    scope: 'instance',
    jsonPath: 'instances[].name',
    defaultEnabled: true,
    value: ctx.instanceName,
  });

  candidates.push({
    key: 'instance.currentVersion',
    label: 'Verze',
    scope: 'instance',
    jsonPath: 'instances[].currentVersion',
    defaultEnabled: true,
    value: String(inst.currentVersion || inst.version || '').trim(),
  });

  candidates.push({
    key: 'instance.adminUrls',
    label: 'Admin URL',
    scope: 'instance',
    jsonPath: 'instances[].adminUrls',
    defaultEnabled: true,
    value: ctx.adminUrl,
  });

  candidates.push({
    key: 'instance.webUrls',
    label: 'Web URL',
    scope: 'instance',
    jsonPath: 'instances[].webUrls',
    defaultEnabled: true,
    value: ctx.webUrls.join(', '),
  });

  const dbServer = inst.dbServerName || inst.dbHost || extractDbServerFromResourceKeys(inst.resourceKeys);
  candidates.push({
    key: 'instance.dbServerName',
    label: 'DB Server',
    scope: 'instance',
    jsonPath: 'instances[].dbServerName',
    defaultEnabled: true,
    value: dbServer ? String(dbServer).trim() : '',
  });

  candidates.push({
    key: 'instance.dbHost',
    label: 'DB Host (adresa)',
    scope: 'instance',
    jsonPath: 'instances[].dbHost',
    defaultEnabled: false,
    value: inst.dbHost ? String(inst.dbHost).trim() : '',
  });

  const dbName = inst.database || inst.meta?.database;
  candidates.push({
    key: 'instance.database',
    label: 'Databáze',
    scope: 'instance',
    jsonPath: 'instances[].database',
    defaultEnabled: true,
    value: dbName ? String(dbName).trim() : '',
  });

  const rootPath = inst.instanceRoot || inst.path;
  candidates.push({
    key: 'instance.instanceRoot',
    label: 'Cesta na serveru',
    scope: 'instance',
    jsonPath: 'instances[].instanceRoot',
    defaultEnabled: true,
    value: rootPath ? String(rootPath).trim() : '',
  });

  candidates.push({
    key: 'instance.deployWindow',
    label: 'Nasazovací okno',
    scope: 'instance',
    jsonPath: 'instances[].deployWindow',
    defaultEnabled: true,
    value: inst.deployWindow ? String(inst.deployWindow).trim() : '',
  });

  candidates.push({
    key: 'instance.id',
    label: 'ID instance',
    scope: 'instance',
    jsonPath: 'instances[].id',
    defaultEnabled: false,
    value: inst.id != null ? String(inst.id) : '',
  });

  candidates.push({
    key: 'instance.productId',
    label: 'Produkt',
    scope: 'instance',
    jsonPath: 'instances[].productId',
    defaultEnabled: false,
    value: inst.productId ? String(inst.productId).trim() : '',
  });

  candidates.push({
    key: 'instance.currentVersionBuiltAt',
    label: 'Sestaveno dne',
    scope: 'instance',
    jsonPath: 'instances[].currentVersionBuiltAt',
    defaultEnabled: false,
    value: inst.currentVersionBuiltAt ? String(inst.currentVersionBuiltAt).trim() : '',
  });

  candidates.push({
    key: 'instance.converted',
    label: 'Zkonvertováno (Converted)',
    scope: 'instance',
    jsonPath: 'instances[].converted',
    defaultEnabled: false,
    value: typeof inst.converted === 'boolean' ? (inst.converted ? 'Ano' : 'Ne') : '',
  });

  candidates.push({
    key: 'instance.resourceKeys',
    label: 'Klíče zdrojů (resourceKeys)',
    scope: 'instance',
    jsonPath: 'instances[].resourceKeys',
    defaultEnabled: false,
    value: Array.isArray(inst.resourceKeys) ? inst.resourceKeys.join(', ') : '',
  });

  candidates.push({
    key: 'instance.meta.iis',
    label: 'IIS Site',
    scope: 'instance',
    jsonPath: 'instances[].meta.iis',
    defaultEnabled: false,
    value: inst.meta?.iis ? String(inst.meta.iis).trim() : '',
  });

  candidates.push({
    key: 'instance.meta.dialect',
    label: 'SQL Dialekt',
    scope: 'instance',
    jsonPath: 'instances[].meta.dialect',
    defaultEnabled: false,
    value: inst.meta?.dialect ? String(inst.meta.dialect).trim() : '',
  });

  // Dynamic instance.meta.*
  if (inst.meta && typeof inst.meta === 'object') {
    for (const [k, v] of Object.entries(inst.meta)) {
      if (!k || k === 'database' || k === 'iis' || k === 'dialect') continue;
      candidates.push({
        key: `instance.meta.${k}`,
        label: `Meta: ${k}`,
        scope: 'instance',
        jsonPath: `instances[].meta.${k}`,
        defaultEnabled: false,
        value: v != null ? String(v).trim() : '',
      });
    }
  }

  // Dynamic instance.properties.*
  if (inst.properties && typeof inst.properties === 'object') {
    for (const [k, v] of Object.entries(inst.properties)) {
      if (!k) continue;
      candidates.push({
        key: `instance.properties.${k}`,
        label: k,
        scope: 'instance',
        jsonPath: `instances[].properties.${k}`,
        defaultEnabled: true,
        value: v != null ? String(v).trim() : '',
      });
    }
  }

  // Any extra top-level primitive fields on instance
  for (const [k, v] of Object.entries(inst as Record<string, any>)) {
    if (KNOWN_INSTANCE_KEYS.has(k) || v == null || typeof v === 'object') continue;
    candidates.push({
      key: `instance.${k}`,
      label: k,
      scope: 'instance',
      jsonPath: `instances[].${k}`,
      defaultEnabled: false,
      value: String(v).trim(),
    });
  }

  return candidates;
}

/**
 * Converts DeployAgent[] from /api/ui/agents into IADonkey LauncherItem[]
 * matching the structure and capabilities of parseMagicGateXml().
 */
export function parseMagicGateDeployAgents(
  agents: DeployAgent[],
  selectedInfoFields?: string[]
): LauncherItem[] {
  if (!Array.isArray(agents)) return [];

  const hasCustomSchema = Array.isArray(selectedInfoFields);
  const selectedSet = hasCustomSchema ? new Set(selectedInfoFields) : null;

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

      const adminIdentities = new Set(adminUrls.map(normalizeUrlIdentity));

      // Filter out any webUrl that duplicates an adminUrl (even if http vs https or www vs non-www)
      const filteredRawWebUrls = (Array.isArray(inst.webUrls) ? inst.webUrls : [])
        .map((u) => (u || '').trim())
        .filter(isValidHttpUrl)
        .filter((u) => !adminIdentities.has(normalizeUrlIdentity(u)));

      const webUrls = sortMagicGateWebUrls(filteredRawWebUrls, adminUrls, instanceName);

      // Track non-www hostnames so if both atis.cz and www.atis.cz exist, www.atis.cz keeps "www." in its label
      const nonWwwHosts = new Set(
        webUrls
          .map((u) => getHostnameLabel(u, true).toLowerCase())
          .filter((h) => !h.startsWith('www.'))
      );

      const validApps: { name: string; url: string }[] = [];

      // 1. Primary Administration URL (becomes mainApp on the parent item; not duplicated in subitems)
      if (adminUrls.length > 0) {
        validApps.push({ name: 'Administrace', url: adminUrls[0] });
      }

      // 2. Web / API / BO URLs
      const nonContentWebUrls = webUrls.filter(
        (u) => !getHostnameLabel(u).toLowerCase().endsWith('.iscontent.cz')
      );

      webUrls.forEach((url) => {
        const rawHost = getHostnameLabel(url, true);
        const strippedHost = getHostnameLabel(url, false);
        const keepWwwInLabel = rawHost.toLowerCase().startsWith('www.') && nonWwwHosts.has(strippedHost.toLowerCase());
        const host = keepWwwInLabel ? rawHost : strippedHost;
        const hostLower = strippedHost.toLowerCase();

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
      const mainIdentity = normalizeUrlIdentity(mainApp.url);
      const otherApps = validApps.slice(1).filter((appItem) => normalizeUrlIdentity(appItem.url) !== mainIdentity);

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

      const candidates = extractDeployInstanceFieldCandidates(agent, inst, {
        serverName,
        machineName,
        instanceName,
        adminUrl,
        webUrls,
      });

      // Default display order matches previous behavior when custom schema is not set
      const defaultOrderPriority: Record<string, number> = {
        'agent.name': 1,
        'agent.machineName': 2,
        'instance.name': 3,
        'instance.currentVersion': 4,
        'instance.adminUrls': 5,
        'instance.webUrls': 6,
        'instance.dbServerName': 7,
        'instance.dbHost': 8,
        'instance.database': 9,
        'instance.instanceRoot': 10,
        'agent.properties.location': 11,
        'instance.deployWindow': 12,
      };

      const orderedCandidates = [...candidates].sort((a, b) => {
        const pA = defaultOrderPriority[a.key] ?? 100;
        const pB = defaultOrderPriority[b.key] ?? 100;
        return pA - pB;
      });

      let isSsmsActive = false;
      let isFtpActive = true;
      try {
        const cfgPath = path.join(USER_DATA_PATH, 'config.json');
        if (fs.existsSync(cfgPath)) {
          const parsedCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          isSsmsActive = Boolean(parsedCfg?.extensions?.ssms);
          isFtpActive = parsedCfg?.magicgate?.enableFtp !== false;
        }
      } catch {}
      const essentialKeys = new Set<string>([
        ...(isSsmsActive ? REQUIRED_DEPLOY_DB_SCHEMA_KEYS : []),
        ...(isFtpActive ? ['agent.ftpUrl'] : []),
      ]);

      const info: Record<string, any> = {};
      for (const field of orderedCandidates) {
        if (!field.value) continue;
        const shouldInclude = selectedSet
          ? selectedSet.has(field.key) || essentialKeys.has(field.key)
          : field.defaultEnabled || essentialKeys.has(field.key);
        if (!shouldInclude) continue;

        // In default mode, skip 'Stroj' if it's identical to 'Server'
        if (
          !hasCustomSchema &&
          field.key === 'agent.machineName' &&
          machineName.toLowerCase() === serverName.toLowerCase()
        ) {
          continue;
        }

        if (info[field.label] === undefined) {
          info[field.label] = field.value;
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

    let googleClickInterval: NodeJS.Timeout | null = null;

    const finish = (result: { ok: boolean; email?: string; role?: string; cookie?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (googleClickInterval) {
        clearInterval(googleClickInterval);
        googleClickInterval = null;
      }
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

    const tryAutoClickGoogleAccount = async () => {
      if (resolved || silentWin.isDestroyed()) return;
      const currentUrl = silentWin.webContents.getURL();
      if (!currentUrl.includes('accounts.google.com')) return;
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
    };

    silentWin.webContents.on('did-finish-load', async () => {
      if (resolved || silentWin.isDestroyed()) return;
      const currentUrl = silentWin.webContents.getURL();
      if (currentUrl.startsWith(baseUrl) && !currentUrl.includes('/auth/login')) {
        tryVerifySilent();
        return;
      }

      // If Google OAuth Account Chooser is shown with an already signed-in account, click it silently
      if (currentUrl.includes('accounts.google.com')) {
        await tryAutoClickGoogleAccount();
        if (!googleClickInterval) {
          googleClickInterval = setInterval(() => {
            tryAutoClickGoogleAccount();
          }, 450);
        }
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
 * If the session cookie expired (401/302), automatically attempts silent Google SSO re-authentication in background,
 * and if silent re-auth cannot complete, pops up the interactive login window so the user can re-authenticate immediately.
 */
export async function fetchMagicGateDeployItems(
  settings?: MagicGateSettings,
  options?: { allowSilentReauth?: boolean; allowInteractiveReauth?: boolean }
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
  const allowInteractive = options?.allowInteractiveReauth !== false;

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
      diagnosticsService.logAction({
        type: 'sync',
        title: 'MagicGate Deploy API: Platnost session cookie vypršela',
        details: `Server ${baseUrl} vrátil HTTP ${res.status}. Spouštím tichou obnovu cookie přes Google SSO na pozadí...`,
        status: 'warn',
      });

      const silentRes = await trySilentDeployReauth(baseUrl, settings?.apiUserEmail);
      if (silentRes.ok && silentRes.cookie) {
        cookieOrToken = silentRes.cookie;
        refreshedEmail = silentRes.email;
        refreshedRole = silentRes.role;

        diagnosticsService.logAction({
          type: 'sync',
          title: 'MagicGate Deploy API: Session cookie tiše obnovena',
          details: `Úspěšně získána nová session cookie na pozadí${silentRes.email ? ` (${silentRes.email})` : ''} pro ${baseUrl}.`,
          status: 'success',
        });

        const rebuilt = await buildDeployRequestHeaders(baseUrl, cookieOrToken);
        headers = rebuilt.headers;
        resolvedCookie = rebuilt.resolvedCookie;

        res = await fetch(`${baseUrl}/api/ui/agents`, {
          method: 'GET',
          headers,
          redirect: 'manual',
        });
      } else {
        diagnosticsService.logAction({
          type: 'sync',
          title: 'MagicGate Deploy API: Tichá obnova session cookie selhala',
          details: `Automatická obnova Google SSO relace pro ${baseUrl} neproběhla – otevírám přihlašovací okno.`,
          status: 'warn',
        });
      }
    }

    // If still unauthorized after silent re-auth attempt, pop up interactive login window
    if (
      (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) &&
      allowInteractive
    ) {
      const interactiveRes = await loginToMagicGateDeployInteractive(baseUrl, null, { skipItemsFetch: true });
      if (interactiveRes.ok && interactiveRes.cookie) {
        cookieOrToken = interactiveRes.cookie;
        refreshedEmail = interactiveRes.email;
        refreshedRole = interactiveRes.role;

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
      const errMsg = 'Nejste přihlášeni k Deploy serveru (platnost přihlášení vypršela). Přihlaste se prosím v Nastavení -> MagicGate.';
      diagnosticsService.logAction({
        type: 'sync',
        title: 'Synchronizace MagicGate (Deploy API) – nepřihlášen',
        details: `${baseUrl} (HTTP ${res.status})`,
        status: 'error',
      });
      return {
        ok: false,
        items: [],
        error: errMsg,
      };
    }

    if (!res.ok) {
      const errMsg = `Deploy server vrátil chybu HTTP ${res.status}.`;
      diagnosticsService.logAction({
        type: 'sync',
        title: 'Synchronizace MagicGate (Deploy API) selhala',
        details: `${baseUrl}: ${errMsg}`,
        status: 'error',
      });
      return {
        ok: false,
        items: [],
        error: errMsg,
      };
    }

    const agents = (await res.json()) as DeployAgent[];
    saveMagicGateDeployRawAgentsCache(agents);
    const items = parseMagicGateDeployAgents(agents, settings?.apiInfoFields);

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

    diagnosticsService.logAction({
      type: 'sync',
      title: 'Synchronizace MagicGate (Deploy API)',
      details: `Načteno ${items.length} aktivních instancí ze serveru ${baseUrl}${email ? ` (${email})` : ''}.`,
      status: 'success',
    });

    return {
      ok: true,
      items,
      email,
      role,
      cookie: resolvedCookie || cookieOrToken,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Chyba při stahování instancí z Deploy API.';
    diagnosticsService.logAction({
      type: 'sync',
      title: 'Chyba spojení s MagicGate Deploy API',
      details: `${baseUrl}: ${errMsg}`,
      status: 'error',
    });
    return {
      ok: false,
      items: [],
      error: errMsg,
    };
  }
}

/**
 * Saves raw DeployAgent[] response to disk so schema discovery and instant field toggling work offline
 */
export function saveMagicGateDeployRawAgentsCache(agents: DeployAgent[]): void {
  try {
    if (!Array.isArray(agents)) return;
    const tmpFile = `${DEPLOY_RAW_AGENTS_CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(agents, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DEPLOY_RAW_AGENTS_CACHE_FILE);
  } catch (err) {
    console.error('[MagicGateDeployApi] Failed to save raw agents cache:', err);
  }
}

/**
 * Loads raw DeployAgent[] response from disk cache
 */
export function loadMagicGateDeployRawAgentsCache(): DeployAgent[] {
  try {
    if (fs.existsSync(DEPLOY_RAW_AGENTS_CACHE_FILE)) {
      const raw = fs.readFileSync(DEPLOY_RAW_AGENTS_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as DeployAgent[];
      }
    }
  } catch (err) {
    console.error('[MagicGateDeployApi] Failed to load raw agents cache:', err);
  }
  return [];
}

/**
 * Builds the interactive schema of available Root (DeployAgent) and Instance (DeployInstance) fields
 * with sample values discovered from the synced /api/ui/agents response (or fallback item cache).
 */
export function getMagicGateDeploySchema(): {
  ok: boolean;
  hasSyncedData: boolean;
  hasRawCache: boolean;
  totalInstances: number;
  fields: MagicGateDeploySchemaField[];
} {
  const fieldMap = new Map<string, MagicGateDeploySchemaField>();

  for (const baseField of BASE_DEPLOY_SCHEMA_FIELDS) {
    fieldMap.set(baseField.key, {
      ...baseField,
      sampleValue: undefined,
      presentCount: 0,
    });
  }

  const rawAgents = loadMagicGateDeployRawAgentsCache();
  let totalInstances = 0;

  if (rawAgents.length > 0) {
    for (const agent of rawAgents) {
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
        if (!instanceName || instanceName.toLowerCase().includes('bench')) continue;
        if (inst.missingSince || inst.archivedAt) continue;

        totalInstances++;

        const adminUrls = (Array.isArray(inst.adminUrls) ? inst.adminUrls : [])
          .map((u) => (u || '').trim())
          .filter(isValidHttpUrl);
        const adminIdentities = new Set(adminUrls.map(normalizeUrlIdentity));
        const filteredRawWebUrls = (Array.isArray(inst.webUrls) ? inst.webUrls : [])
          .map((u) => (u || '').trim())
          .filter(isValidHttpUrl)
          .filter((u) => !adminIdentities.has(normalizeUrlIdentity(u)));
        const webUrls = sortMagicGateWebUrls(filteredRawWebUrls, adminUrls, instanceName);
        const adminUrl = adminUrls[0] || webUrls[0] || '';

        const candidates = extractDeployInstanceFieldCandidates(agent, inst, {
          serverName,
          machineName,
          instanceName,
          adminUrl,
          webUrls,
        });

        for (const cand of candidates) {
          let existing = fieldMap.get(cand.key);
          if (!existing) {
            existing = {
              key: cand.key,
              label: cand.label,
              scope: cand.scope,
              jsonPath: cand.jsonPath,
              defaultEnabled: cand.defaultEnabled,
              sampleValue: undefined,
              presentCount: 0,
            };
            fieldMap.set(cand.key, existing);
          }
          if (cand.value) {
            existing.presentCount = (existing.presentCount || 0) + 1;
            if (!existing.sampleValue) {
              existing.sampleValue = cand.value.length > 90 ? `${cand.value.slice(0, 87)}...` : cand.value;
            }
          }
        }
      }
    }
  } else {
    // Fallback: if user synced before raw cache existed, populate samples from existing item cache
    const cachedItems = loadMagicGateDeployCache();
    totalInstances = cachedItems.length;
    const labelToKey = new Map<string, string>();
    for (const f of fieldMap.values()) {
      labelToKey.set(f.label, f.key);
    }
    for (const item of cachedItems) {
      if (!item.info || typeof item.info !== 'object') continue;
      for (const [label, val] of Object.entries(item.info)) {
        const strVal = val != null ? String(val).trim() : '';
        if (!strVal) continue;
        const knownKey = labelToKey.get(label);
        if (knownKey) {
          const entry = fieldMap.get(knownKey)!;
          entry.presentCount = (entry.presentCount || 0) + 1;
          if (!entry.sampleValue) {
            entry.sampleValue = strVal.length > 90 ? `${strVal.slice(0, 87)}...` : strVal;
          }
        }
      }
    }
  }

  return {
    ok: true,
    hasSyncedData: totalInstances > 0,
    hasRawCache: rawAgents.length > 0,
    totalInstances,
    fields: Array.from(fieldMap.values()),
  };
}

/**
 * Re-applies the user's selected info schema onto the cached raw DeployAgent[] data
 * and updates the persisted LauncherItem[] cache immediately without requiring a network roundtrip.
 */
export function reapplyMagicGateDeployInfoSchema(selectedInfoFields?: string[]): LauncherItem[] | null {
  const rawAgents = loadMagicGateDeployRawAgentsCache();
  if (rawAgents.length === 0) {
    return null;
  }
  const items = parseMagicGateDeployAgents(rawAgents, selectedInfoFields);
  saveMagicGateDeployCache(items);
  return items;
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
export function loadMagicGateDeployCache(selectedInfoFields?: string[]): LauncherItem[] {
  const rawAgents = loadMagicGateDeployRawAgentsCache();
  if (rawAgents.length > 0) {
    return parseMagicGateDeployAgents(rawAgents, selectedInfoFields);
  }
  try {
    if (fs.existsSync(DEPLOY_CACHE_FILE)) {
      const raw = fs.readFileSync(DEPLOY_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item: LauncherItem) => {
          if (!Array.isArray(item.options) || item.options.length === 0) {
            return item;
          }
          const adminUrl = item.info?.['Admin URL'] || item.location || '';
          const adminIdentity = adminUrl ? normalizeUrlIdentity(String(adminUrl)) : '';
          const filteredOpts = item.options.filter((opt) => {
            if (!opt?.location) return true;
            return !adminIdentity || normalizeUrlIdentity(String(opt.location)) !== adminIdentity;
          });
          const sortedUrls = sortMagicGateWebUrls(
            filteredOpts.map((o) => String(o.location || '')).filter(Boolean),
            adminUrl ? [String(adminUrl)] : [],
            item.name || ''
          );
          const urlRank = new Map<string, number>();
          sortedUrls.forEach((u, idx) => {
            if (!urlRank.has(u)) urlRank.set(u, idx);
          });
          const sortedOpts = [...filteredOpts].sort((a, b) => {
            const rA = urlRank.get(String(a.location || '')) ?? 9999;
            const rB = urlRank.get(String(b.location || '')) ?? 9999;
            return rA - rB;
          });
          return {
            ...item,
            options: sortedOpts.length > 0 ? sortedOpts : undefined,
          };
        });
      }
    }
  } catch (err) {
    console.error('[MagicGateDeployApi] Failed to load deploy cache:', err);
  }
  return [];
}

let activeInteractiveLoginPromise: Promise<{
  ok: boolean;
  email?: string;
  role?: string;
  cookie?: string;
  instanceCount?: number;
  error?: string;
}> | null = null;
let activeInteractiveAuthWindow: BrowserWindow | null = null;

/**
 * Opens an interactive Electron BrowserWindow for Google SSO login to the configured Deploy server
 * and resolves with the captured session cookie and user identity once signed in.
 */
export async function loginToMagicGateDeployInteractive(
  rawBaseUrl?: string,
  parentWindow?: BrowserWindow | null,
  options?: { skipItemsFetch?: boolean }
): Promise<{
  ok: boolean;
  email?: string;
  role?: string;
  cookie?: string;
  instanceCount?: number;
  error?: string;
}> {
  if (activeInteractiveLoginPromise) {
    try {
      if (activeInteractiveAuthWindow && !activeInteractiveAuthWindow.isDestroyed()) {
        if (activeInteractiveAuthWindow.isMinimized()) {
          activeInteractiveAuthWindow.restore();
        }
        activeInteractiveAuthWindow.show();
        activeInteractiveAuthWindow.focus();
      }
    } catch {}
    return activeInteractiveLoginPromise;
  }

  const baseUrl = normalizeDeployBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Zadejte prosím nejprve URL serveru Deploy.',
    };
  }
  const targetHost = getHostnameLabel(baseUrl).toLowerCase();
  const loginUrl = `${baseUrl}/auth/login?returnUrl=${encodeURIComponent('/')}`;

  diagnosticsService.logAction({
    type: 'window',
    title: 'MagicGate Deploy API: Otevřeno okno přihlášení (Google SSO)',
    details: loginUrl,
    status: 'info',
  });

  activeInteractiveLoginPromise = new Promise((resolve) => {
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
      if (result.ok) {
        diagnosticsService.logAction({
          type: 'sync',
          title: 'MagicGate Deploy API: Přihlášení přes Google SSO úspěšné',
          details: `Uživatel: ${result.email || 'neznámý'}${result.role ? ` (${result.role})` : ''}${typeof result.instanceCount === 'number' ? `, načteno instancí: ${result.instanceCount}` : ''}`,
          status: 'success',
        });
      } else {
        diagnosticsService.logAction({
          type: 'sync',
          title: 'MagicGate Deploy API: Přihlášení nebylo dokončeno',
          details: result.error || 'Okno zavřeno',
          status: 'warn',
        });
      }
      try {
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      } catch {}
      try {
        if (!authWin.isDestroyed()) {
          authWin.close();
        }
      } catch {}
      activeInteractiveAuthWindow = null;
      activeInteractiveLoginPromise = null;
      resolve(result);
    };

    const authWin = new BrowserWindow({
      width: 540,
      height: 700,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: false,
      show: true,
      autoHideMenuBar: true,
      title: 'Přihlášení – MagicGate Deploy API',
      backgroundColor: '#0f1117',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    activeInteractiveAuthWindow = authWin;

    try {
      authWin.focus();
    } catch {}

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
          let instanceCount: number | undefined;
          if (!options?.skipItemsFetch) {
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
              { allowSilentReauth: false, allowInteractiveReauth: false }
            );
            instanceCount = fetchRes.ok ? fetchRes.items.length : undefined;
          }

          finish({
            ok: true,
            email: meCheck.me.email,
            role: meCheck.me.role,
            cookie: cookieHeader,
            instanceCount,
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

  return activeInteractiveLoginPromise;
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
    diagnosticsService.logAction({
      type: 'action',
      title: 'MagicGate Deploy API: Odhlášení ze serveru',
      details: `Vymazána session cookie pro ${baseUrl}`,
      status: 'info',
    });
  } catch (err) {
    console.error('[MagicGateDeployApi] Error clearing cookies:', err);
  }
}
