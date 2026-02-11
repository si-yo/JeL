/**
 * Lab - Electron Main Process
 * Editeur Jupyter Notebook standalone
 */
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');

let mainWindow = null;
let jupyterProcess = null;
let jupyterPort = 8888;
let jupyterToken = '';
let viteProcess = null;

// IPFS
let ipfsDaemonProcess = null;
// ═══ PUBSUB STATE ═══
const ipfsPubsubSubs = new Map();           // topic → { req, kill }
const pubsubRetryState = new Map();         // topic → { retryCount, timer }
const pubsubIntentionalUnsub = new Set();   // topics explicitly unsubscribed
let pubsubHealthInterval = null;
const IPFS_BIN = process.env.IPFS_BIN || 'ipfs';
let ipfsAvailable = null; // null = not checked, true/false after check

// Mobile bridge
let bridgeHttpServer = null;
let bridgeWss = null;
let bridgePin = null;
const bridgeClients = new Set();
const BRIDGE_PORT = 9100;

// Favorites file
const FAVORITES_FILE = () => path.join(app.getPath('userData'), 'lab-favorites.json');

const JUPYTER_BIN = process.env.JUPYTER_BIN || 'jupyter';
const isDev = process.env.NODE_ENV === 'development';

// ═══ VENV STATE ═══
let currentProjectPath = null;
let currentVenvPath = null;
let venvReady = false;

function getVenvBinDir() {
  if (!currentVenvPath) return null;
  return path.join(currentVenvPath, 'bin');
}

function getSpawnEnv() {
  const env = { ...process.env };
  const binDir = getVenvBinDir();
  if (binDir && currentVenvPath) {
    env.VIRTUAL_ENV = currentVenvPath;
    env.PATH = `${binDir}${path.delimiter}${env.PATH}`;
    delete env.PYTHONHOME;
    // Ensure Jupyter finds kernel specs installed in the venv
    const venvShareJupyter = path.join(currentVenvPath, 'share', 'jupyter');
    env.JUPYTER_PATH = env.JUPYTER_PATH
      ? `${venvShareJupyter}${path.delimiter}${env.JUPYTER_PATH}`
      : venvShareJupyter;
  }
  return env;
}

function getVenvPython() {
  const binDir = getVenvBinDir();
  return binDir ? path.join(binDir, 'python3') : 'python3';
}

function getVenvJupyter() {
  const binDir = getVenvBinDir();
  if (binDir) {
    const jp = path.join(binDir, 'jupyter');
    if (fsSync.existsSync(jp)) return jp;
  }
  return JUPYTER_BIN;
}

function spawnAsync(cmd, args, opts) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr, error: err.message }));
    proc.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function ensureKernelSpec(venvDir) {
  const pyBin = path.join(venvDir, 'bin', 'python3');
  const kernelDir = path.join(venvDir, 'share', 'jupyter', 'kernels', 'python3');

  if (fsSync.existsSync(kernelDir)) {
    console.log('[Venv] Kernel spec already exists');
    return true;
  }

  console.log('[Venv] Installing ipykernel + kernel spec...');
  if (mainWindow) mainWindow.webContents.send('venv:creating', { path: venvDir, step: 'ipykernel' });

  // Install ipykernel
  const installResult = await spawnAsync(pyBin, ['-m', 'pip', 'install', '-q', 'ipykernel'], {
    env: { ...process.env, VIRTUAL_ENV: venvDir, PATH: `${path.join(venvDir, 'bin')}${path.delimiter}${process.env.PATH}` },
  });
  if (installResult.code !== 0) {
    console.error('[Venv] ipykernel install failed:', installResult.stderr);
    return false;
  }

  // Register kernel spec inside venv (--sys-prefix)
  const specResult = await spawnAsync(pyBin, ['-m', 'ipykernel', 'install', '--sys-prefix', '--name', 'python3', '--display-name', 'Python 3 (venv)'], {
    env: { ...process.env, VIRTUAL_ENV: venvDir, PATH: `${path.join(venvDir, 'bin')}${path.delimiter}${process.env.PATH}` },
  });
  if (specResult.code !== 0) {
    console.error('[Venv] kernel spec install failed:', specResult.stderr);
    return false;
  }

  console.log('[Venv] Kernel spec installed');
  return true;
}

async function ensureVenv(projectDir) {
  const venvDir = path.join(projectDir, '.venv');
  currentVenvPath = venvDir;
  const pyBin = path.join(venvDir, 'bin', 'python3');

  if (fsSync.existsSync(pyBin)) {
    console.log('[Venv] Found existing:', venvDir);
    venvReady = true;
    // Ensure kernel spec is set up even for existing venvs
    await ensureKernelSpec(venvDir);
    return { success: true, created: false, path: venvDir };
  }

  console.log('[Venv] Creating:', venvDir);
  if (mainWindow) mainWindow.webContents.send('venv:creating', { path: venvDir });

  const result = await spawnAsync('python3', ['-m', 'venv', venvDir], { env: { ...process.env } });
  if (result.code !== 0) {
    console.error('[Venv] Creation failed:', result.stderr);
    currentVenvPath = null;
    venvReady = false;
    return { success: false, error: result.stderr || `Exit code ${result.code}` };
  }

  console.log('[Venv] Created successfully');
  venvReady = true;

  // Install ipykernel and register kernel spec
  await ensureKernelSpec(venvDir);

  return { success: true, created: true, path: venvDir };
}

function clearVenvState() {
  currentProjectPath = null;
  currentVenvPath = null;
  venvReady = false;
}

// ── Dev: auto-start Vite ──────────────────────────────
const VITE_PORT = 5173;

function startViteDev() {
  return new Promise((resolve, reject) => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    viteProcess = spawn(npx, ['vite', '--port', String(VITE_PORT)], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    viteProcess.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));

    // Wait for Vite's "ready" message on stdout
    let resolved = false;
    viteProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(`[vite] ${text}`);
      if (!resolved && text.includes('Local:')) {
        resolved = true;
        resolve();
      }
    });

    viteProcess.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });
    viteProcess.on('exit', (code) => {
      viteProcess = null;
      if (!resolved) { resolved = true; reject(new Error(`Vite exited with code ${code}`)); }
    });

    // Timeout safety
    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 15000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    backgroundColor: '#0f172a',
    title: 'Lab',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${VITE_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouveau notebook',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-notebook'),
        },
        {
          label: 'Ouvrir...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-notebook'),
        },
        { type: 'separator' },
        {
          label: 'Sauvegarder',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        {
          label: 'Sauvegarder sous...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-as'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Edition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Retablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout selectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer rechargement' },
        { role: 'toggleDevTools', label: 'Outils dev' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom par defaut' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arriere' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein ecran' },
      ],
    },
    {
      label: 'Projet',
      submenu: [
        {
          label: 'Nouveau projet...',
          click: () => mainWindow?.webContents.send('menu:new-project'),
        },
        {
          label: 'Ouvrir projet...',
          click: () => mainWindow?.webContents.send('menu:open-project'),
        },
        {
          label: 'Fermer projet',
          click: () => mainWindow?.webContents.send('menu:close-project'),
        },
      ],
    },
    {
      label: 'Kernel',
      submenu: [
        {
          label: 'Demarrer Jupyter',
          click: () => mainWindow?.webContents.send('menu:start-jupyter'),
        },
        {
          label: 'Arreter Jupyter',
          click: () => mainWindow?.webContents.send('menu:stop-jupyter'),
        },
        { type: 'separator' },
        {
          label: 'Redemarrer kernel',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.send('menu:restart-kernel'),
        },
        {
          label: 'Interrompre kernel',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow?.webContents.send('menu:interrupt-kernel'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.setName('Lab');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

app.whenReady().then(async () => {
  createMenu();

  if (isDev) {
    try {
      console.log('[dev] Starting Vite...');
      await startViteDev();
      console.log('[dev] Vite ready');
    } catch (err) {
      console.error('[dev] Failed to start Vite:', err.message);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (viteProcess) {
    viteProcess.kill();
    viteProcess = null;
  }
  if (jupyterProcess) {
    jupyterProcess.kill();
    jupyterProcess = null;
  }
  if (ipfsDaemonProcess) {
    ipfsDaemonProcess.kill();
    ipfsDaemonProcess = null;
  }
  clearAllPubsub();
  clearVenvState();
  // Close bridge
  if (bridgeWss) {
    for (const ws of bridgeClients) ws.close();
    bridgeClients.clear();
    bridgeWss.close();
    bridgeWss = null;
  }
  if (bridgeHttpServer) {
    bridgeHttpServer.close();
    bridgeHttpServer = null;
  }
});

// ===========================================
// Jupyter Server Management
// ===========================================

ipcMain.handle('jupyter:start', async (_event, options = {}) => {
  try {
    if (jupyterProcess) {
      return { success: true, port: jupyterPort, token: jupyterToken, message: 'already-running' };
    }

    jupyterPort = options.port || 8888;
    jupyterToken = options.token || '';

    const args = [
      'server',
      `--port=${jupyterPort}`,
      '--no-browser',
      `--ServerApp.token=${jupyterToken}`,
      '--ServerApp.disable_check_xsrf=True',
      '--ServerApp.allow_origin=*',
    ];

    if (options.notebookDir) {
      args.push(`--notebook-dir=${options.notebookDir}`);
    } else if (currentProjectPath) {
      args.push(`--notebook-dir=${currentProjectPath}`);
    }

    const jupyterBin = getVenvJupyter();
    console.log('[Jupyter] Using:', jupyterBin);

    return new Promise((resolve) => {
      jupyterProcess = spawn(jupyterBin, args, {
        env: getSpawnEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;

      const handleOutput = (data) => {
        const output = data.toString();
        console.log('[Jupyter]', output.trim());

        if (!resolved && (output.includes('http://') || output.includes('Jupyter Server'))) {
          resolved = true;
          // Give it a moment to fully start
          setTimeout(() => {
            resolve({ success: true, port: jupyterPort, token: jupyterToken });
          }, 1000);
        }
      };

      jupyterProcess.stdout.on('data', handleOutput);
      jupyterProcess.stderr.on('data', handleOutput);

      jupyterProcess.on('error', (error) => {
        console.error('[Jupyter] Error:', error);
        jupyterProcess = null;
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: error.message });
        }
      });

      jupyterProcess.on('exit', (code) => {
        console.log('[Jupyter] Exited with code:', code);
        jupyterProcess = null;
        if (mainWindow) {
          mainWindow.webContents.send('jupyter:stopped');
        }
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (jupyterProcess) {
            resolve({ success: true, port: jupyterPort, token: jupyterToken });
          } else {
            resolve({ success: false, error: 'Timeout starting Jupyter' });
          }
        }
      }, 15000);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('jupyter:stop', async () => {
  try {
    if (jupyterProcess) {
      jupyterProcess.kill();
      jupyterProcess = null;
      return { success: true };
    }
    return { success: true, message: 'not-running' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('jupyter:status', () => {
  return {
    running: !!jupyterProcess,
    port: jupyterPort,
    token: jupyterToken,
  };
});

// ===========================================
// Pip Package Manager
// ===========================================

ipcMain.handle('pip:install', async (_event, { packages }) => {
  const pkgList = Array.isArray(packages) ? packages : (packages || '').trim().split(/\s+/).filter(Boolean);
  if (pkgList.length === 0) return { success: false, error: 'No packages specified' };

  const pythonBin = getVenvPython();
  console.log(`[Pip] Installing: ${pkgList.join(', ')} (python: ${pythonBin})`);
  return new Promise((resolve) => {
    const proc = spawn(pythonBin, ['-m', 'pip', 'install', ...pkgList], {
      env: getSpawnEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (mainWindow) mainWindow.webContents.send('pip:output', { text, stream: 'stdout' });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (mainWindow) mainWindow.webContents.send('pip:output', { text, stream: 'stderr' });
    });

    proc.on('error', (error) => {
      console.error('[Pip] Error:', error.message);
      resolve({ success: false, error: error.message, output });
    });

    proc.on('exit', (code) => {
      console.log(`[Pip] Exit code: ${code}`);
      resolve({ success: code === 0, output, code });
    });
  });
});

ipcMain.handle('pip:list', async () => {
  const pythonBin = getVenvPython();
  return new Promise((resolve) => {
    const proc = spawn(pythonBin, ['-m', 'pip', 'list', '--format=json'], {
      env: getSpawnEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', (e) => resolve({ success: false, error: e.message }));
    proc.on('exit', (code) => {
      if (code === 0) {
        try {
          resolve({ success: true, packages: JSON.parse(out) });
        } catch {
          resolve({ success: false, error: 'Parse error' });
        }
      } else {
        resolve({ success: false, error: `Exit code ${code}` });
      }
    });
  });
});

// ===========================================
// Shell Execution (external scripts)
// ===========================================

const shellProcesses = new Map();

ipcMain.handle('shell:execute', async (_event, { command, code, cwd, execId }) => {
  const workDir = cwd || currentProjectPath || process.cwd();

  let cmd, args;
  let tempFile = null;

  if (code) {
    // Write code to temp file and execute with python
    tempFile = path.join(os.tmpdir(), `jel-script-${execId}.py`);
    await fs.writeFile(tempFile, code, 'utf8');
    cmd = getVenvPython();
    args = [tempFile];
  } else if (command) {
    const parts = command.split(/\s+/);
    cmd = parts[0];
    args = parts.slice(1);
  } else {
    return { success: false, execId, error: 'No command or code provided' };
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: getSpawnEnv(),
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    shellProcesses.set(execId, proc);

    proc.stdout.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send('shell:output', {
        execId, text: data.toString(), stream: 'stdout',
      });
    });

    proc.stderr.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send('shell:output', {
        execId, text: data.toString(), stream: 'stderr',
      });
    });

    proc.on('error', (error) => {
      shellProcesses.delete(execId);
      if (tempFile) fs.unlink(tempFile).catch(() => {});
      resolve({ success: false, execId, error: error.message });
    });

    proc.on('exit', (exitCode) => {
      shellProcesses.delete(execId);
      if (tempFile) fs.unlink(tempFile).catch(() => {});
      resolve({ success: exitCode === 0, execId, code: exitCode });
    });
  });
});

ipcMain.handle('shell:kill', async (_event, { execId }) => {
  const proc = shellProcesses.get(execId);
  if (proc) {
    proc.kill();
    shellProcesses.delete(execId);
    return { success: true };
  }
  return { success: false, error: 'process-not-found' };
});

// ===========================================
// File System
// ===========================================

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (_event, filePath, data) => {
  try {
    await fs.writeFile(filePath, data, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:exists', async (_event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

// ===========================================
// Dialogs
// ===========================================

ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [
      { name: 'Jupyter Notebooks', extensions: ['ipynb'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    ...options,
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: options.filters || [
      { name: 'Jupyter Notebook', extensions: ['ipynb'] },
    ],
    ...options,
  });
  return result;
});

// ===========================================
// PDF Export
// ===========================================

ipcMain.handle('notebook:exportPDF', async (_event, { html, title }) => {
  try {
    const printWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { offscreen: true },
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for images/content to load
    await printWin.webContents.executeJavaScript(
      'new Promise(r => { if (document.readyState === "complete") r(); else window.addEventListener("load", r); })'
    );
    // Extra delay for image rendering
    await new Promise((r) => setTimeout(r, 500));

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 1, bottom: 1, left: 1, right: 1 },
    });

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${title || 'export'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, pdfBuffer);
      printWin.destroy();
      return { success: true, path: result.filePath };
    }

    printWin.destroy();
    return { success: false };
  } catch (err) {
    console.error('[PDF Export] Error:', err);
    return { success: false, error: err.message };
  }
});

// ===========================================
// Directory operations
// ===========================================

ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      success: true,
      entries: entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return result;
});

// ===========================================
// Project Handlers
// ===========================================

const runIpfs = (args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(IPFS_BIN, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }
  });

ipcMain.handle('project:create', async (_event, { name, dirPath }) => {
  try {
    const labDir = path.join(dirPath, '.lab');
    await fs.mkdir(labDir, { recursive: true });

    const project = {
      id: crypto.randomUUID(),
      name,
      path: dirPath,
      swarmKey: null,
      notebooks: [],
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(path.join(labDir, 'project.json'), JSON.stringify(project, null, 2), 'utf8');

    // Setup venv for new project
    currentProjectPath = dirPath;
    const venvResult = await ensureVenv(dirPath);
    project.venvPath = currentVenvPath;
    project.venvReady = venvResult.success;

    return { success: true, project, venv: venvResult };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:open', async (_event, dirPath) => {
  try {
    const projectFile = path.join(dirPath, '.lab', 'project.json');
    const data = await fs.readFile(projectFile, 'utf8');
    const project = JSON.parse(data);
    project.path = dirPath;

    // Scan for notebooks
    const notebooks = [];
    async function scanDir(dir, rel) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          await scanDir(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
        } else if (entry.name.endsWith('.ipynb')) {
          notebooks.push(rel ? `${rel}/${entry.name}` : entry.name);
        }
      }
    }
    await scanDir(dirPath, '');
    project.notebooks = notebooks;

    // Stop existing Jupyter if switching projects
    if (jupyterProcess) {
      jupyterProcess.kill();
      jupyterProcess = null;
      if (mainWindow) mainWindow.webContents.send('jupyter:stopped');
    }

    // Setup venv for this project
    currentProjectPath = dirPath;
    const venvResult = await ensureVenv(dirPath);
    project.venvPath = currentVenvPath;
    project.venvReady = venvResult.success;

    return { success: true, project, venv: venvResult };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:save', async (_event, dirPath, data) => {
  try {
    const labDir = path.join(dirPath, '.lab');
    await fs.mkdir(labDir, { recursive: true });
    await fs.writeFile(path.join(labDir, 'project.json'), JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:close', async () => {
  if (jupyterProcess) {
    jupyterProcess.kill();
    jupyterProcess = null;
    if (mainWindow) mainWindow.webContents.send('jupyter:stopped');
  }
  clearVenvState();
  console.log('[Venv] Project closed, venv state cleared');
  return { success: true };
});

ipcMain.handle('venv:status', () => ({
  active: !!currentVenvPath,
  path: currentVenvPath,
  ready: venvReady,
  projectPath: currentProjectPath,
}));

ipcMain.handle('project:listNotebooks', async (_event, dirPath) => {
  try {
    const notebooks = [];
    async function scanDir(dir, rel) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          await scanDir(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
        } else if (entry.name.endsWith('.ipynb')) {
          notebooks.push(rel ? `${rel}/${entry.name}` : entry.name);
        }
      }
    }
    await scanDir(dirPath, '');
    return { success: true, notebooks };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:getFavorites', async () => {
  try {
    const data = await fs.readFile(FAVORITES_FILE(), 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

ipcMain.handle('project:saveFavorites', async (_event, favorites) => {
  try {
    await fs.writeFile(FAVORITES_FILE(), JSON.stringify(favorites, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===========================================
// IPFS Handlers
// ===========================================

// Check if IPFS binary is available on this machine
async function checkIpfsAvailable() {
  if (ipfsAvailable !== null) return ipfsAvailable;
  return new Promise((resolve) => {
    execFile(IPFS_BIN, ['version'], { timeout: 5000 }, (error) => {
      ipfsAvailable = !error;
      if (!ipfsAvailable) console.log('[IPFS] Binary not found — IPFS features disabled');
      resolve(ipfsAvailable);
    });
  });
}

// Configure IPFS for cross-network (relay, hole punching, WS listener)
async function configureIpfsForNetwork() {
  try {
    const swarmKeyPath = path.join(IPFS_REPO(), 'swarm.key');
    const hasSwarmKey = fsSync.existsSync(swarmKeyPath);

    // Common config
    await runIpfs(['config', '--json', 'Swarm.RelayClient.Enabled', 'true']);
    await runIpfs(['config', '--json', 'Swarm.RelayService.Enabled', 'true']);
    await runIpfs(['config', '--json', 'Swarm.EnableHolePunching', 'true']);
    // Enable PubSub via config (required for Kubo 0.29+ where --enable-pubsub-experiment is deprecated)
    await runIpfs(['config', '--json', 'Pubsub.Enabled', 'true']);
    // Ensure mDNS is enabled (critical for LAN peer discovery, especially private networks)
    await runIpfs(['config', '--json', 'Discovery.MDNS.Enabled', 'true']);

    if (hasSwarmKey) {
      // Private network: disable features incompatible with swarm.key
      await runIpfs(['config', '--json', 'AutoConf.Enabled', 'false']);
      await runIpfs(['config', '--json', 'AutoTLS.Enabled', 'false']);
      // Routing.Type=auto uses public HTTP IPNIs — switch to pure DHT for private networks
      await runIpfs(['config', '--json', 'Routing.Type', '"dht"']);
      // Clear all 'auto' placeholders that require AutoConf (Kubo 0.39+ refuses to start otherwise)
      try { await runIpfs(['bootstrap', 'rm', '--all']); } catch {}
      await runIpfs(['config', '--json', 'DNS.Resolvers', '{}']);
      await runIpfs(['config', '--json', 'Routing.DelegatedRouters', '{}']);
      await runIpfs(['config', '--json', 'Ipns.DelegatedPublishers', '{}']);
      // WebSocket with shared TCP listener is not supported in private networks
      // Must both remove /ws listen addresses AND explicitly disable the WS transport
      await runIpfs(['config', '--json', 'Swarm.Transports.Network.Websocket', 'false']);
      await runIpfs(['config', '--json', 'Addresses.Swarm',
        '["/ip4/0.0.0.0/tcp/4001","/ip6/::/tcp/4001","/ip4/0.0.0.0/udp/4001/quic-v1","/ip6/::/udp/4001/quic-v1","/ip4/0.0.0.0/udp/4001/quic-v1/webtransport"]'
      ]);
      console.log(`[IPFS] Private network config applied (dht routing, no AutoConf/AutoTLS/WS transport disabled, cleared auto placeholders)`);
    } else {
      // Public network: enable full features
      await runIpfs(['config', '--json', 'AutoConf.Enabled', 'true']);
      await runIpfs(['config', '--json', 'Routing.Type', '"auto"']);
      await runIpfs(['config', '--json', 'Swarm.Transports.Network.Websocket', 'true']);
      await runIpfs(['config', '--json', 'Addresses.Swarm',
        '["/ip4/0.0.0.0/tcp/4001","/ip6/::/tcp/4001","/ip4/0.0.0.0/udp/4001/quic-v1","/ip6/::/udp/4001/quic-v1","/ip4/0.0.0.0/udp/4001/quic-v1/webtransport","/ip4/0.0.0.0/tcp/4002/ws"]'
      ]);
      console.log(`[IPFS] Public network config applied (auto routing, AutoConf, WS)`);
    }
  } catch (err) {
    console.warn('[IPFS] Could not apply network config:', err.message);
  }
}

/**
 * Multibase base64url encode a topic string.
 * Required for Kubo 0.39+ HTTP API which expects multibase-encoded topic arguments.
 * Format: 'u' prefix + base64url(topic_bytes) — no padding.
 */
function multibaseEncodeTopic(topic) {
  return 'u' + Buffer.from(topic, 'utf-8').toString('base64url');
}

/**
 * Decode a multibase-encoded topic string back to plain text.
 */
function multibaseDecodeTopic(encoded) {
  if (typeof encoded === 'string' && encoded.startsWith('u')) {
    try { return Buffer.from(encoded.slice(1), 'base64url').toString('utf-8'); } catch { /* fall through */ }
  }
  return encoded;
}

/**
 * Read the IPFS API port from config (default 5001).
 * Parses Addresses.API multiaddr like /ip4/127.0.0.1/tcp/5001
 */
function getIpfsApiPort() {
  try {
    const configPath = path.join(IPFS_REPO(), 'config');
    const config = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
    const apiAddr = config?.Addresses?.API || '';
    const match = apiAddr.match(/\/tcp\/(\d+)/);
    return match ? parseInt(match[1], 10) : 5001;
  } catch {
    return 5001;
  }
}

/**
 * Check if an IPFS daemon is running by calling POST /api/v0/id on the HTTP API.
 * Returns { running, peerId } — unlike `ipfs id` CLI which works without a daemon.
 */
function checkDaemonViaApi() {
  const port = getIpfsApiPort();
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/v0/id',
      method: 'POST',
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ running: true, peerId: parsed.ID || null });
        } catch {
          resolve({ running: true, peerId: null });
        }
      });
    });
    req.on('error', () => resolve({ running: false, peerId: null }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false, peerId: null }); });
    req.end();
  });
}

/**
 * Check if pubsub is enabled on the running daemon via POST /api/v0/pubsub/ls.
 */
function checkPubsubViaApi() {
  const port = getIpfsApiPort();
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/v0/pubsub/ls',
      method: 'POST',
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        // If status 200 → pubsub is enabled
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Shutdown the IPFS daemon via POST /api/v0/shutdown.
 * This is more reliable than `ipfs shutdown` CLI.
 */
function shutdownDaemonViaApi() {
  const port = getIpfsApiPort();
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/v0/shutdown',
      method: 'POST',
      timeout: 5000,
    }, (res) => {
      res.resume(); // drain response
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Get local network IP for bridge URL
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

ipcMain.handle('ipfs:available', async () => {
  const available = await checkIpfsAvailable();
  return { available };
});

ipcMain.handle('ipfs:repoExists', async () => {
  try {
    const configPath = path.join(IPFS_REPO(), 'config');
    return { exists: fsSync.existsSync(configPath) };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('ipfs:init', async () => {
  try {
    const configPath = path.join(IPFS_REPO(), 'config');
    if (fsSync.existsSync(configPath)) {
      return { success: true, message: 'already-initialized' };
    }
    await runIpfs(['init']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:daemonStart', async () => {
  try {
    if (ipfsDaemonProcess) return { success: true, message: 'already-running' };

    const available = await checkIpfsAvailable();
    if (!available) return { success: false, error: 'IPFS (Kubo) non installe. Installez-le depuis https://docs.ipfs.tech/install/' };

    // Check if an external daemon is already running (via HTTP API — not CLI which works offline)
    const daemonStatus = await checkDaemonViaApi();
    if (daemonStatus.running) {
      console.log(`[IPFS] External daemon detected via API (peerId=${(daemonStatus.peerId || '?').slice(0, 16)}...)`);

      // Check if pubsub works on this external daemon
      const pubsubWorks = await checkPubsubViaApi();
      if (pubsubWorks) {
        console.log(`[IPFS] External daemon has pubsub enabled — using it`);
        return { success: true, message: 'external-daemon' };
      }

      // Pubsub not enabled — shutdown external daemon via API and start our own
      console.log(`[IPFS] External daemon does NOT have pubsub — shutting down to restart with pubsub...`);
      const shutdownOk = await shutdownDaemonViaApi();
      console.log(`[IPFS] Shutdown API call result: ${shutdownOk}`);

      // Wait for daemon to actually stop (check via API)
      let stopped = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const check = await checkDaemonViaApi();
        if (!check.running) {
          stopped = true;
          console.log(`[IPFS] External daemon stopped (after ${i + 1}s)`);
          break;
        }
        console.log(`[IPFS] Daemon still running, waiting... (${i + 1}/10)`);
      }

      if (!stopped) {
        console.error(`[IPFS] External daemon did not stop after 10s — cannot configure pubsub`);
        return { success: false, error: 'Un daemon IPFS externe tourne sans pubsub et refuse de s\'arreter. Arretez-le manuellement: ipfs shutdown' };
      }
    }

    // Apply config BEFORE starting daemon (repo is unlocked at this point)
    await configureIpfsForNetwork();

    ipfsDaemonProcess = spawn(IPFS_BIN, ['daemon', '--enable-pubsub-experiment'], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise((resolve) => {
      let resolved = false;

      const handleOutput = (data) => {
        const output = data.toString();
        console.log('[IPFS]', output.trim());
        if (!resolved && output.includes('Daemon is ready')) {
          resolved = true;
          resolve({ success: true });
        }
      };

      ipfsDaemonProcess.stdout.on('data', handleOutput);
      ipfsDaemonProcess.stderr.on('data', handleOutput);

      ipfsDaemonProcess.on('error', (error) => {
        ipfsDaemonProcess = null;
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: error.message });
        }
      });

      ipfsDaemonProcess.on('exit', () => {
        ipfsDaemonProcess = null;
        clearAllPubsub();
        if (mainWindow) mainWindow.webContents.send('ipfs:stopped');
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(ipfsDaemonProcess ? { success: true } : { success: false, error: 'Timeout' });
        }
      }, 15000);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:daemonStop', async () => {
  try {
    clearAllPubsub();
    if (ipfsDaemonProcess) {
      ipfsDaemonProcess.kill();
      ipfsDaemonProcess = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:status', () => ({
  running: !!ipfsDaemonProcess,
}));

ipcMain.handle('ipfs:addData', async (_event, { data, name }) => {
  try {
    const args = ['add', '--quieter', '-'];
    if (name) args.splice(2, 0, '--stdin-name', name);
    const cid = await runIpfs(args, { input: data });
    return { success: true, cid };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:cat', async (_event, { cid }) => {
  try {
    const data = await runIpfs(['cat', cid]);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Split a string that may contain multiple concatenated JSON objects.
 * e.g. '{"a":1}{"b":2}' → ['{"a":1}', '{"b":2}']
 */
function splitConcatenatedJson(str) {
  str = str.trim();
  if (!str) return [];
  // Fast path: single JSON object
  try {
    JSON.parse(str);
    return [str];
  } catch {
    // Likely concatenated — split on }{ boundary
  }
  const results = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') {
      // Skip string contents
      i++;
      while (i < str.length && str[i] !== '"') {
        if (str[i] === '\\') i++; // skip escaped char
        i++;
      }
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        results.push(str.slice(start, i + 1));
      }
    }
  }
  return results.length > 0 ? results : [str];
}

// ═══════════════════════════════════════════════════════════════════════
// PUBSUB LAYER (robust: auto-reconnect, retry, health check)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decode pubsub message payload (multibase base64url or plain base64).
 */
function decodePubsubPayload(rawData) {
  if (typeof rawData !== 'string') return null;
  if (rawData.startsWith('u')) {
    return Buffer.from(rawData.slice(1), 'base64url').toString('utf-8');
  }
  return Buffer.from(rawData, 'base64').toString('utf-8');
}

/**
 * Query daemon for active pubsub subscriptions via HTTP API.
 * Returns decoded topic names.
 */
function getPubsubTopicsViaApi() {
  const port = getIpfsApiPort();
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: '/api/v0/pubsub/ls', method: 'POST', timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const raw = parsed.Strings || parsed.Topics || [];
          resolve(raw.map((t) => multibaseDecodeTopic(t)));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * Subscribe to a topic with auto-reconnect on stream drop.
 * Does NOT reconnect if unsubscribed intentionally via unsubscribeTopic().
 */
function subscribeTopic(topic) {
  if (ipfsPubsubSubs.has(topic)) return;
  if (pubsubIntentionalUnsub.has(topic)) return;

  const port = getIpfsApiPort();
  const state = pubsubRetryState.get(topic) || { retryCount: 0, timer: null };
  pubsubRetryState.set(topic, state);

  console.log(`[IPFS pubsub] Subscribing to "${topic}" (port ${port})`);

  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: `/api/v0/pubsub/sub?arg=${encodeURIComponent(multibaseEncodeTopic(topic))}`,
    method: 'POST',
  });

  let lineBuffer = '';
  let connected = false;

  req.on('response', (res) => {
    connected = true;

    if (res.statusCode !== 200) {
      console.warn(`[IPFS pubsub] Subscribe "${topic}" got status ${res.statusCode} — will retry`);
      ipfsPubsubSubs.delete(topic);
      scheduleResubscribe(topic);
      return;
    }

    // Stream opened successfully — reset retry count
    state.retryCount = 0;
    console.log(`[IPFS pubsub] Subscribed to "${topic}"`);

    res.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const parts = lineBuffer.split('\n');
      lineBuffer = parts.pop() || '';

      for (const line of parts) {
        if (!line.trim()) continue;
        try {
          const wrapper = JSON.parse(line);
          if (wrapper.data && typeof wrapper.data === 'string') {
            const payload = decodePubsubPayload(wrapper.data);
            if (payload && mainWindow && !mainWindow.isDestroyed()) {
              const messages = splitConcatenatedJson(payload);
              for (const m of messages) {
                mainWindow.webContents.send('ipfs:pubsub-message', { topic, data: m });
              }
            }
          }
        } catch {
          // Not ndJSON — forward as raw
          if (mainWindow && !mainWindow.isDestroyed()) {
            const messages = splitConcatenatedJson(line);
            for (const m of messages) {
              mainWindow.webContents.send('ipfs:pubsub-message', { topic, data: m });
            }
          }
        }
      }
    });

    res.on('end', () => {
      console.log(`[IPFS pubsub] Stream ended for "${topic}" — reconnecting`);
      ipfsPubsubSubs.delete(topic);
      scheduleResubscribe(topic);
    });

    res.on('error', (err) => {
      console.warn(`[IPFS pubsub] Stream error for "${topic}": ${err.message} — reconnecting`);
      ipfsPubsubSubs.delete(topic);
      scheduleResubscribe(topic);
    });
  });

  req.on('error', (err) => {
    if (!connected) {
      console.warn(`[IPFS pubsub] Connection failed for "${topic}": ${err.message} — will retry`);
    }
    ipfsPubsubSubs.delete(topic);
    scheduleResubscribe(topic);
  });

  req.setTimeout(0);
  req.end();

  ipfsPubsubSubs.set(topic, { kill: () => req.destroy() });
}

/**
 * Unsubscribe from a topic (intentional — will NOT auto-reconnect).
 */
function unsubscribeTopic(topic) {
  pubsubIntentionalUnsub.add(topic);
  const retryState = pubsubRetryState.get(topic);
  if (retryState?.timer) clearTimeout(retryState.timer);
  pubsubRetryState.delete(topic);
  const sub = ipfsPubsubSubs.get(topic);
  if (sub) {
    sub.kill();
    ipfsPubsubSubs.delete(topic);
    console.log(`[IPFS pubsub] Unsubscribed from "${topic}"`);
  }
}

/**
 * Schedule a resubscribe with exponential backoff (1s, 2s, 4s, 8s, max 15s).
 */
function scheduleResubscribe(topic) {
  if (pubsubIntentionalUnsub.has(topic)) return;
  const state = pubsubRetryState.get(topic) || { retryCount: 0, timer: null };
  if (state.timer) clearTimeout(state.timer);
  const delay = Math.min(1000 * Math.pow(2, state.retryCount), 15000);
  state.retryCount++;
  state.timer = setTimeout(() => {
    state.timer = null;
    subscribeTopic(topic);
  }, delay);
  pubsubRetryState.set(topic, state);
  if (state.retryCount > 1) {
    console.log(`[IPFS pubsub] Retry #${state.retryCount} for "${topic}" in ${delay}ms`);
  }
}

/**
 * Health check: verify active subscriptions match expected topics.
 * Resubscribes any topics that dropped silently.
 */
function startPubsubHealthCheck() {
  stopPubsubHealthCheck();
  pubsubHealthInterval = setInterval(async () => {
    if (ipfsPubsubSubs.size === 0) return;
    try {
      const activeTopics = await getPubsubTopicsViaApi();
      for (const [topic] of ipfsPubsubSubs) {
        if (!activeTopics.includes(topic)) {
          console.warn(`[IPFS pubsub] Health: "${topic}" missing from daemon — resubscribing`);
          const sub = ipfsPubsubSubs.get(topic);
          if (sub) sub.kill();
          ipfsPubsubSubs.delete(topic);
          subscribeTopic(topic);
        }
      }
    } catch { /* daemon may be down — retry timers will handle it */ }
  }, 30000);
}

function stopPubsubHealthCheck() {
  if (pubsubHealthInterval) {
    clearInterval(pubsubHealthInterval);
    pubsubHealthInterval = null;
  }
}

/**
 * Clear all pubsub state (subscriptions, timers, health check).
 * Used by daemon stop, app quit, swarm key changes.
 */
function clearAllPubsub() {
  stopPubsubHealthCheck();
  for (const [, state] of pubsubRetryState) {
    if (state.timer) clearTimeout(state.timer);
  }
  pubsubRetryState.clear();
  pubsubIntentionalUnsub.clear();
  for (const [, sub] of ipfsPubsubSubs) sub.kill();
  ipfsPubsubSubs.clear();
}

// ═══ PUBSUB IPC HANDLERS ═══

ipcMain.handle('ipfs:pubsubSubscribe', async (_event, { topic }) => {
  try {
    pubsubIntentionalUnsub.delete(topic); // allow (re)subscribe
    subscribeTopic(topic);
    startPubsubHealthCheck();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:pubsubPublish', async (_event, { topic, data }) => {
  // Publish with 1 retry (500ms delay)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await runIpfs(['pubsub', 'pub', topic], { input: data });
      return { success: true };
    } catch (error) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        console.warn(`[IPFS pubsub] Publish failed on "${topic}": ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  }
});

ipcMain.handle('ipfs:pubsubUnsubscribe', async (_event, { topic }) => {
  try {
    unsubscribeTopic(topic);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:pubsubPeers', async (_event, { topic }) => {
  try {
    const port = getIpfsApiPort();
    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: `/api/v0/pubsub/peers?arg=${encodeURIComponent(multibaseEncodeTopic(topic))}`,
        method: 'POST',
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const peers = parsed.Strings || parsed.Peers || [];
            resolve(Array.isArray(peers) ? peers : []);
          } catch {
            resolve([]);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    return { success: true, peers: result };
  } catch (error) {
    return { success: false, peers: [], error: error.message };
  }
});

ipcMain.handle('ipfs:swarmPeers', async () => {
  try {
    const output = await runIpfs(['swarm', 'peers']);
    const peers = output.split('\n').filter(Boolean);
    return { success: true, peers };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:getNodeInfo', async () => {
  try {
    const peerId = await runIpfs(['config', 'Identity.PeerID']);
    const addrsRaw = await runIpfs(['id', '--format', '<addrs>']);
    const addrs = addrsRaw.split('\n').filter(Boolean);
    return { success: true, peerId: peerId.trim(), addrs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:swarmConnect', async (_event, { multiaddr }) => {
  try {
    await runIpfs(['swarm', 'connect', multiaddr]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===========================================
// Swarm Key Management (Private IPFS Networks)
// ===========================================

const SWARM_KEYS_FILE = () => path.join(app.getPath('userData'), 'swarm-keys.json');
const IPFS_REPO = () => process.env.IPFS_PATH || path.join(os.homedir(), '.ipfs');

async function loadSwarmKeys() {
  try {
    const data = await fs.readFile(SWARM_KEYS_FILE(), 'utf8');
    return JSON.parse(data);
  } catch { return []; }
}

async function saveSwarmKeysRegistry(keys) {
  await fs.writeFile(SWARM_KEYS_FILE(), JSON.stringify(keys, null, 2), 'utf8');
}

function generateSwarmKey() {
  const secret = crypto.randomBytes(32).toString('hex');
  return `/key/swarm/psk/1.0.0/\n/base16/\n${secret}`;
}

ipcMain.handle('ipfs:swarmKeyGenerate', () => {
  return { key: generateSwarmKey() };
});

ipcMain.handle('ipfs:swarmKeyList', async () => {
  return await loadSwarmKeys();
});

ipcMain.handle('ipfs:swarmKeySave', async (_event, { name, key }) => {
  try {
    const keys = await loadSwarmKeys();
    const existing = keys.findIndex((k) => k.name === name);
    if (existing >= 0) {
      keys[existing].key = key;
    } else {
      keys.push({ name, key });
    }
    await saveSwarmKeysRegistry(keys);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:swarmKeyDelete', async (_event, name) => {
  try {
    const keys = await loadSwarmKeys();
    const filtered = keys.filter((k) => k.name !== name);
    await saveSwarmKeysRegistry(filtered);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:swarmKeyApply', async (_event, name) => {
  try {
    const keys = await loadSwarmKeys();
    const entry = keys.find((k) => k.name === name);
    if (!entry) return { success: false, error: 'Cle introuvable' };

    // Stop daemon if running
    if (ipfsDaemonProcess) {
      clearAllPubsub();
      ipfsDaemonProcess.kill();
      ipfsDaemonProcess = null;
      if (mainWindow) mainWindow.webContents.send('ipfs:stopped');
    }

    // Write swarm key to IPFS repo
    const swarmKeyPath = path.join(IPFS_REPO(), 'swarm.key');
    await fs.writeFile(swarmKeyPath, entry.key, 'utf8');

    // Remove public bootstrap and clear 'auto' placeholders incompatible with private networks
    try { await runIpfs(['bootstrap', 'rm', '--all']); } catch {}
    try { await runIpfs(['config', '--json', 'AutoConf.Enabled', 'false']); } catch {}
    try { await runIpfs(['config', '--json', 'AutoTLS.Enabled', 'false']); } catch {}
    try { await runIpfs(['config', '--json', 'Routing.Type', '"dht"']); } catch {}
    try { await runIpfs(['config', '--json', 'DNS.Resolvers', '{}']); } catch {}
    try { await runIpfs(['config', '--json', 'Routing.DelegatedRouters', '{}']); } catch {}
    try { await runIpfs(['config', '--json', 'Ipns.DelegatedPublishers', '{}']); } catch {}

    console.log(`[IPFS] Swarm key "${name}" applied — private network mode`);
    if (mainWindow) mainWindow.webContents.send('ipfs:swarm-changed', { active: true, name });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:swarmKeyClear', async () => {
  try {
    // Stop daemon if running
    if (ipfsDaemonProcess) {
      clearAllPubsub();
      ipfsDaemonProcess.kill();
      ipfsDaemonProcess = null;
      if (mainWindow) mainWindow.webContents.send('ipfs:stopped');
    }

    // Remove swarm key
    const swarmKeyPath = path.join(IPFS_REPO(), 'swarm.key');
    try { await fs.unlink(swarmKeyPath); } catch {}

    // Restore default bootstrap, AutoConf, and 'auto' placeholders for public network
    try { await runIpfs(['bootstrap', 'add', '--default']); } catch {}
    try { await runIpfs(['config', '--json', 'AutoConf.Enabled', 'true']); } catch {}
    try { await runIpfs(['config', '--json', 'Routing.Type', '"auto"']); } catch {}
    try { await runIpfs(['config', '--json', 'DNS.Resolvers', '{"auto": ""}']); } catch {}
    try { await runIpfs(['config', '--json', 'Routing.DelegatedRouters', '{"auto": {}}']); } catch {}
    try { await runIpfs(['config', '--json', 'Ipns.DelegatedPublishers', '{"auto": {}}']); } catch {}

    console.log('[IPFS] Swarm key cleared — public network mode');
    if (mainWindow) mainWindow.webContents.send('ipfs:swarm-changed', { active: false });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ipfs:swarmKeyActive', async () => {
  try {
    const swarmKeyPath = path.join(IPFS_REPO(), 'swarm.key');
    const keyContent = await fs.readFile(swarmKeyPath, 'utf8');
    // Try to find the name from registry
    const keys = await loadSwarmKeys();
    const match = keys.find((k) => k.key.trim() === keyContent.trim());
    return { active: true, name: match?.name || null, key: keyContent };
  } catch {
    return { active: false };
  }
});

// ===========================================
// Mobile Bridge (WebSocket + HTTP)
// ===========================================

function handleBridgeMessage(ws, msg) {
  if (!mainWindow) return;
  try {
    switch (msg.action) {
      case 'list-notebooks':
        mainWindow.webContents.send('bridge:request', { action: 'list-notebooks', wsId: ws._bridgeId });
        break;
      case 'get-notebook':
        mainWindow.webContents.send('bridge:request', { action: 'get-notebook', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'create-notebook':
        mainWindow.webContents.send('bridge:request', { action: 'create-notebook', wsId: ws._bridgeId });
        break;
      case 'cell-update':
        mainWindow.webContents.send('bridge:request', { action: 'cell-update', notebookId: msg.notebookId, cellId: msg.cellId, source: msg.source, wsId: ws._bridgeId });
        break;
      case 'run-cell':
        mainWindow.webContents.send('bridge:request', { action: 'run-cell', notebookId: msg.notebookId, cellId: msg.cellId, wsId: ws._bridgeId });
        break;
      case 'add-cell':
        mainWindow.webContents.send('bridge:request', { action: 'add-cell', notebookId: msg.notebookId, cellType: msg.cellType, afterIndex: msg.afterIndex, wsId: ws._bridgeId });
        break;
      case 'delete-cell':
        mainWindow.webContents.send('bridge:request', { action: 'delete-cell', notebookId: msg.notebookId, cellId: msg.cellId, wsId: ws._bridgeId });
        break;
      case 'toggle-cell-type':
        mainWindow.webContents.send('bridge:request', { action: 'toggle-cell-type', notebookId: msg.notebookId, cellId: msg.cellId, wsId: ws._bridgeId });
        break;
      case 'move-cell-up':
        mainWindow.webContents.send('bridge:request', { action: 'move-cell-up', notebookId: msg.notebookId, cellId: msg.cellId, wsId: ws._bridgeId });
        break;
      case 'move-cell-down':
        mainWindow.webContents.send('bridge:request', { action: 'move-cell-down', notebookId: msg.notebookId, cellId: msg.cellId, wsId: ws._bridgeId });
        break;
      case 'restart-kernel':
        mainWindow.webContents.send('bridge:request', { action: 'restart-kernel', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'interrupt-kernel':
        mainWindow.webContents.send('bridge:request', { action: 'interrupt-kernel', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'get-collab-status':
        mainWindow.webContents.send('bridge:request', { action: 'get-collab-status', wsId: ws._bridgeId });
        break;
      case 'get-history':
        mainWindow.webContents.send('bridge:request', { action: 'get-history', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'history-undo':
        mainWindow.webContents.send('bridge:request', { action: 'history-undo', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'history-redo':
        mainWindow.webContents.send('bridge:request', { action: 'history-redo', notebookId: msg.notebookId, wsId: ws._bridgeId });
        break;
      case 'history-goto':
        mainWindow.webContents.send('bridge:request', { action: 'history-goto', notebookId: msg.notebookId, nodeId: msg.nodeId, wsId: ws._bridgeId });
        break;
      case 'pip-install':
        mainWindow.webContents.send('bridge:request', { action: 'pip-install', packages: msg.packages, wsId: ws._bridgeId });
        break;
      case 'pip-list':
        mainWindow.webContents.send('bridge:request', { action: 'pip-list', wsId: ws._bridgeId });
        break;
    }
  } catch (err) {
    console.error('[Bridge] Error handling message:', err);
  }
}

ipcMain.on('bridge:response', (_event, { wsId, data }) => {
  for (const ws of bridgeClients) {
    if (ws._bridgeId === wsId && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
});

ipcMain.on('bridge:broadcast', (_event, data) => {
  const msg = JSON.stringify(data);
  for (const ws of bridgeClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
});

let bridgeIdCounter = 0;

ipcMain.handle('bridge:start', async () => {
  try {
    if (bridgeHttpServer) {
      return { success: true, port: BRIDGE_PORT, pin: bridgePin, ip: getLocalIp() };
    }

    bridgePin = String(Math.floor(100000 + Math.random() * 900000));

    const mobileDist = path.join(__dirname, 'mobile', 'dist');
    const hasMobileDist = fsSync.existsSync(mobileDist);

    bridgeHttpServer = http.createServer((req, res) => {
      if (!hasMobileDist) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="background:#0f172a;color:#94a3b8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Lab Mobile</h2><p>Mobile PWA not built yet.</p><p>Run: <code>cd mobile && npm run build</code></p></div></body></html>');
        return;
      }

      let filePath = path.join(mobileDist, req.url === '/' ? 'index.html' : req.url);
      if (!filePath.startsWith(mobileDist)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon', '.woff2': 'font/woff2',
      };

      fsSync.readFile(filePath, (err, data) => {
        if (err) {
          fsSync.readFile(path.join(mobileDist, 'index.html'), (err2, html) => {
            if (err2) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    bridgeWss = new WebSocketServer({ server: bridgeHttpServer });

    bridgeWss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://localhost:${BRIDGE_PORT}`);
      if (url.searchParams.get('token') !== bridgePin) {
        ws.close(4001, 'Invalid PIN');
        return;
      }

      ws._bridgeId = ++bridgeIdCounter;
      bridgeClients.add(ws);
      console.log(`[Bridge] Client connected (id=${ws._bridgeId}, total=${bridgeClients.size})`);

      if (mainWindow) {
        mainWindow.webContents.send('bridge:client-count', bridgeClients.size);
      }

      ws.on('message', (raw) => {
        try {
          handleBridgeMessage(ws, JSON.parse(raw.toString()));
        } catch (err) {
          console.error('[Bridge] Bad message:', err);
        }
      });

      ws.on('close', () => {
        bridgeClients.delete(ws);
        console.log(`[Bridge] Client disconnected (total=${bridgeClients.size})`);
        if (mainWindow) {
          mainWindow.webContents.send('bridge:client-count', bridgeClients.size);
        }
      });
    });

    bridgeHttpServer.listen(BRIDGE_PORT);
    console.log(`[Bridge] Started on port ${BRIDGE_PORT} (PIN: ${bridgePin})`);

    return { success: true, port: BRIDGE_PORT, pin: bridgePin, ip: getLocalIp() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('bridge:stop', async () => {
  try {
    for (const ws of bridgeClients) ws.close();
    bridgeClients.clear();
    if (bridgeWss) { bridgeWss.close(); bridgeWss = null; }
    if (bridgeHttpServer) { bridgeHttpServer.close(); bridgeHttpServer = null; }
    bridgePin = null;
    console.log('[Bridge] Stopped');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('bridge:status', () => ({
  running: !!bridgeHttpServer,
  port: BRIDGE_PORT,
  pin: bridgePin,
  ip: getLocalIp(),
  clients: bridgeClients.size,
}));

// ===========================================
// App Info
// ===========================================

ipcMain.handle('app:getPath', (_event, name) => app.getPath(name));
