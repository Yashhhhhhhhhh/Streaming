const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Locate cloudflared executable
function getCloudflaredPath() {
  const possiblePaths = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe')
  ];

  for (const p of possiblePaths) {
    try {
      execSync(`"${p}" --version`, { stdio: 'ignore' });
      return p;
    } catch (e) {
      // Continue search
    }
  }
  return null;
}

const cloudflaredBin = getCloudflaredPath();
if (!cloudflaredBin) {
  console.error('\n[!] Error: cloudflared is not installed or not in PATH.');
  console.error('Install via winget: winget install Cloudflare.cloudflared\n');
  process.exit(1);
}

console.log('\n============================================================');
console.log('[SyncWatch] Starting Watch Party Server & Remote Tunnel');
console.log('============================================================\n');

// 1. Start Node.js Server
console.log('[1/3] Launching local streaming server on port 3000...');
const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe']
});

serverProcess.stdout.on('data', (data) => {
  const str = data.toString();
  if (str.includes('Server active')) {
    console.log('   [+] Local server ready at http://localhost:3000');
  }
});

serverProcess.stderr.on('data', (data) => {
  console.error(`   [Server Err] ${data.toString()}`);
});

// Wait for local server to be responsive
function waitForLocalServer(callback) {
  const req = http.get('http://localhost:3000', (res) => {
    if (res.statusCode === 200) {
      callback();
    } else {
      setTimeout(() => waitForLocalServer(callback), 500);
    }
  });
  req.on('error', () => {
    setTimeout(() => waitForLocalServer(callback), 500);
  });
}

waitForLocalServer(() => {
  console.log('\n[2/3] Establishing secure Cloudflare Remote Tunnel...');
  console.log('   (Encrypted HTTPS edge connection for your partner)\n');

  const tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', 'http://localhost:3000'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let tunnelUrl = null;
  let urlExtracted = false;

  const handleTunnelOutput = (data) => {
    const output = data.toString();

    // Regex to capture the trycloudflare.com URL
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlExtracted) {
      urlExtracted = true;
      tunnelUrl = match[0];

      // Copy to clipboard on Windows
      try {
        execSync(`powershell -Command "Set-Clipboard -Value '${tunnelUrl}'"`);
      } catch (err) {
        // Ignore clipboard errors
      }

      console.log('============================================================');
      console.log('[READY] YOUR WATCH PARTY IS READY TO STREAM');
      console.log('============================================================');
      console.log(`\n[HOST] FOR YOU (This Laptop):`);
      console.log(`   -> http://localhost:3000`);
      console.log(`\n[GUEST] FOR YOUR PARTNER (Remote / Anywhere):`);
      console.log(`   -> ${tunnelUrl}`);
      console.log(`\n[CLIPBOARD] Remote link has been automatically copied!`);
      console.log('\n[OPTIMAL USAGE]');
      console.log('   * Upload movies directly on your laptop (0s local transfer, up to 10GB+)');
      console.log('   * Or use "Dual-Local File Sync" if both of you have the file for zero-bandwidth 4K');
      console.log('   * WebRTC voice chat works over HTTPS automatically');
      console.log('\nPress Ctrl+C at any time to stop the server and tunnel cleanly.\n');

      // Auto-open browser for the host
      try {
        const startCmd = process.platform === 'win32' ? 'start' : 'open';
        execSync(`${startCmd} http://localhost:3000`);
      } catch (err) {
        // Ignore auto-open error
      }
    }
  };

  tunnelProcess.stdout.on('data', handleTunnelOutput);
  tunnelProcess.stderr.on('data', handleTunnelOutput);

  tunnelProcess.on('close', (code) => {
    console.log(`\n[!] Tunnel closed (code ${code}).`);
    shutdown();
  });

  function shutdown() {
    console.log('\n[*] Shutting down server and tunnel cleanly...');
    try {
      if (process.platform === 'win32' && tunnelProcess.pid) {
        execSync(`taskkill /pid ${tunnelProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        tunnelProcess.kill('SIGKILL');
      }
    } catch (e) {}
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGKILL');
      }
    } catch (e) {}
    setTimeout(() => process.exit(0), 400);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);
});
