#!/usr/bin/env node

/**
 * Verification script to check if desktop app setup is complete
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('🔍 Verifying Desktop App Setup...\n');

let allGood = true;

// Check required files
const requiredFiles = [
  'electron/main.js',
  'electron/preload.js',
  'package.json',
  'src/server.js',
  'public/index.html'
];

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  const filePath = path.join(projectRoot, file);
  const exists = fs.existsSync(filePath);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allGood = false;
});

// Check package.json configuration
console.log('\n📦 Checking package.json:');
try {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  
  const checks = [
    { name: 'Main entry point', value: pkg.main === 'electron/main.js' },
    { name: 'Electron dependency', value: !!pkg.devDependencies?.electron },
    { name: 'Electron Builder', value: !!pkg.devDependencies?.['electron-builder'] },
    { name: 'electron script', value: !!pkg.scripts?.electron },
    { name: 'electron:dev script', value: !!pkg.scripts?.['electron:dev'] },
    { name: 'electron:build script', value: !!pkg.scripts?.['electron:build'] },
    { name: 'Build config', value: !!pkg.build }
  ];
  
  checks.forEach(check => {
    console.log(`  ${check.value ? '✅' : '❌'} ${check.name}`);
    if (!check.value) allGood = false;
  });
} catch (error) {
  console.log(`  ❌ Error reading package.json: ${error.message}`);
  allGood = false;
}

// Check node_modules
console.log('\n📚 Checking dependencies:');
const electronPath = path.join(projectRoot, 'node_modules', 'electron');
const builderPath = path.join(projectRoot, 'node_modules', 'electron-builder');
console.log(`  ${fs.existsSync(electronPath) ? '✅' : '❌'} Electron installed`);
console.log(`  ${fs.existsSync(builderPath) ? '✅' : '❌'} Electron Builder installed`);

if (!fs.existsSync(electronPath) || !fs.existsSync(builderPath)) {
  console.log('\n  💡 Run: npm install');
  allGood = false;
}

// Check documentation
console.log('\n📖 Checking documentation:');
const docs = [
  'README.md',
  'DESKTOP_README.md',
  'QUICK_START_DESKTOP.md',
  'DESKTOP_CONVERSION_SUMMARY.md'
];

docs.forEach(doc => {
  const exists = fs.existsSync(path.join(projectRoot, doc));
  console.log(`  ${exists ? '✅' : '⚠️'} ${doc}`);
});

// Check .env
console.log('\n🔐 Checking environment:');
const envExists = fs.existsSync(path.join(projectRoot, '.env'));
console.log(`  ${envExists ? '✅' : '⚠️'} .env file`);
if (!envExists) {
  console.log('  💡 Copy .env.example to .env and add your OpenAI API key');
}

// Final summary
console.log('\n' + '='.repeat(50));
if (allGood && envExists) {
  console.log('✅ All checks passed! Your desktop app is ready!');
  console.log('\n🚀 Next steps:');
  console.log('  1. Run: npm run electron:dev');
  console.log('  2. Test the desktop application');
  console.log('  3. Build installers: npm run electron:build');
} else if (allGood) {
  console.log('⚠️  Setup is mostly complete, but:');
  console.log('  - Create .env file with your OpenAI API key');
  console.log('\nThen run: npm run electron:dev');
} else {
  console.log('❌ Some issues found. Please fix them and try again.');
  console.log('\n💡 Common fixes:');
  console.log('  - Run: npm install');
  console.log('  - Check that all files were created correctly');
}
console.log('='.repeat(50) + '\n');

process.exit(allGood ? 0 : 1);
