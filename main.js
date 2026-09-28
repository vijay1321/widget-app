const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const { API_BASE_URL } = require('./src/config/api');
const configPath = path.join(app.getPath('userData'), 'config.json');

let mainWindow;
let loginWindow;
let syncInterval;

// Simple store
const store = {
    get: (key) => {
        try { return JSON.parse(fs.readFileSync(configPath))[key]; } catch(e) { return null; }
    },
    set: (key, value) => {
        let data = {};
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
    loginWindow.loadFile('login.html');
    
    // Pass API URL to renderer
    loginWindow.webContents.on('did-finish-load', () => {
        loginWindow.webContents.send('api-url', API_BASE_URL);
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
    mainWindow.loadFile('index.html');
}

let isSyncing = false;
async function startSync() {
    if (isSyncing) return;
    const token = store.get('token');
    if (!token) return;

    isSyncing = true;
    try {
        const res = await axios.get(`${API_BASE_URL}/device/widgets`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-widgets', res.data.widgets);
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            store.set('token', null);
            if (syncInterval) clearInterval(syncInterval);
            if (mainWindow) mainWindow.close();
            createLoginWindow();
        }
    } finally {
        isSyncing = false;
    }
}

app.whenReady().then(() => {
    const token = store.get('token');
    if (!token) {
        createLoginWindow();
    } else {
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
        await axios.patch(`${API_BASE_URL}/device/widgets/${data.widgetId}/position`, 
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
