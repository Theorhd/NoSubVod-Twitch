const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting release build...\n');

// 1. Clean up
console.log('🧹 Cleaning up...');
if (fs.existsSync('release')) {
  fs.rmSync('release', { recursive: true, force: true });
}
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

// 2. Build the project
console.log('🔨 Building project...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}

// 3. Create release folder structure
console.log('\n📦 Creating release package...\n');
fs.mkdirSync('release', { recursive: true });
fs.mkdirSync('release/dist', { recursive: true });
fs.mkdirSync('release/assets', { recursive: true });
fs.mkdirSync('release/assets/icons', { recursive: true });
fs.mkdirSync('release/assets/badges', { recursive: true });

// 4. Copy necessary files
const filesToCopy = [
  // Manifest
  { from: 'manifest.json', to: 'release/manifest.json' },
  
  // Dist files (all compiled JS and HTML)
  { from: 'dist/background.js', to: 'release/dist/background.js' },
  { from: 'dist/inject-unified.js', to: 'release/dist/inject-unified.js' },
  { from: 'dist/page-script-entry.js', to: 'release/dist/page-script-entry.js' },
  { from: 'dist/patch_amazonworker.js', to: 'release/dist/patch_amazonworker.js' },
  { from: 'dist/popup.js', to: 'release/dist/popup.js' },
  { from: 'dist/popup.html', to: 'release/dist/popup.html' },
  { from: 'dist/settings.js', to: 'release/dist/settings.js' },
  { from: 'dist/settings.html', to: 'release/dist/settings.html' },
  { from: 'dist/download.js', to: 'release/dist/download.js' },
  { from: 'dist/download.html', to: 'release/dist/download.html' },
  { from: 'dist/offscreen.js', to: 'release/dist/offscreen.js' },
  { from: 'dist/offscreen.html', to: 'release/dist/offscreen.html' },
  
  // Assets
  { from: 'assets/icons/icon.png', to: 'release/assets/icons/icon.png' },
];

// Optional files (copy if they exist)
const optionalFiles = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
];

console.log('📋 Copying files:');
for (const file of filesToCopy) {
  try {
    if (!fs.existsSync(file.from)) {
      console.warn(`⚠️  Warning: ${file.from} not found, skipping...`);
      continue;
    }
    
    // Ensure directory exists
    const dir = path.dirname(file.to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.copyFileSync(file.from, file.to);
    console.log(`  ✅ ${file.from} → ${file.to}`);
  } catch (error) {
    console.error(`  ❌ Failed to copy ${file.from}:`, error.message);
  }
}

console.log('\n📄 Copying optional documentation files:');
for (const file of optionalFiles) {
  try {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, `release/${file}`);
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ⏭️  ${file} (not found, skipping)`);
    }
  } catch (error) {
    console.error(`  ❌ Failed to copy ${file}:`, error.message);
  }
}

// 5. Copy all icons from assets folder if they exist
console.log('\n🎨 Copying additional assets:');
const assetsDir = 'assets/icons';
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    const srcPath = path.join(assetsDir, file);
    const destPath = path.join('release/assets/icons', file);
    
    if (fs.statSync(srcPath).isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ✅ ${srcPath}`);
    }
  }
}

// Copy all badges from assets/badges folder
const badgesDir = 'assets/badges';
if (fs.existsSync(badgesDir)) {
  console.log('\n🏅 Copying badge assets:');
  const files = fs.readdirSync(badgesDir);
  for (const file of files) {
    const srcPath = path.join(badgesDir, file);
    const destPath = path.join('release/assets/badges', file);
    
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ✅ ${srcPath}`);
    }
  }
}

// 6. Get package info
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

// 7. Create ZIP archive (optional, requires archiver package or use system zip)
console.log('\n📦 Creating ZIP archive...');
try {
  const archiver = require('archiver');
  const output = fs.createWriteStream(`release/nosubvod-twitch-v${version}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  output.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`  ✅ Created nosubvod-twitch-v${version}.zip (${sizeInMB} MB)`);
    console.log('\n✨ Release build complete!\n');
    console.log(`📂 Release files are in: ${path.resolve('release')}`);
    console.log(`📦 ZIP package: release/nosubvod-twitch-v${version}.zip\n`);
  });
  
  archive.on('error', (err) => {
    throw err;
  });
  
  archive.pipe(output);
  
  // Add all files from release folder except the zip itself
  archive.directory('release/', false, (data) => {
    if (data.name.endsWith('.zip')) return false;
    return data;
  });
  
  archive.finalize();
  
} catch (error) {
  // If archiver is not installed, create a simple folder structure
  console.log('  ℹ️  Archiver not installed, skipping ZIP creation');
  console.log('  💡 Install with: npm install --save-dev archiver');
  console.log('\n✨ Release build complete!\n');
  console.log(`📂 Release files are in: ${path.resolve('release')}\n`);
}

// 8. Calculate total size
function getFolderSize(folderPath) {
  let totalSize = 0;
  
  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
    } else if (stats.isDirectory()) {
      const files = fs.readdirSync(itemPath);
      files.forEach(file => {
        calculateSize(path.join(itemPath, file));
      });
    }
  }
  
  calculateSize(folderPath);
  return totalSize;
}

const totalSize = getFolderSize('release');
const sizeInMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`📊 Total release size: ${sizeInMB} MB`);
