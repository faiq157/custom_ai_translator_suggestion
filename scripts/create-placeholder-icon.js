/**
 * Creates a simple placeholder icon for the desktop app
 * This is a temporary solution until proper icons are designed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SVG icon template
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="512" height="512" rx="80" fill="#4F46E5"/>
  
  <!-- Microphone body -->
  <rect x="216" y="140" width="80" height="140" rx="40" fill="white"/>
  
  <!-- Microphone base -->
  <path d="M 256 280 Q 200 280 180 320 L 180 340 L 332 340 L 332 320 Q 312 280 256 280" fill="white"/>
  
  <!-- Microphone stand -->
  <rect x="246" y="340" width="20" height="60" fill="white"/>
  <rect x="206" y="390" width="100" height="20" rx="10" fill="white"/>
  
  <!-- AI sparkle -->
  <circle cx="360" cy="160" r="30" fill="#FCD34D"/>
  <path d="M 360 140 L 365 155 L 380 160 L 365 165 L 360 180 L 355 165 L 340 160 L 355 155 Z" fill="white"/>
  
  <!-- Sound waves -->
  <path d="M 140 200 Q 130 220 140 240" stroke="#FCD34D" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M 110 180 Q 95 220 110 260" stroke="#FCD34D" stroke-width="12" fill="none" stroke-linecap="round"/>
  
  <path d="M 372 200 Q 382 220 372 240" stroke="#FCD34D" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M 402 180 Q 417 220 402 260" stroke="#FCD34D" stroke-width="12" fill="none" stroke-linecap="round"/>
</svg>`;

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write SVG file
const svgPath = path.join(publicDir, 'icon.svg');
fs.writeFileSync(svgPath, svgIcon);

console.log('✅ Placeholder icon created at:', svgPath);
console.log('\n📝 Note: This is a temporary SVG icon.');
console.log('For production builds, you need to create:');
console.log('  - public/icon.png (512x512)');
console.log('  - public/icon.ico (256x256, Windows)');
console.log('  - public/icon.icns (macOS)');
console.log('\nSee scripts/generate-icons.md for instructions.');
