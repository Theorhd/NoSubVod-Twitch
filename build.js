const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Clean dist folder
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}
fs.mkdirSync('dist', { recursive: true });

// Check if watch mode
const isWatch = process.argv.includes('--watch');

// Build configuration
const buildConfig = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
};

// Files to build
const files = [
  { in: 'src/page-script-entry.ts', out: 'dist/page-script-entry.js' },
  { in: 'src/inject-unified.ts', out: 'dist/inject-unified.js' },
  { in: 'src/services/patch_amazonworker.ts', out: 'dist/patch_amazonworker.js' },
  { in: 'src/services/worker-patch-bootstrap.ts', out: 'dist/worker-patch-bootstrap.js' },
  { in: 'src/utils/feature-test-helper.ts', out: 'dist/feature-test-helper.js' },
  { in: 'src/interfaces/popup.ts', out: 'dist/popup.js' },
  { in: 'src/interfaces/settings.ts', out: 'dist/settings.js' },
  { in: 'src/services/background.ts', out: 'dist/background.js' },
  { in: 'src/interfaces/download.ts', out: 'dist/download.js' },
  { in: 'src/services/offscreen.ts', out: 'dist/offscreen.js' },
];

// HTML files to copy
const htmlFiles = [
  { in: 'src/interfaces/popup.html', out: 'dist/popup.html' },
  { in: 'src/interfaces/settings.html', out: 'dist/settings.html' },
  { in: 'src/interfaces/download.html', out: 'dist/download.html' },
  { in: 'src/interfaces/offscreen.html', out: 'dist/offscreen.html' },
];

// CSS files to copy
const cssFiles = [
  { in: 'src/interfaces/styles/theme.css', out: 'dist/theme.css' },
  { in: 'src/interfaces/styles/popup.css', out: 'dist/popup.css' },
  { in: 'src/interfaces/styles/settings.css', out: 'dist/settings.css' },
];

function copyStaticFiles() {
  console.log('\n📄 Copying static files...\n');
  
  for (const file of [...htmlFiles, ...cssFiles]) {
    try {
      fs.copyFileSync(file.in, file.out);
      console.log(`✅ Copied: ${path.basename(file.out)}`);
    } catch (error) {
      console.error(`❌ Error copying ${file.in}:`, error);
      process.exit(1);
    }
  }
}

async function buildAll() {
  console.log('🔨 Building NoSubVod extension...\n');
  
  for (const file of files) {
    try {
      await esbuild.build({
        ...buildConfig,
        entryPoints: [file.in],
        outfile: file.out,
      });
      console.log(`✅ Built: ${path.basename(file.out)}`);
    } catch (error) {
      console.error(`❌ Error building ${file.in}:`, error);
      process.exit(1);
    }
  }
  
  copyStaticFiles();
  
  console.log('\n✨ Build complete!\n');
}

async function watchAll() {
  console.log('👀 Watching for changes...\n');
  
  const contexts = await Promise.all(
    files.map(async (file) => {
      const ctx = await esbuild.context({
        ...buildConfig,
        entryPoints: [file.in],
        outfile: file.out,
      });
      await ctx.watch();
      return ctx;
    })
  );
  
  // Initial copy of static files
  copyStaticFiles();
  
  // Watch HTML/CSS files for changes
  for (const file of [...htmlFiles, ...cssFiles]) {
    fs.watchFile(file.in, () => {
      console.log(`\n📄 ${path.basename(file.in)} changed, copying...`);
      fs.copyFileSync(file.in, file.out);
      console.log(`✅ Copied: ${path.basename(file.out)}\n`);
    });
  }
  
  console.log('\n✅ Watch mode enabled. Press Ctrl+C to stop.\n');
  
  // Keep the process running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping watch mode...');
    await Promise.all(contexts.map(ctx => ctx.dispose()));
    
    // Unwatch HTML/CSS files
    for (const file of [...htmlFiles, ...cssFiles]) {
      fs.unwatchFile(file.in);
    }
    
    process.exit(0);
  });
}

// Run build or watch
if (isWatch) {
  watchAll().catch((error) => {
    console.error('Watch error:', error);
    process.exit(1);
  });
} else {
  buildAll().catch((error) => {
    console.error('Build error:', error);
    process.exit(1);
  });
}
