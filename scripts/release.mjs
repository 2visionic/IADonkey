import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log('\n\x1b[36m=== IADonkey Release Tool ===\x1b[0m');

  // 1. Zjistime stavajici verzi
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVer = pkg.version || '0.1.0';

  console.log(`\x1b[33mAktualni verze v package.json: ${currentVer}\x1b[0m`);

  // Zkontrolujeme, zda tag pro currentVer uz existuje na gitu
  let tagExists = false;
  try {
    const existingTags = execSync('git tag -l', { cwd: rootDir, encoding: 'utf8' });
    tagExists = existingTags.split(/\r?\n/).map(t => t.trim()).includes(`v${currentVer}`);
  } catch {}

  // Navrhnout dalsi patch verzi pro pripad, ze aktualni verze uz byla vydana
  const parts = currentVer.split('.');
  const nextPatch = parts.length === 3 
    ? `${parts[0]}.${parts[1]}.${parseInt(parts[2], 10) + 1}`
    : `${currentVer}.1`;

  // Pokud aktualni verze jeste nebyla vydana/otagovana, nabidneme prave ji!
  const suggestedVer = tagExists ? nextPatch : currentVer;

  const inputVer = await rl.question(`Zadejte verzi pro release [${suggestedVer}]: `);
  const version = inputVer.trim() || suggestedVer;

  console.log(`\n\x1b[32mPripravuji release verze ${version}...\x1b[0m`);

  // 2. Aktualizace package.json
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✓ Aktualizovan package.json na verzi ${version}`);

  // 3. Aktualizace src/changelog.ts
  const changelogPath = path.join(rootDir, 'src', 'changelog.ts');
  if (fs.existsSync(changelogPath)) {
    let changelogCode = fs.readFileSync(changelogPath, 'utf8');
    changelogCode = changelogCode.replace(
      /export const CURRENT_APP_VERSION = '.*?';/,
      `export const CURRENT_APP_VERSION = '${version}';`
    );
    fs.writeFileSync(changelogPath, changelogCode, 'utf8');
    console.log(`✓ Aktualizovan src/changelog.ts (CURRENT_APP_VERSION = '${version}')`);
  }

  // 4. Aktualizace version.json
  const versionJsonPath = path.join(rootDir, 'version.json');
  const versionData = {
    version: version,
    releaseNotes: `• Vydána nová verze ${version} aplikace IADonkey.\n• Přehled všech změn po aktualizaci naleznete v aplikaci v záložce Nastavení -> Kompletní changelog.`,
    downloadUrl: `https://github.com/2visionic/IADonkey/releases/download/v${version}/IADonkey-Setup-${version}.exe`,
    zipUrl: `https://github.com/2visionic/IADonkey/releases/download/v${version}/IADonkey-${version}.zip`,
  };
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
  console.log(`✓ Aktualizovan version.json pro update system`);

  // 5. Build aplikace
  console.log('\n\x1b[36mSestavuji aplikaci (npm run build:exe)...\x1b[0m');
  try {
    execSync('npm run build:exe', { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    console.error('\x1b[31mChyba pri kompilaci nebo baleni aplikace:\x1b[0m', err.message);
    rl.close();
    process.exit(1);
  }

  // Hledani vytvorenych souboru ve slozce release (exe instalator + zip balicek pro in-app update)
  const releaseDir = path.join(rootDir, 'release');
  const releaseAssets = [];

  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir);
    const matched = files.filter(f => f.includes(version) && (f.endsWith('.exe') || f.endsWith('.zip')));
    for (const f of matched) {
      releaseAssets.push({ name: f, path: path.join(releaseDir, f) });
    }
  }

  if (releaseAssets.length > 0) {
    console.log(`\n\x1b[32m✓ Nalezeny soubory k vydání verze ${version}:\x1b[0m`);
    for (const asset of releaseAssets) {
      console.log(`  • ${asset.name} (${(fs.statSync(asset.path).size / (1024 * 1024)).toFixed(1)} MB)`);
    }
  } else {
    console.log(`\n\x1b[33mUpozorneni: Zadne soubory verze ${version} nebyly nalezeny v release slozce.\x1b[0m`);
  }

  // 6. Git commit a tag
  console.log('\n\x1b[36m=== Git verzovani ===\x1b[0m');
  const doGit = await rl.question(`Chcete provest git commit a vytvorit tag v${version}? (A/n): `);
  if (!doGit || doGit.toLowerCase() === 'a' || doGit.toLowerCase() === 'y') {
    try {
      execSync('git add -A', { cwd: rootDir, stdio: 'inherit' });
      try {
        execSync(`git commit -m "chore: Release v${version}"`, { cwd: rootDir, stdio: 'inherit' });
      } catch {
        console.log('\x1b[33m(Soubory již byly commitnuty)\x1b[0m');
      }
      try {
        execSync(`git tag -a "v${version}" -m "Release v${version}"`, { cwd: rootDir, stdio: 'inherit' });
        console.log(`\x1b[32m✓ Git tag v${version} vytvořen.\x1b[0m`);
      } catch {
        console.log(`\x1b[33m(Tag v${version} již existuje lokálně)\x1b[0m`);
      }

      const doPush = await rl.question(`Chcete odeslat zmeny do vzdaleneho repozitare (git push origin main && git push origin v${version})? (A/n): `);
      if (!doPush || doPush.toLowerCase() === 'a' || doPush.toLowerCase() === 'y') {
        execSync('git push origin main', { cwd: rootDir, stdio: 'inherit' });
        try {
          execSync(`git push origin "v${version}"`, { cwd: rootDir, stdio: 'inherit' });
          console.log(`\x1b[32m✓ Zmeny a tag odeslany na GitHub.\x1b[0m`);
        } catch {
          console.log(`\x1b[33m(Tag v${version} je již na GitHubu)\x1b[0m`);
        }
      }
    } catch (err) {
      console.error(`\x1b[31mUpozorneni pri praci s Gitem:\x1b[0m`, err.message);
    }
  }

  // 7. GitHub CLI release
  let ghLoggedIn = false;
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    ghLoggedIn = true;
  } catch {}

  if (ghLoggedIn && releaseAssets.length > 0) {
    console.log('\n\x1b[36m=== Automatická publikace na GitHub Releases ===\x1b[0m');
    const doGh = await rl.question(`Chcete automaticky publikovat Release v${version} a nahrat balicky na GitHub? [A/n]: `);
    if (!doGh || doGh.toLowerCase() === 'a' || doGh.toLowerCase() === 'y') {
      try {
        console.log(`\x1b[33mZakládám / aktualizuji GitHub Release v${version}...\x1b[0m`);
        const primaryAsset = releaseAssets[0];

        // Extract notes from CHANGELOG.md for the current version
        let releaseNotesText = `Release v${version}`;
        const changelogMdPath = path.join(rootDir, 'CHANGELOG.md');
        if (fs.existsSync(changelogMdPath)) {
          const mdContent = fs.readFileSync(changelogMdPath, 'utf8');
          const versionHeaderRegex = new RegExp(`##\\s*\\[${version.replace(/\\./g, '\\.')}\\][^\n]*\n([\\s\\S]*?)(?=\n##\\s*\\[|$)`);
          const match = mdContent.match(versionHeaderRegex);
          if (match && match[1]?.trim()) {
            releaseNotesText = match[1].trim();
          }
        }

        const tempNotesPath = path.join(rootDir, 'temp-release-notes.txt');
        fs.writeFileSync(tempNotesPath, releaseNotesText, 'utf8');

        try {
          execSync(`gh release create "v${version}" "${primaryAsset.path}" --title "v${version}" --notes-file "${tempNotesPath}"`, {
            cwd: rootDir,
            stdio: 'inherit',
          });
        } catch {
          // Pokud release již existuje, aktualizovat poznámky
          try {
            execSync(`gh release edit "v${version}" --title "v${version}" --notes-file "${tempNotesPath}"`, {
              cwd: rootDir,
              stdio: 'inherit',
            });
          } catch {}
        } finally {
          try {
            fs.unlinkSync(tempNotesPath);
          } catch {}
        }

        for (const asset of releaseAssets) {
          console.log(`Nahrávám asset: ${asset.name}...`);
          execSync(`gh release upload "v${version}" "${asset.path}" --clobber`, {
            cwd: rootDir,
            stdio: 'inherit',
          });
        }
        console.log(`\x1b[32m✓ Všechny balíčky verze v${version} byly úspěšně nahrány na GitHub!\x1b[0m`);
      } catch (err) {
        console.error(`\x1b[31mChyba pri automatickem nahravani na GitHub: ${err.message}\x1b[0m`);
        console.log(`Rucni zaloha: https://github.com/2visionic/IADonkey/releases`);
      }
    }
  } else {
    console.log('\n\x1b[32m=== Dalsi kroky ===\x1b[0m');
    console.log(`1. Pro 100% automaticke nahrani se jednorazove prihlaste v terminalu: gh auth login`);
    console.log(`2. Nebo na webu GitHubu v sekci Releases vytvorte release pro tag 'v${version}'.`);
    console.log(`3. Pretahnete do nej vygenerovany soubor: ${builtExePath || builtExeName}`);
  }

  rl.close();
}

main().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});
