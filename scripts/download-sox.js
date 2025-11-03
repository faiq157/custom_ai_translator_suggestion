import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOX_VERSION = '14.4.2';
const SOX_URL = `https://sourceforge.net/projects/sox/files/sox/${SOX_VERSION}/sox-${SOX_VERSION}-win32.zip/download`;
const BINARIES_DIR = path.join(process.cwd(), 'binaries', 'sox');
const TEMP_ZIP = path.join(process.cwd(), 'temp_sox.zip');

console.log('📦 Downloading SoX for Windows...');
console.log(`Version: ${SOX_VERSION}`);
console.log(`Destination: ${BINARIES_DIR}`);

// Ensure binaries directory exists
if (!fs.existsSync(BINARIES_DIR)) {
  fs.mkdirSync(BINARIES_DIR, { recursive: true });
  console.log('✅ Created binaries directory');
}

// Check if SoX already exists
const soxExe = path.join(BINARIES_DIR, 'sox.exe');
if (fs.existsSync(soxExe)) {
  console.log('✅ SoX already exists!');
  console.log(`Location: ${soxExe}`);
  process.exit(0);
}

/**
 * Download file with redirect support
 */
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log('↪️  Following redirect...');
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(dest);
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r📥 Downloading: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)} MB)`);
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log('\n✅ Download complete!');
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    });

    request.on('error', reject);
  });
}

/**
 * Extract ZIP file
 */
async function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    console.log('📦 Extracting ZIP file...');
    
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: destDir }))
      .on('close', () => {
        console.log('✅ Extraction complete!');
        resolve();
      })
      .on('error', reject);
  });
}

/**
 * Copy SoX files to binaries directory
 */
function copySoxFiles(extractDir) {
  console.log('📋 Copying SoX files...');
  
  // Find the sox directory (usually sox-14.4.2)
  const soxDir = fs.readdirSync(extractDir)
    .find(name => name.startsWith('sox-'));
  
  if (!soxDir) {
    throw new Error('SoX directory not found in extracted files');
  }

  const sourcePath = path.join(extractDir, soxDir);
  
  // Files to copy
  const filesToCopy = [
    'sox.exe',
    'libgomp-1.dll',
    'libgcc_s_sjlj-1.dll',
    'libgcc_s_seh-1.dll',
    'libmad-0.dll',
    'libmp3lame-0.dll',
    'libpng16-16.dll',
    'libsox-3.dll',
    'libssp-0.dll',
    'libwavpack-1.dll',
    'libwinpthread-1.dll',
    'zlib1.dll'
  ];

  let copiedCount = 0;

  for (const file of filesToCopy) {
    const src = path.join(sourcePath, file);
    const dest = path.join(BINARIES_DIR, file);
    
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copiedCount++;
      console.log(`  ✓ ${file}`);
    } else {
      console.log(`  ⚠️  ${file} not found (may not be required)`);
    }
  }

  console.log(`✅ Copied ${copiedCount} files`);
}

/**
 * Cleanup temporary files
 */
function cleanup(tempDir) {
  console.log('🧹 Cleaning up...');
  
  if (fs.existsSync(TEMP_ZIP)) {
    fs.unlinkSync(TEMP_ZIP);
  }
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  
  console.log('✅ Cleanup complete!');
}

/**
 * Main download process
 */
async function main() {
  const tempExtractDir = path.join(process.cwd(), 'temp_sox_extract');

  try {
    // Download
    await downloadFile(SOX_URL, TEMP_ZIP);
    
    // Extract
    await extractZip(TEMP_ZIP, tempExtractDir);
    
    // Copy files
    copySoxFiles(tempExtractDir);
    
    // Cleanup
    cleanup(tempExtractDir);
    
    console.log('\n🎉 SoX installation complete!');
    console.log(`📍 Location: ${BINARIES_DIR}`);
    console.log('\n✅ Your application can now capture audio on Windows!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Manual installation:');
    console.error(`1. Download from: ${SOX_URL}`);
    console.error(`2. Extract and copy files to: ${BINARIES_DIR}`);
    console.error('3. See binaries/sox/README.md for details');
    
    cleanup(tempExtractDir);
    process.exit(1);
  }
}

main();
