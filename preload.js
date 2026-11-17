
"use strict";

const {
    contextBridge,
    ipcRenderer
} = require("electron");

// =========================================
// STARTUP ANIMATION PREFERENCE
// =========================================

let startupAnimationEnabled = true;

try {
    startupAnimationEnabled = ipcRenderer.sendSync(
        "settings:get-startup-animation"
    ) !== false;
} catch (error) {
    console.error(
        "[Elight] Could not read startup animation preference:",
        error
    );
}

if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.startupAnimation =
        startupAnimationEnabled ? "on" : "off";
}

// =========================================
// SECURE RENDERER BRIDGE
// =========================================

contextBridge.exposeInMainWorld("elight", {
    // Window controls
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),

    // Startup state
    startupAnimationEnabled,

    // Retrieve all saved settings
    getSettings: () => ipcRenderer.invoke("settings:get"),

    // Always on top
    setAlwaysOnTop: enabled =>
        ipcRenderer.invoke("settings:set-always-on-top", enabled),

    // Theme
    setTheme: theme =>
        ipcRenderer.invoke("settings:set-theme", theme),

    // Interface animations
    setAnimations: value =>
        ipcRenderer.invoke("settings:set-animations", value),

    // Console auto-scroll
    setAutoScroll: enabled =>
        ipcRenderer.invoke("settings:set-auto-scroll", enabled),

    // Startup animation
    setStartupAnimation: enabled =>
        ipcRenderer.invoke("settings:set-startup-animation", enabled),

    // Keybind preference
    setToggleShortcut: shortcut =>
        ipcRenderer.invoke("settings:set-toggle-shortcut", shortcut),

    // Space theme star speed (1–10)
    setStarSpeed: value =>
        ipcRenderer.invoke("settings:set-star-speed", value),

    // Ignore Pop Ups
    setIgnorePopups: enabled =>
        ipcRenderer.invoke("settings:set-ignore-popups", enabled),

    // =====================================
    // EDITOR WORKSPACE
    // =====================================

    getEditorWorkspace: () =>
        ipcRenderer.invoke("workspace:get-editor"),

    saveEditorWorkspace: workspace =>
        ipcRenderer.invoke("workspace:save-editor", workspace),

    // =====================================
    // SAVED SCRIPTS
    // =====================================

    getSavedScripts: () =>
        ipcRenderer.invoke("scripts:get"),

    saveSavedScripts: scripts =>
        ipcRenderer.invoke("scripts:save", scripts)
});

console.log("[Elight] Preload script loaded successfully.");
