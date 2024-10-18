const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const url = require('url');
const fs = require('fs');
const { execFile } = require('child_process');

const downloader = require(`${__dirname}/downloader.js`);

const { dialog, shell } = require('electron')
const Menu = electron.Menu;

let config;

let win;

let changeDownloadsDir;
let restoreDownloadsDir;
let restoreOptions;
let autoBestQuality;
let embedThumbnail;
let writeHistory;
let skipShortsThumbnailEmbed;
let checkForYtdlpUpdates;
let recodeVideos;

let disableDownload = false;

function createWindow(){
    win = new BrowserWindow({
        width: 800, 
        minWidth: 350,
        height: 600,
        minHeight: 350,
        icon: `${__dirname}/assets/icons/youtube-dl-ez.ico`,
        autoHideMenuBar: false,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    // win.webContents.openDevTools();

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true
    }));

    win.on('closed', () => {
        downloader.clearTempDir();
        win = null;
    });
}

function writeOutput(value, overwrite = false){
    win.webContents.send('writeOutput', {value: value, overwrite: overwrite});
    console.log(`OUTPUT WRITE: "${value}"`);
}

function resetDefaultConfig(){
    config = {
        ytdlpPath: path.resolve('./yt-dlp.exe'),
        ffmpegPath: path.resolve('./ffmpeg.exe'),
        mogrifyPath: path.resolve('./mogrify.exe'),
        downloadDirPath: path.resolve('./downloads/'),
        autoBestQuality: false,
        embedThumbnail: true,
        writeHistory: true,
        skipShortsThumbnailEmbed: true,
        autoUpdateYtdlp: true,
        recodeVideos: true,
    }

    writeConfigFile();
}

function readConfigFile(){
    if (!fs.existsSync(path.resolve('./config.json'))) return resetDefaultConfig();
    
    config = JSON.parse(fs.readFileSync(path.resolve('./config.json')));

    if (config == undefined) return resetDefaultConfig();
    if (config.autoBestQuality == undefined || !(typeof config.autoBestQuality === "boolean")) return resetDefaultConfig();
    if (config.downloadDirPath == undefined || !fs.existsSync(config.downloadDirPath)) {
        config.downloadDirPath = path.resolve('./downloads/');
        writeConfigFile();
    }
    if (config.embedThumbnail == undefined || !(typeof config.embedThumbnail === "boolean")) return resetDefaultConfig();
    if (config.writeHistory == undefined || !(typeof config.writeHistory === "boolean")) return resetDefaultConfig();
    if (config.skipShortsThumbnailEmbed == undefined || !(typeof config.skipShortsThumbnailEmbed === "boolean")) return resetDefaultConfig();
    if (config.autoUpdateYtdlp == undefined || !(typeof config.autoUpdateYtdlp === "boolean")) return resetDefaultConfig();
    if (config.recodeVideos == undefined || !(typeof config.recodeVideos === "boolean")) return resetDefaultConfig();
}

function writeConfigFile(){
    fs.writeFileSync(path.resolve('./config.json'), JSON.stringify(config));
}

function openDownloadsDirectory(){
    try{
        shell.openPath(path.normalize(config.downloadDirPath));
    } catch {}
}

function openDownloadHistory(){
    if (!fs.existsSync(path.resolve('./log/download-history.txt/'))) return;

    try{
        shell.openPath(path.resolve('./log/download-history.txt/'));
    } catch{}
}

async function changeDownloadsDirectory(dirPath){
    if (dirPath == undefined){
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        })
    
        if(result == undefined || result.canceled || result.filePaths[0] == undefined || result.filePaths[0] == "") return;
    
        dirPath = result.filePaths[0];
    }

    config.downloadDirPath = dirPath;
    writeConfigFile();

    writeOutput(`Changed downloads folder to: '${config.downloadDirPath}'`, true);
}

function restoreDefaultOptions(){
    resetDefaultConfig();

    autoBestQuality.checked = config.autoBestQuality;
    embedThumbnail.checked = config.embedThumbnail;
    writeHistory.checked = config.writeHistory;
    skipShortsThumbnailEmbed.checked = config.skipShortsThumbnailEmbed;
    autoUpdateYtdlp.checked = config.autoUpdateYtdlp;

    recodeVideos.checked = config.recodeVideos;
}

function setMenuState(value){
    if (value == undefined) return;
    const state = (value) ? true : false;

    changeDownloadsDir.enabled = state;
    restoreDownloadsDir.enabled = state;
    restoreOptions.enabled = state;
    autoBestQuality.enabled = state;
    embedThumbnail.enabled = state;
    writeHistory.enabled = state;
    skipShortsThumbnailEmbed.enabled = state;
    checkForYtdlpUpdates.enabled = state;

    recodeVideos.enabled = state;
}

function updateYtdlp(){
    disableDownload = true;
    checkForYtdlpUpdates.enabled = false;
    writeOutput('Updating yt-dlp...', true);

    if (fs.existsSync(path.resolve(config.ytdlpPath))) execFile(path.resolve(config.ytdlpPath), ['--update'], (error, stdout, stderr) => {
        if (error) {
            throw error;
        }

        if (fs.existsSync('./yt-dlp.exe.old')) writeOutput('Update complete!');
        else writeOutput('Already up-to-date!');

        disableDownload = false;
        checkForYtdlpUpdates.enabled = true;
    });
    else writeOutput('ERROR: \'yt-dlp.exe\' binary not found', true);
}

electron.ipcMain.on('startDownload', (event, arg) => {
    if (disableDownload) return;
    console.log("'startDownload' request recieved");
    downloader.startDownload(win, {url: arg.url, config: config});
});
electron.ipcMain.on('submitFormatChoice', (event, arg) => {
    console.log("'submitFormatChoice' request recieved");
    downloader.submitFormatChoice(arg);
});
electron.ipcMain.on('cancelDownload', (event, arg) => {
    console.log("'cancelDownload' request recieved");
    downloader.cancelDownload(() => {
        writeOutput('Download cancelled!', true);
        win.webContents.send('updateDownloadStatus', {value: false});
        setMenuState(true);
    }); 
});
electron.ipcMain.on('setMenuState', (event, arg) => {
    console.log("'setMenuState' request recieved");
    setMenuState(arg)
});

app.on('ready', () => {
    createWindow();

    readConfigFile();

    const template = [
        {
            label: 'File',
            submenu: [
                { label: 'Open Downloads Folder', type: 'normal', click: () => { openDownloadsDirectory() } },
                { id: 'changeDownloadsDir', label: 'Change Downloads Folder', type: 'normal', click: () => { changeDownloadsDirectory() } },
                { label: 'Open Download History', type: 'normal', click: () => { openDownloadHistory() } },
                { id: 'restoreDownloadsDir', label: 'Restore Default Downloads Folder', type: 'normal', click: () => { changeDownloadsDirectory(path.resolve('./downloads/')) } },
                { id: 'restoreOptions', label: 'Restore Default Options', type: 'normal', click: () => { restoreDefaultOptions() } },
                { id: 'checkForYtdlpUpdates', label: 'Check for yt-dlp updates', type: 'normal', click: () => { updateYtdlp() } },
                { label: 'Exit', type: 'normal', click: () => { app.quit() } }
            ]
        },
        {
            label: 'Options',
            submenu: [
                { id: 'autoBestQuality', label: 'Always download best quality', type: 'checkbox', checked: config.autoBestQuality, click: () => { config.autoBestQuality = !config.autoBestQuality; writeConfigFile(); } },
                { id: 'embedThumbnail', label: 'Embed thumbnails', type: 'checkbox', checked: config.embedThumbnail, click: () => { config.embedThumbnail = !config.embedThumbnail; writeConfigFile(); } },
                { id: 'skipShortsThumbnailEmbed', label: 'Skip thumbnail embedding for Shorts', type: 'checkbox', checked: config.skipShortsThumbnailEmbed, click: () => { config.skipShortsThumbnailEmbed = !config.skipShortsThumbnailEmbed; writeConfigFile(); } },
                { id: 'writeHistory', label: 'Write download history', type: 'checkbox', checked: config.writeHistory, click: () => { config.writeHistory = !config.writeHistory; writeConfigFile(); } },
                { id: 'autoUpdateYtdlp', label: 'Check for yt-dlp update on launch', type: 'checkbox', checked: config.autoUpdateYtdlp, click: () => { config.autoUpdateYtdlp = !config.autoUpdateYtdlp; writeConfigFile(); } },
            ]
        },
        {
            label: 'Encoding',
            submenu: [
                { id: 'recodeVideos', label: 'Recode videos to H.264', type: 'checkbox', checked: config.recodeVideos, click: () => { config.recodeVideos = !config.recodeVideos; writeConfigFile(); } },
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    changeDownloadsDir = Menu.getApplicationMenu().getMenuItemById('changeDownloadsDir');
    restoreDownloadsDir = Menu.getApplicationMenu().getMenuItemById('restoreDownloadsDir');
    restoreOptions = Menu.getApplicationMenu().getMenuItemById('restoreOptions');
    autoBestQuality = Menu.getApplicationMenu().getMenuItemById('autoBestQuality');
    embedThumbnail = Menu.getApplicationMenu().getMenuItemById('embedThumbnail');
    writeHistory = Menu.getApplicationMenu().getMenuItemById('writeHistory');
    skipShortsThumbnailEmbed = Menu.getApplicationMenu().getMenuItemById('skipShortsThumbnailEmbed');
    checkForYtdlpUpdates = Menu.getApplicationMenu().getMenuItemById('checkForYtdlpUpdates');
    autoUpdateYtdlp = Menu.getApplicationMenu().getMenuItemById('autoUpdateYtdlp');
    recodeVideos = Menu.getApplicationMenu().getMenuItemById('recodeVideos');

    setTimeout(() => {
        if (config.autoUpdateYtdlp) updateYtdlp();
    }, 500);
})