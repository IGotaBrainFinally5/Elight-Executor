
"use strict";

const {
    app,
    BrowserWindow,
    ipcMain
} = require("electron");

const fs = require("fs");
const path = require("path");

let mainWindow = null;
let settingsPath = null;
let workspacePath = null;
let scriptsPath = null;

const DEFAULT_SETTINGS = {
    alwaysOnTop: false,
    theme: "dark",
    animations: "minimal",
    autoScroll: true,
    startupAnimation: true,
    toggleShortcut: "RightCtrl",
    starSpeed: 4,
    ignorePopups: false
};

let settings = { ...DEFAULT_SETTINGS };

const VALID_THEMES = [
    "dark",
    "midnight",
    "light",
    "space"
];

const VALID_ANIMATIONS = [
    "minimal",
    "off"
];

function atomicWrite(filePath, data) {
    const temporaryPath = `${filePath}.tmp`;

    try {
        fs.mkdirSync(path.dirname(filePath), {
            recursive: true
        });

        fs.writeFileSync(
            temporaryPath,
            data,
            "utf8"
        );

        fs.renameSync(temporaryPath, filePath);
        return true;
    } catch (error) {
        try {
            if (fs.existsSync(temporaryPath)) {
                fs.unlinkSync(temporaryPath);
            }
        } catch (cleanupError) {
            console.error("[Elight] Temporary-file cleanup failed:", cleanupError);
        }

        throw error;
    }
}

// =========================================
// SETTINGS STORAGE
// =========================================

function loadSettings() {
    settingsPath = path.join(
        app.getPath("userData"),
        "elight-settings.json"
    );

    try {
        if (!fs.existsSync(settingsPath)) {
            settings = { ...DEFAULT_SETTINGS };
            saveSettings();
            return;
        }

        const parsedSettings = JSON.parse(
            fs.readFileSync(settingsPath, "utf8")
        );

        settings = {
            ...DEFAULT_SETTINGS,
            ...parsedSettings
        };

        if (!VALID_THEMES.includes(settings.theme)) {
            settings.theme = DEFAULT_SETTINGS.theme;
        }

        if (!VALID_ANIMATIONS.includes(settings.animations)) {
            settings.animations = DEFAULT_SETTINGS.animations;
        }

        for (const key of [
            "alwaysOnTop",
            "autoScroll",
            "startupAnimation",
            "ignorePopups"
        ]) {
            if (typeof settings[key] !== "boolean") {
                settings[key] = DEFAULT_SETTINGS[key];
            }
        }

        if (
            typeof settings.toggleShortcut !== "string" ||
            settings.toggleShortcut.length > 80
        ) {
            settings.toggleShortcut = DEFAULT_SETTINGS.toggleShortcut;
        }

        if (
            !Number.isInteger(settings.starSpeed) ||
            settings.starSpeed < 1 ||
            settings.starSpeed > 10
        ) {
            settings.starSpeed = DEFAULT_SETTINGS.starSpeed;
        }
    } catch (error) {
        console.error("[Elight] Could not load settings:", error);
        settings = { ...DEFAULT_SETTINGS };
    }
}

function saveSettings() {
    try {
        if (!settingsPath) {
            throw new Error("Settings path has not been initialized.");
        }

        atomicWrite(
            settingsPath,
            JSON.stringify(settings, null, 4)
        );

        return true;
    } catch (error) {
        console.error("[Elight] Could not save settings:", error);
        return false;
    }
}

// =========================================
// EDITOR WORKSPACE STORAGE
// =========================================

const DEFAULT_EDITOR_WORKSPACE = {
    tabs: [
        {
            id: 1,
            name: "Script 1",
            content: ""
        }
    ],
    activeTab: 0
};

const MAX_EDITOR_TABS = 100;
const MAX_TAB_NAME_LENGTH = 80;
const MAX_TAB_CONTENT_LENGTH = 1024 * 1024;
const MAX_WORKSPACE_SIZE = 10 * 1024 * 1024;

function getWorkspacePath() {
    if (!workspacePath) {
        workspacePath = path.join(
            app.getPath("userData"),
            "elight-workspace.json"
        );
    }

    return workspacePath;
}

function validateEditorWorkspace(workspace) {
    if (
        !workspace ||
        typeof workspace !== "object" ||
        Array.isArray(workspace)
    ) {
        return {
            valid: false,
            error: "Invalid editor workspace data."
        };
    }

    if (
        !Array.isArray(workspace.tabs) ||
        workspace.tabs.length < 1 ||
        workspace.tabs.length > MAX_EDITOR_TABS
    ) {
        return {
            valid: false,
            error: `Workspace must contain between 1 and ${MAX_EDITOR_TABS} tabs.`
        };
    }

    const ids = new Set();
    const validatedTabs = [];
    let totalContentLength = 0;

    for (const tab of workspace.tabs) {
        if (
            !tab ||
            typeof tab !== "object" ||
            Array.isArray(tab)
        ) {
            return {
                valid: false,
                error: "Invalid editor tab data."
            };
        }

        if (
            !Number.isSafeInteger(tab.id) ||
            tab.id < 1 ||
            ids.has(tab.id)
        ) {
            return {
                valid: false,
                error: "Invalid or duplicate editor tab ID."
            };
        }

        if (
            typeof tab.name !== "string" ||
            tab.name.length < 1 ||
            tab.name.length > MAX_TAB_NAME_LENGTH
        ) {
            return {
                valid: false,
                error: "An editor tab has an invalid name."
            };
        }

        if (
            typeof tab.content !== "string" ||
            tab.content.length > MAX_TAB_CONTENT_LENGTH
        ) {
            return {
                valid: false,
                error: "An editor tab contains invalid or oversized content."
            };
        }

        totalContentLength += Buffer.byteLength(tab.content, "utf8");

        if (totalContentLength > MAX_WORKSPACE_SIZE) {
            return {
                valid: false,
                error: "The editor workspace is too large to save."
            };
        }

        ids.add(tab.id);

        validatedTabs.push({
            id: tab.id,
            name: tab.name,
            content: tab.content
        });
    }

    if (
        !Number.isInteger(workspace.activeTab) ||
        workspace.activeTab < 0 ||
        workspace.activeTab >= validatedTabs.length
    ) {
        return {
            valid: false,
            error: "Invalid active editor tab."
        };
    }

    return {
        valid: true,
        workspace: {
            tabs: validatedTabs,
            activeTab: workspace.activeTab
        }
    };
}

function loadEditorWorkspace() {
    const filePath = getWorkspacePath();

    try {
        if (!fs.existsSync(filePath)) {
            return {
                ...DEFAULT_EDITOR_WORKSPACE,
                tabs: DEFAULT_EDITOR_WORKSPACE.tabs.map(tab => ({ ...tab }))
            };
        }

        const fileContents = fs.readFileSync(filePath, "utf8");

        if (
            Buffer.byteLength(fileContents, "utf8") >
            MAX_WORKSPACE_SIZE + 100000
        ) {
            throw new Error("Workspace file exceeds the allowed size.");
        }

        const validation = validateEditorWorkspace(
            JSON.parse(fileContents)
        );

        if (!validation.valid) {
            throw new Error(validation.error);
        }

        return validation.workspace;
    } catch (error) {
        console.error("[Elight] Could not load editor workspace:", error);

        return {
            ...DEFAULT_EDITOR_WORKSPACE,
            tabs: DEFAULT_EDITOR_WORKSPACE.tabs.map(tab => ({ ...tab }))
        };
    }
}

function saveEditorWorkspace(workspace) {
    const validation = validateEditorWorkspace(workspace);

    if (!validation.valid) {
        return {
            success: false,
            error: validation.error
        };
    }

    try {
        atomicWrite(
            getWorkspacePath(),
            JSON.stringify(validation.workspace, null, 4)
        );

        return { success: true };
    } catch (error) {
        console.error("[Elight] Could not save editor workspace:", error);

        return {
            success: false,
            error: "Could not write the editor workspace to disk."
        };
    }
}

// =========================================
// SAVED SCRIPTS STORAGE
// =========================================

const MAX_SAVED_SCRIPTS = 500;
const MAX_SAVED_SCRIPT_NAME = 100;
const MAX_SAVED_SCRIPT_CONTENT = 1024 * 1024;
const MAX_SAVED_SCRIPTS_SIZE = 25 * 1024 * 1024;

function getScriptsPath() {
    if (!scriptsPath) {
        scriptsPath = path.join(
            app.getPath("userData"),
            "elight-scripts.json"
        );
    }

    return scriptsPath;
}

function validateSavedScripts(scripts) {
    if (!Array.isArray(scripts) || scripts.length > MAX_SAVED_SCRIPTS) {
        return {
            valid: false,
            error: "Invalid saved scripts list."
        };
    }

    const ids = new Set();
    const validated = [];
    let totalSize = 0;

    for (const script of scripts) {
        if (
            !script ||
            typeof script !== "object" ||
            Array.isArray(script)
        ) {
            return {
                valid: false,
                error: "Invalid saved script."
            };
        }

        if (
            typeof script.id !== "string" ||
            script.id.length < 1 ||
            script.id.length > 100 ||
            ids.has(script.id)
        ) {
            return {
                valid: false,
                error: "A saved script has an invalid or duplicate ID."
            };
        }

        if (
            typeof script.name !== "string" ||
            script.name.trim().length < 1 ||
            script.name.length > MAX_SAVED_SCRIPT_NAME
        ) {
            return {
                valid: false,
                error: "A saved script has an invalid name."
            };
        }

        if (
            typeof script.content !== "string" ||
            script.content.length > MAX_SAVED_SCRIPT_CONTENT
        ) {
            return {
                valid: false,
                error: "A saved script has invalid or oversized content."
            };
        }

        totalSize += Buffer.byteLength(script.content, "utf8");

        if (totalSize > MAX_SAVED_SCRIPTS_SIZE) {
            return {
                valid: false,
                error: "Your saved scripts exceed the storage limit."
            };
        }

        if (
            script.autoRun !== undefined &&
            typeof script.autoRun !== "boolean"
        ) {
            return {
                valid: false,
                error: "Invalid automatic-run preference."
            };
        }

        if (
            script.autoConnect !== undefined &&
            typeof script.autoConnect !== "boolean"
        ) {
            return {
                valid: false,
                error: "Invalid automatic-connection preference."
            };
        }

        ids.add(script.id);

        validated.push({
            id: script.id,
            name: script.name.trim(),
            content: script.content,
            autoRun: script.autoRun === true,
            autoConnect: script.autoConnect === true
        });
    }

    return {
        valid: true,
        scripts: validated
    };
}

function loadSavedScripts() {
    try {
        const filePath = getScriptsPath();

        if (!fs.existsSync(filePath)) {
            return [];
        }

        const raw = fs.readFileSync(filePath, "utf8");

        if (Buffer.byteLength(raw, "utf8") > MAX_SAVED_SCRIPTS_SIZE + 200000) {
            throw new Error("Saved scripts file exceeds the allowed size.");
        }

        const validation = validateSavedScripts(JSON.parse(raw));

        if (!validation.valid) {
            throw new Error(validation.error);
        }

        return validation.scripts;
    } catch (error) {
        console.error("[Elight] Could not load saved scripts:", error);
        return [];
    }
}

function saveSavedScripts(scripts) {
    const validation = validateSavedScripts(scripts);

    if (!validation.valid) {
        return {
            success: false,
            error: validation.error
        };
    }

    try {
        atomicWrite(
            getScriptsPath(),
            JSON.stringify(validation.scripts, null, 4)
        );

        return { success: true };
    } catch (error) {
        console.error("[Elight] Could not save scripts:", error);

        return {
            success: false,
            error: "Could not save your scripts to disk."
        };
    }
}

// =========================================
// WINDOW CREATION
// =========================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 850,
        minWidth: 1000,
        minHeight: 650,
        title: "Elight",
        frame: false,
        backgroundColor: "#080b12",
        alwaysOnTop: settings.alwaysOnTop,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, "index.html"));

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// =========================================
// WINDOW CONTROL IPC
// =========================================

ipcMain.on("window-minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

ipcMain.on("window-maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on("window-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
});

// =========================================
// SETTINGS IPC
// =========================================

ipcMain.on("settings:get-startup-animation", event => {
    event.returnValue = settings.startupAnimation;
});

ipcMain.handle("settings:get", () => ({ ...settings }));

ipcMain.handle("settings:set-always-on-top", (event, enabled) => {
    if (typeof enabled !== "boolean") {
        return { success: false, error: "Invalid Always on Top value." };
    }

    settings.alwaysOnTop = enabled;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(enabled);
    }

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save Always on Top setting." };
});

ipcMain.handle("settings:set-theme", (event, theme) => {
    if (typeof theme !== "string" || !VALID_THEMES.includes(theme)) {
        return { success: false, error: "Invalid theme selected." };
    }

    settings.theme = theme;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save theme." };
});

ipcMain.handle("settings:set-animations", (event, animations) => {
    if (
        typeof animations !== "string" ||
        !VALID_ANIMATIONS.includes(animations)
    ) {
        return { success: false, error: "Invalid animation preference." };
    }

    settings.animations = animations;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save animation preference." };
});

ipcMain.handle("settings:set-auto-scroll", (event, enabled) => {
    if (typeof enabled !== "boolean") {
        return { success: false, error: "Invalid auto-scroll value." };
    }

    settings.autoScroll = enabled;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save auto-scroll setting." };
});

ipcMain.handle("settings:set-startup-animation", (event, enabled) => {
    if (typeof enabled !== "boolean") {
        return { success: false, error: "Invalid startup animation value." };
    }

    settings.startupAnimation = enabled;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save startup animation setting." };
});

ipcMain.handle("settings:set-toggle-shortcut", (event, shortcut) => {
    if (
        typeof shortcut !== "string" ||
        shortcut.length < 1 ||
        shortcut.length > 80
    ) {
        return { success: false, error: "Invalid shortcut preference." };
    }

    settings.toggleShortcut = shortcut;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save shortcut preference." };
});

ipcMain.handle("settings:set-star-speed", (event, value) => {
    if (!Number.isInteger(value) || value < 1 || value > 10) {
        return { success: false, error: "Star speed must be between 1 and 10." };
    }

    settings.starSpeed = value;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save star speed." };
});

ipcMain.handle("settings:set-ignore-popups", (event, enabled) => {
    if (typeof enabled !== "boolean") {
        return { success: false, error: "Invalid Ignore Pop Ups value." };
    }

    settings.ignorePopups = enabled;

    return saveSettings()
        ? { success: true }
        : { success: false, error: "Could not save Ignore Pop Ups setting." };
});

// =========================================
// EDITOR WORKSPACE IPC
// =========================================

ipcMain.handle("workspace:get-editor", () => loadEditorWorkspace());

ipcMain.handle("workspace:save-editor", (event, workspace) => {
    return saveEditorWorkspace(workspace);
});

// =========================================
// SAVED SCRIPTS IPC
// =========================================

ipcMain.handle("scripts:get", () => loadSavedScripts());

ipcMain.handle("scripts:save", (event, scripts) => {
    return saveSavedScripts(scripts);
});

// =========================================
// APPLICATION STARTUP
// =========================================

app.whenReady().then(() => {
    loadSettings();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
