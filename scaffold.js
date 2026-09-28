const fs = require('fs');
const path = require('path');

const files = {
    'main.js': `const { app, BrowserWindow, ipcMain, screen } = require('electron');
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

async function startSync() {
    const token = store.get('token');
    if (!token) return;

    try {
        const res = await axios.get(\`\${API_BASE_URL}/api/device/widgets\`, {
            headers: { Authorization: \`Bearer \${token}\` }
        });
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-widgets', res.data.widgets);
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            store.set('token', null);
            if (mainWindow) mainWindow.close();
            createLoginWindow();
        }
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
    syncInterval = setInterval(startSync, 5000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
`,
    
    'index.html': `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
        .widget-container { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; }
        
        @keyframes sway {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(3deg); }
            50% { transform: rotate(0deg); }
            75% { transform: rotate(-3deg); }
            100% { transform: rotate(0deg); }
        }
        
        .animate-sway {
            animation: sway 4s ease-in-out infinite;
            transform-origin: top center;
        }
    </style>
</head>
<body>
    <div id="desktop-layer"></div>

    <script>
        const { ipcRenderer } = require('electron');
        
        ipcRenderer.on('sync-widgets', (event, widgets) => {
            const container = document.getElementById('desktop-layer');
            container.innerHTML = '';
            
            widgets.forEach(widget => {
                const div = document.createElement('div');
                div.className = 'widget-container animate-sway';
                
                // Position
                div.style.left = widget.position?.x || '90%';
                div.style.top = widget.position?.y || '0%';
                
                // Size
                let width = '100px';
                if(widget.size === 'small') width = '70px';
                if(widget.size === 'large') width = '150px';
                
                const img = document.createElement('img');
                img.src = widget.assetUrl;
                img.style.width = width;
                
                div.appendChild(img);
                container.appendChild(div);
            });
        });
    </script>
</body>
</html>`,

    'login.html': `<!DOCTYPE html>
<html>
<head>
    <title>Widgetly - Windows Link</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fbfbf9; color: #33312e; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 80%; max-width: 300px; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #33312e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        button:hover { background: #000; }
        #error { color: red; font-size: 14px; margin-bottom: 10px; text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <h2 style="text-align: center; margin-top: 0;">Link Device</h2>
        <p style="text-align: center; font-size: 14px; color: #666;">Login with your Widgetly account to sync decorations.</p>
        <div id="error"></div>
        <form id="loginForm">
            <input type="email" id="email" placeholder="Email" required />
            <input type="password" id="password" placeholder="Password" required />
            <button type="submit">Login & Sync</button>
        </form>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        const axios = require('axios');
        let { API_BASE_URL } = require('./src/config/api');

        ipcRenderer.on('api-url', (event, url) => {
            API_BASE_URL = url;
        });

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error');
            
            try {
                const res = await axios.post(\`\${API_BASE_URL}/api/auth/login\`, { email, password });
                ipcRenderer.send('login-success', res.data.token);
            } catch (err) {
                errorDiv.innerText = err.response?.data?.message || 'Login failed. Check API connection.';
            }
        });
    </script>
</body>
</html>`,

    '.env': ``,
    '.env.example': ``
};

for (const [filepath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(process.cwd(), filepath), content);
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.main = 'main.js';
packageJson.scripts = {
    "start": "electron .",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
};
packageJson.build = {
    "appId": "com.widgetly.app",
    "productName": "Widgetly",
    "win": {
        "target": "nsis"
    }
};
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

console.log('Windows app files created successfully!');
