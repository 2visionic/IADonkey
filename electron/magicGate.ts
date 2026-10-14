import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AppConfig } from '../src/types';

// Cryptographic keys extracted from MagicWare.MagicGate
const RIJN_KEY = Buffer.from([
  69, 229, 180, 207, 34, 6, 164, 125, 129, 204, 146, 10, 216, 32, 118, 162,
  117, 215, 101, 158, 70, 139, 159, 214, 87, 44, 97, 39, 203, 198, 170, 248,
]);

const RIJN_IV = Buffer.from([
  16, 23, 243, 15, 75, 150, 130, 237, 168, 84, 21, 214, 153, 151, 68, 133,
]);

/**
 * Computes the internal password hash using AES-256-CBC and SHA-256
 */
export function getMagicPasswordHash(salt: string, plainPassword: string): string {
  if (!salt || !plainPassword) return '';

  const plainBytes = Buffer.from(salt + plainPassword, 'utf16le');
  const remainder = plainBytes.length % 16;
  const padLen = remainder === 0 ? 0 : 16 - remainder;
  const paddedBytes = Buffer.concat([plainBytes, Buffer.alloc(padLen, 0)]);

  const cipher = crypto.createCipheriv('aes-256-cbc', RIJN_KEY, RIJN_IV);
  cipher.setAutoPadding(false);

  const encrypted = Buffer.concat([cipher.update(paddedBytes), cipher.final()]);
  const sha256 = crypto.createHash('sha256').update(encrypted).digest();
  return sha256.toString('utf8');
}

/**
 * Computes the signature key passed as AuthenticationKey
 */
export function getAuthenticationKey(salt: string, plainPassword: string, requestKey: string): string {
  const hash = getMagicPasswordHash(salt, plainPassword);
  const toSign = [salt, hash, requestKey].join('|');
  const sha256 = crypto.createHash('sha256').update(Buffer.from(toSign, 'utf8')).digest();
  return sha256.toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

/**
 * Automatically imports and decrypts MagicGate credentials from Wox settings if available
 */
export function tryImportWoxCredentials(): { username: string; password: string } | null {
  try {
    const appData = process.env.APPDATA || '';
    const woxSettingsPath = path.join(appData, 'Wox', 'Settings', 'Plugins', 'Wox.MagicGate', 'Settings.json');
    if (!fs.existsSync(woxSettingsPath)) {
      return null;
    }

    const raw = fs.readFileSync(woxSettingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    const username = (settings.Username || '').trim();
    const encPass = (settings.EncryptedPassword || '').trim();

    if (!encPass) {
      return username ? { username, password: '' } : null;
    }

    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encPass)) {
      console.warn('[MagicGate] Invalid Base64 in Wox EncryptedPassword, skipping DPAPI decrypt.');
      return username ? { username, password: '' } : null;
    }

    const psScript = [
      'Add-Type -AssemblyName System.Security;',
      '$b = [Convert]::FromBase64String($env:WOX_ENC_PASS);',
      '$d = [System.Security.Cryptography.ProtectedData]::Unprotect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
      '[Console]::Write([System.Text.Encoding]::UTF8.GetString($d));',
    ].join(' ');

    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      env: { ...process.env, WOX_ENC_PASS: encPass },
      encoding: 'utf-8',
      windowsHide: true,
    });

    if (res.error || res.status !== 0) {
      throw res.error || new Error(res.stderr || 'DPAPI decrypt failed');
    }

    const password = (res.stdout || '').trim();

    return { username, password };
  } catch (err) {
    console.warn('[MagicGate] Could not auto-import credentials from Wox:', err);
    return null;
  }
}

/**
 * Performs handshake with AutoLogin.ashx and constructs the signed auto-login URL
 */
export async function getMagicGateAutoLoginUrl(targetUrl: string, config: AppConfig): Promise<string> {
  let username = config.magicgate?.username?.trim();
  let password = config.magicgate?.password?.trim();

  // If credentials are empty in config, attempt to load from Wox
  if (!username || !password) {
    const woxCreds = tryImportWoxCredentials();
    if (woxCreds) {
      if (!username && woxCreds.username) username = woxCreds.username;
      if (!password && woxCreds.password) password = woxCreds.password;
    }
  }

  if (!username || !password) {
    throw new Error('Chybí přihlašovací údaje pro MagicGate. Zadejte je v Nastavení aplikace.');
  }

  const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  console.log(`[MagicGate] Requesting handshake from ${baseUrl}/AutoLogin.ashx for user ${username}...`);
  const tokenUrl = `${baseUrl}/AutoLogin.ashx?UN=${encodeURIComponent(username)}`;
  const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(15000) });

  if (!tokenRes.ok) {
    throw new Error(`AutoLogin handshake selhal (HTTP ${tokenRes.status})`);
  }

  const tokenText = await tokenRes.text();
  if (!tokenText.startsWith('OK')) {
    throw new Error(`AutoLogin server odmítl požadavek: ${tokenText}`);
  }

  const rawKey = tokenText.substring(2);
  let requestKey = rawKey;
  let salt = username;

  if (rawKey.includes('|')) {
    const parts = rawKey.split('|');
    requestKey = parts[0];
    salt = parts[1] || username;
  }

  const authKey = getAuthenticationKey(salt, password, requestKey);

  const autoLoginUrl = `${baseUrl}/AutoLogin.ashx?AuthenticationKey=${encodeURIComponent(
    authKey
  )}&AuthenticationName=${encodeURIComponent(username)}&RequestKey=${encodeURIComponent(requestKey)}`;

  console.log(`[MagicGate] Handshake successful for ${baseUrl}/AutoLogin.ashx (user: ${username})`);
  return autoLoginUrl;
}
