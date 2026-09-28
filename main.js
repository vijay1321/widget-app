const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { BASE_URL } = require('./src/config/api');
let logPath = null;

function logToFile(msg) {
    if (!logPath) {
        try { logPath = path.join(app.getPath('userData'), 'debug.log'); } catch (e) { return; }
    }
    try { fs.appendFileSync(logPath, msg + '\n'); } catch (e) {}
}

try {
    logToFile(`[API] BASE_URL = ${BASE_URL}`);
} catch (e) {}

let mainWindow;
let loginWindow;
let syncInterval;

// Simple store
const store = {
    get: (key) => {
        try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json')))[key]; } catch(e) { return null; }
    },
    set: (key, value) => {
        let data = {};
        const configPath = path.join(app.getPath('userData'), 'config.json');
        try { data = JSON.parse(fs.readFileSync(configPath)); } catch(e) {}
        data[key] = value;
        fs.writeFileSync(configPath, JSON.stringify(data));
    }
};

function createLoginWindow() {
    if (loginWindow) return;
    loginWindow = new BrowserWindow({
        width: 400,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });
    logToFile('[Widgetly] Creating window (login)');
    loginWindow.loadFile(path.join(__dirname, 'login.html')).then(() => {
        logToFile('[Widgetly] Renderer loaded (login.html)');
        logToFile('[Widgetly] Production path being loaded: ' + path.join(__dirname, 'login.html'));
    }).catch(e => {
        logToFile('[Widgetly] Renderer failed (login.html): ' + e.message);
    });
    
    // Pass API URL to renderer
    loginWindow.webContents.on('did-finish-load', () => {
        loginWindow.webContents.send('api-url', BASE_URL);
    });
}

function createMainWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    
    mainWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    logToFile('[Widgetly] Creating window (main)');
    mainWindow.loadFile(path.join(__dirname, 'index.html')).then(() => {
        logToFile('[Widgetly] Renderer loaded (index.html)');
        logToFile('[Widgetly] Production path being loaded: ' + path.join(__dirname, 'index.html'));
    }).catch(e => {
        logToFile('[Widgetly] Renderer failed (index.html): ' + e.message);
    });
}

let isSyncing = false;
async function startSync() {
    if (isSyncing) return;
    const token = store.get('token');
    if (!token) return;

    isSyncing = true;
    try {
        logToFile(`[API] Fetching widgets...`);
        const res = await axios.get(`${BASE_URL}/api/device/widgets`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        logToFile(`[API] Response status = ${res.status}`);
        logToFile(`[API] Widget count = ${res.data.widgets ? res.data.widgets.length : 0}`);
        if (res.data.widgets && res.data.widgets.length > 0) {
            logToFile(`[API] First widget assetUrl = ${res.data.widgets[0].assetUrl}`);
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-widgets', res.data.widgets);
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            store.set('token', null);
            if (syncInterval) clearInterval(syncInterval);
            if (mainWindow) mainWindow.close();
            createLoginWindow();
        } else {
            logToFile('[API] Error fetching widgets: ' + error.message);
        }
    } finally {
        isSyncing = false;
    }
}

app.whenReady().then(() => {
    logToFile('====================================');
    logToFile('[Widgetly] Electron starting');
    const token = store.get('token');
    if (!token) {
        logToFile('[Widgetly] No token found, opening login window');
        createLoginWindow();
    } else {
        logToFile('[Widgetly] Token found, starting sync and main window');
        createMainWindow();
        startSync();
        syncInterval = setInterval(startSync, 5000); // Sync every 5 seconds
    }
});

ipcMain.on('login-success', (event, token) => {
    store.set('token', token);
    if (loginWindow) {
        loginWindow.close();
        loginWindow = null;
    }
    createMainWindow();
    startSync();
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(startSync, 5000);
});

ipcMain.on('update-position', async (event, data) => {
    const token = store.get('token');
    if (!token) return;
    try {
        await axios.patch(`${BASE_URL}/api/device/widgets/${data.widgetId}/position`, 
            { x: data.x },
            { headers: { Authorization: `Bearer ${token}` } }
        );
    } catch (e) { console.error('Position save failed', e?.response?.data || e.message); }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(ignore, options);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
