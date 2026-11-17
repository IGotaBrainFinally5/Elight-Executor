
"use strict";

// =========================================
// ELIGHT ELEMENT HELPERS
// =========================================

const get = (id) => document.getElementById(id);

function requireElement(id) {
    const element = get(id);

    if (!element) {
        throw new Error(`[Elight] Missing HTML element: ${id}`);
    }

    return element;
}

// =========================================
// ELIGHT UI STATE
// =========================================

let attached = false;
let logPaused = false;
let autoScroll = true;
let activeTab = 0;
let nextTabId = 2;
let consoleExpanded = false;

let isRecordingKeybind = false;
let currentToggleShortcut = "RightCtrl";
let alwaysOnTop = false;

let tabs = [
    { id: 1, name: "Script 1", content: "" }
];

const savedScripts = [];

// Editor workspace persistence
let workspaceSaveTimer = null;
let workspaceSaveQueue = Promise.resolve();

const WORKSPACE_SAVE_DELAY = 250;

// =========================================
// ACTIVITY AND OUTPUT
// =========================================

function addActivity(message) {
    const activity = get("recent-activity");
    if (!activity) return;

    const placeholder = activity.querySelector("p");

    if (placeholder && placeholder.textContent === "No recent activity yet.") {
        placeholder.remove();
    }

    const entry = document.createElement("p");
    entry.textContent = message;
    entry.style.marginBottom = "8px";

    activity.prepend(entry);
}

function writeOutput(message) {
    const output = get("execution-output");
    if (!output) return;

    const entry = document.createElement("p");
    entry.textContent = message;

    output.appendChild(entry);
    output.scrollTop = output.scrollHeight;
}

function writeConsole(message, level = "INFO") {
    if (logPaused) return;

    const output = get("console-output");
    const integrated = get("integrated-console-output");

    const time = new Date().toLocaleTimeString();
    const formattedMessage = `[${time}] [${level}] ${message}`;

    if (output) {
        const entry = document.createElement("p");
        entry.textContent = formattedMessage;

        if (level === "ERROR") {
            entry.style.color = "#ed6676";
        } else if (level === "WARNING") {
            entry.style.color = "#eab45b";
        }

        output.appendChild(entry);

        if (autoScroll) {
            output.scrollTop = output.scrollHeight;
        }
    }

    if (integrated) {
        const copy = document.createElement("p");
        copy.textContent = formattedMessage;

        integrated.appendChild(copy);
        integrated.scrollTop = integrated.scrollHeight;
    }
}

// =========================================
// PAGE NAVIGATION
// =========================================

function navigateTo(pageName) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.remove("active");
    });

    const page = get(`page-${pageName}`);

    if (page) {
        page.classList.add("active");
    }

    const navButton = document.querySelector(
        `.nav-item[data-page="${pageName}"]`
    );

    if (navButton) {
        navButton.classList.add("active");
    }
}

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.page);
    });
});

document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.goto);
    });
});

// =========================================
// WINDOW CONTROLS
// =========================================

get("minimize-btn")?.addEventListener("click", () => {
    window.elight?.minimize();
});

get("maximize-btn")?.addEventListener("click", () => {
    window.elight?.maximize();
});

get("close-btn")?.addEventListener("click", () => {
    window.elight?.close();
});

// =========================================
// SETTINGS TAB NAVIGATION
// =========================================

function switchSettingsTab(tabName) {
    document.querySelectorAll("[data-settings-tab]").forEach(button => {
        const isActive = button.dataset.settingsTab === tabName;

        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".settings-tab-panel").forEach(panel => {
        const isActive = panel.id === `settings-tab-${tabName}`;

        panel.hidden = !isActive;
        panel.classList.toggle("active", isActive);
    });
}

document.querySelectorAll("[data-settings-tab]").forEach(button => {
    button.addEventListener("click", () => {
        switchSettingsTab(button.dataset.settingsTab);
    });
});

// =========================================
// SETTINGS - ALWAYS ON TOP
// =========================================

async function updateAlwaysOnTop(enabled) {
    const setting = get("always-on-top-setting");

    try {
        if (typeof window.elight?.setAlwaysOnTop !== "function") {
            throw new Error("Electron settings bridge is not connected.");
        }

        const result = await window.elight.setAlwaysOnTop(enabled);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not update window setting.");
        }

        alwaysOnTop = enabled;

        if (setting) {
            setting.checked = enabled;
        }

        writeConsole(
            `Always stay on top ${enabled ? "enabled" : "disabled"}.`
        );

        addActivity(
            `Always stay on top ${enabled ? "enabled" : "disabled"}.`
        );
    } catch (error) {
        if (setting) {
            setting.checked = alwaysOnTop;
        }

        writeConsole(
            `Could not update Always stay on top: ${error.message}`,
            "ERROR"
        );
    }
}

get("always-on-top-setting")?.addEventListener("change", event => {
    updateAlwaysOnTop(event.target.checked);
});

// =========================================
// SETTINGS - KEYBINDS
// =========================================

function formatShortcut(shortcut) {
    if (shortcut === "RightCtrl") return "Right Ctrl";
    if (shortcut === "LeftCtrl") return "Left Ctrl";
    if (shortcut === "RightShift") return "Right Shift";
    if (shortcut === "LeftShift") return "Left Shift";
    if (shortcut === "RightAlt") return "Right Alt";
    if (shortcut === "LeftAlt") return "Left Alt";

    return shortcut
        .replaceAll("Control", "Ctrl")
        .replaceAll("Command", "Win")
        .replaceAll("Arrow", "");
}

function setKeybindStatus(message) {
    const status = get("keybind-status");

    if (status) {
        status.textContent = message;
    }
}

function setKeybindButtonText(shortcut) {
    const button = get("toggle-interface-keybind");

    if (button) {
        button.textContent = formatShortcut(shortcut);
    }
}

function startKeybindRecording() {
    if (isRecordingKeybind) {
        cancelKeybindRecording();
        return;
    }

    isRecordingKeybind = true;

    const button = get("toggle-interface-keybind");

    if (button) {
        button.classList.add("recording");
        button.textContent = "Press a key...";
    }

    setKeybindStatus("Listening for a key. Press Escape to cancel.");
}

function cancelKeybindRecording() {
    isRecordingKeybind = false;

    const button = get("toggle-interface-keybind");

    if (button) {
        button.classList.remove("recording");
    }

    setKeybindButtonText(currentToggleShortcut);

    setKeybindStatus(
        `Current shortcut: ${formatShortcut(currentToggleShortcut)}`
    );
}

function getKeyName(event) {
    if (event.code === "ControlRight") return "RightCtrl";
    if (event.code === "ControlLeft") return "LeftCtrl";

    if (event.code === "ShiftRight") return "RightShift";
    if (event.code === "ShiftLeft") return "LeftShift";

    if (event.code === "AltRight") return "RightAlt";
    if (event.code === "AltLeft") return "LeftAlt";

    if (event.code === "MetaRight") return "RightMeta";
    if (event.code === "MetaLeft") return "LeftMeta";

    if (/^Key[A-Z]$/.test(event.code)) {
        return event.code.slice(3);
    }

    if (/^Digit[0-9]$/.test(event.code)) {
        return event.code.slice(5);
    }

    if (/^F([1-9]|1[0-2])$/.test(event.key)) {
        return event.key;
    }

    const keyMap = {
        Space: "Space",
        Enter: "Enter",
        Tab: "Tab",
        Backspace: "Backspace",
        Delete: "Delete",
        Insert: "Insert",
        Home: "Home",
        End: "End",
        PageUp: "PageUp",
        PageDown: "PageDown",
        ArrowUp: "Up",
        ArrowDown: "Down",
        ArrowLeft: "Left",
        ArrowRight: "Right"
    };

    return keyMap[event.code] || null;
}

function getShortcutFromEvent(event) {
    if (
        event.code === "ControlRight" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
    ) {
        return "RightCtrl";
    }

    if (
        event.code === "ControlLeft" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
    ) {
        return "LeftCtrl";
    }

    if (
        event.key === "Control" ||
        event.key === "Shift" ||
        event.key === "Alt" ||
        event.key === "Meta"
    ) {
        return null;
    }

    const key = getKeyName(event);

    if (!key) return null;

    const modifiers = [];

    if (event.ctrlKey) modifiers.push("Control");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Command");

    return [...modifiers, key].join("+");
}

async function saveToggleShortcut(shortcut) {
    try {
        if (typeof window.elight?.setToggleShortcut !== "function") {
            throw new Error("Electron shortcut settings are not connected.");
        }

        const result = await window.elight.setToggleShortcut(shortcut);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not save shortcut.");
        }

        currentToggleShortcut = shortcut;

        setKeybindButtonText(shortcut);

        setKeybindStatus(
            `Saved preference: ${formatShortcut(shortcut)}`
        );

        writeConsole(
            `Interface shortcut preference saved: ${formatShortcut(shortcut)}.`
        );

        addActivity(
            `Interface shortcut preference saved: ${formatShortcut(shortcut)}.`
        );

        return true;
    } catch (error) {
        setKeybindStatus(`Could not save shortcut: ${error.message}`);

        writeConsole(
            `Could not save shortcut preference: ${error.message}`,
            "ERROR"
        );

        setKeybindButtonText(currentToggleShortcut);

        return false;
    }
}

get("toggle-interface-keybind")?.addEventListener("click", () => {
    startKeybindRecording();
});

document.addEventListener("keydown", async event => {
    if (!isRecordingKeybind) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
        cancelKeybindRecording();
        return;
    }

    const shortcut = getShortcutFromEvent(event);

    if (!shortcut) return;

    isRecordingKeybind = false;

    const button = get("toggle-interface-keybind");

    if (button) {
        button.classList.remove("recording");
        button.textContent = "Saving...";
    }

    const saved = await saveToggleShortcut(shortcut);

    if (!saved) {
        setKeybindButtonText(currentToggleShortcut);
    }
}, true);

// =========================================
// EDITOR KEYBOARD SHORTCUTS
// =========================================

function handleEditorShortcut(event) {
    // Do not interfere with the keybind recording interface.
    if (isRecordingKeybind) return;

    // Prevent browser/Electron defaults such as opening a new window
    // or closing the current window.
    const modifierPressed = event.ctrlKey || event.metaKey;

    if (!modifierPressed || event.altKey || event.repeat) {
        return;
    }

    const key = event.key.toLowerCase();

    if (key === "t") {
        event.preventDefault();
        event.stopPropagation();

        createTab();

        navigateTo("editor");

        get("script-editor")?.focus();

        return;
    }

    if (key === "w") {
        event.preventDefault();
        event.stopPropagation();

        closeActiveTab();

        return;
    }

    if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        event.stopPropagation();

        const requestedNumber = Number(key);

        if (requestedNumber === 9) {
            switchToTab(tabs.length - 1);
        } else {
            switchToTab(requestedNumber - 1);
        }
    }
}

document.addEventListener("keydown", handleEditorShortcut);

// =========================================
// SETTINGS - AUTO EXECUTE
// =========================================

// Auto Execute intentionally remains disabled.
// It is not connected to a local runtime.

const autoExecuteSetting = get("auto-execute-setting");

if (autoExecuteSetting) {
    autoExecuteSetting.checked = false;
    autoExecuteSetting.disabled = true;
}

// =========================================
// SETTINGS - APPLY THEME
// =========================================

const validThemes = ["dark", "midnight", "light", "space"];

async function applyTheme(theme) {
    if (!validThemes.includes(theme)) {
        writeConsole("That theme is not supported.", "ERROR");
        return;
    }

    const button = get("apply-theme-btn");

    try {
        if (typeof window.elight?.setTheme !== "function") {
            throw new Error("Theme settings bridge is not connected.");
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Applying...";
        }

        const result = await window.elight.setTheme(theme);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not save theme.");
        }

        document.body.dataset.theme = theme;

        const selector = get("theme-setting");

        if (selector) {
            selector.value = theme;
        }

        writeConsole(`Theme applied: ${theme}.`);
        addActivity(`Theme changed to ${theme}.`);
    } catch (error) {
        writeConsole(`Could not apply theme: ${error.message}`, "ERROR");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Apply Theme";
        }
    }
}

get("apply-theme-btn")?.addEventListener("click", () => {
    const selectedTheme = get("theme-setting")?.value || "dark";
    applyTheme(selectedTheme);
});

// Selecting a theme does not apply it.
// The Apply Theme button performs the actual change.

// =========================================
// SETTINGS - ANIMATIONS
// =========================================

async function updateAnimationPreference(value) {
    if (!["minimal", "off"].includes(value)) return;

    const selector = get("animation-setting");

    try {
        const result = await window.elight?.setAnimations(value);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not save animation setting.");
        }

        document.body.dataset.animations = value;

        writeConsole(`Interface animations set to ${value}.`);
    } catch (error) {
        writeConsole(
            `Could not save animation preference: ${error.message}`,
            "ERROR"
        );

        if (selector) {
            selector.value = document.body.dataset.animations || "minimal";
        }
    }
}

get("animation-setting")?.addEventListener("change", event => {
    updateAnimationPreference(event.target.value);
});

// =========================================
// SETTINGS - STARTUP ANIMATION
// =========================================

async function updateStartupAnimation(enabled) {
    const checkbox = get("startup-animation-setting");

    try {
        const result = await window.elight?.setStartupAnimation(enabled);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not save startup animation setting.");
        }

        writeConsole(
            `Startup animation ${enabled ? "enabled" : "disabled"} for the next launch.`
        );

        addActivity(
            `Startup animation ${enabled ? "enabled" : "disabled"}.`
        );
    } catch (error) {
        writeConsole(
            `Could not save startup animation preference: ${error.message}`,
            "ERROR"
        );

        if (checkbox) {
            checkbox.checked = !enabled;
        }
    }
}

get("startup-animation-setting")?.addEventListener("change", event => {
    updateStartupAnimation(event.target.checked);
});

// =========================================
// SETTINGS - CONSOLE AUTO-SCROLL
// =========================================

async function updateAutoScroll(enabled) {
    const consoleCheckbox = get("auto-scroll");
    const settingsCheckbox = get("settings-auto-scroll");

    autoScroll = enabled;

    if (consoleCheckbox) {
        consoleCheckbox.checked = enabled;
    }

    if (settingsCheckbox) {
        settingsCheckbox.checked = enabled;
    }

    try {
        const result = await window.elight?.setAutoScroll(enabled);

        if (!result || result.success !== true) {
            throw new Error(result?.error || "Could not save auto-scroll setting.");
        }

        writeConsole(
            `Console auto-scroll ${enabled ? "enabled" : "disabled"}.`
        );
    } catch (error) {
        writeConsole(
            `Could not save auto-scroll setting: ${error.message}`,
            "ERROR"
        );
    }
}

get("auto-scroll")?.addEventListener("change", event => {
    updateAutoScroll(event.target.checked);
});

get("settings-auto-scroll")?.addEventListener("change", event => {
    updateAutoScroll(event.target.checked);
});

// =========================================
// SETTINGS - LOAD SAVED VALUES
// =========================================

async function loadSettings() {
    try {
        if (typeof window.elight?.getSettings !== "function") {
            setKeybindButtonText(currentToggleShortcut);
            setKeybindStatus(
                `Current shortcut: ${formatShortcut(currentToggleShortcut)}`
            );
            return;
        }

        const settings = await window.elight.getSettings();

        if (!settings) return;

        // Always on top
        if (typeof settings.alwaysOnTop === "boolean") {
            alwaysOnTop = settings.alwaysOnTop;

            const setting = get("always-on-top-setting");

            if (setting) {
                setting.checked = alwaysOnTop;
            }
        }

        // Theme
        if (validThemes.includes(settings.theme)) {
            document.body.dataset.theme = settings.theme;

            const selector = get("theme-setting");

            if (selector) {
                selector.value = settings.theme;
            }
        } else {
            document.body.dataset.theme = "dark";
        }

        // Interface animations
        if (["minimal", "off"].includes(settings.animations)) {
            document.body.dataset.animations = settings.animations;

            const selector = get("animation-setting");

            if (selector) {
                selector.value = settings.animations;
            }
        } else {
            document.body.dataset.animations = "minimal";
        }

        // Console auto-scroll
        if (typeof settings.autoScroll === "boolean") {
            autoScroll = settings.autoScroll;

            const consoleCheckbox = get("auto-scroll");
            const settingsCheckbox = get("settings-auto-scroll");

            if (consoleCheckbox) {
                consoleCheckbox.checked = autoScroll;
            }

            if (settingsCheckbox) {
                settingsCheckbox.checked = autoScroll;
            }
        }

        // Startup animation preference
        if (typeof settings.startupAnimation === "boolean") {
            const checkbox = get("startup-animation-setting");

            if (checkbox) {
                checkbox.checked = settings.startupAnimation;
            }
        }

        // Keybind preference
        if (typeof settings.toggleShortcut === "string") {
            currentToggleShortcut = settings.toggleShortcut;
        }

        setKeybindButtonText(currentToggleShortcut);

        setKeybindStatus(
            `Current shortcut: ${formatShortcut(currentToggleShortcut)}`
        );
    } catch (error) {
        writeConsole(
            `Could not load settings: ${error.message}`,
            "WARNING"
        );
    }
}

// =========================================
// EDITOR WORKSPACE PERSISTENCE
// =========================================

async function loadEditorWorkspace() {
    try {
        if (typeof window.elight?.getEditorWorkspace !== "function") {
            writeConsole(
                "Editor workspace storage is not connected. Using a fresh workspace.",
                "WARNING"
            );
            return;
        }

        const workspace = await window.elight.getEditorWorkspace();

        if (
            !workspace ||
            !Array.isArray(workspace.tabs) ||
            workspace.tabs.length === 0
        ) {
            return;
        }

        tabs = workspace.tabs.map(tab => ({
            id: tab.id,
            name: tab.name,
            content: tab.content
        }));

        const requestedActiveTab = Number.isInteger(workspace.activeTab)
            ? workspace.activeTab
            : 0;

        activeTab = Math.max(
            0,
            Math.min(requestedActiveTab, tabs.length - 1)
        );

        nextTabId = Math.max(
            1,
            ...tabs.map(tab => tab.id + 1)
        );

        writeConsole(`Restored ${tabs.length} editor tab(s).`);
    } catch (error) {
        writeConsole(
            `Could not restore editor workspace: ${error.message}`,
            "WARNING"
        );
    }
}

function persistEditorWorkspace() {
    if (typeof window.elight?.saveEditorWorkspace !== "function") {
        return Promise.resolve();
    }

    const workspaceSnapshot = {
        tabs: tabs.map(tab => ({
            id: tab.id,
            name: tab.name,
            content: tab.content
        })),
        activeTab
    };

    workspaceSaveQueue = workspaceSaveQueue
        .catch(() => {})
        .then(async () => {
            const result = await window.elight.saveEditorWorkspace(
                workspaceSnapshot
            );

            if (!result || result.success !== true) {
                throw new Error(
                    result?.error || "Could not save editor workspace."
                );
            }
        })
        .catch(error => {
            writeConsole(
                `Could not save editor workspace: ${error.message}`,
                "ERROR"
            );
        });

    return workspaceSaveQueue;
}

function scheduleEditorWorkspaceSave() {
    if (workspaceSaveTimer) {
        clearTimeout(workspaceSaveTimer);
    }

    workspaceSaveTimer = setTimeout(() => {
        workspaceSaveTimer = null;
        persistEditorWorkspace();
    }, WORKSPACE_SAVE_DELAY);
}

function saveActiveTab() {
    const editor = get("script-editor");

    if (editor && tabs[activeTab]) {
        tabs[activeTab].content = editor.value;
    }
}

// =========================================
// EDITOR TABS
// =========================================

function renderTabs() {
    const container = get("editor-tabs");
    if (!container) return;

    container.innerHTML = "";

    tabs.forEach((tab, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "editor-tab";
        button.textContent = tab.name;

        if (index === activeTab) {
            button.classList.add("active");
            button.setAttribute("aria-current", "page");
        }

        button.addEventListener("click", () => {
            switchToTab(index);
        });

        container.appendChild(button);
    });

    const addButton = document.createElement("button");

    addButton.type = "button";
    addButton.className = "new-tab-btn";
    addButton.textContent = "+";
    addButton.title = "Create a new tab (Ctrl+T)";
    addButton.setAttribute("aria-label", "Create a new tab");

    addButton.addEventListener("click", createTab);

    container.appendChild(addButton);
}

function loadActiveTab() {
    const editor = get("script-editor");

    if (editor && tabs[activeTab]) {
        editor.value = tabs[activeTab].content;
    }
}

function switchToTab(index) {
    if (!Number.isInteger(index) || index < 0 || index >= tabs.length) {
        return;
    }

    if (index === activeTab) {
        navigateTo("editor");
        return;
    }

    saveActiveTab();

    activeTab = index;

    renderTabs();
    loadActiveTab();

    scheduleEditorWorkspaceSave();

    navigateTo("editor");

    writeConsole(`Switched to ${tabs[activeTab].name}.`);
}

function createTab() {
    saveActiveTab();

    const newTab = {
        id: nextTabId,
        name: `Script ${nextTabId}`,
        content: ""
    };

    nextTabId++;

    tabs.push(newTab);
    activeTab = tabs.length - 1;

    renderTabs();
    loadActiveTab();

    scheduleEditorWorkspaceSave();

    writeConsole(`Created ${newTab.name}.`);
    addActivity(`Created editor tab: ${newTab.name}.`);
}

function closeActiveTab() {
    if (tabs.length === 0) return;

    saveActiveTab();

    const closingTab = tabs[activeTab];

    // Keep at least one tab open.
    // If the final tab is closed, clear it instead of removing it.
    if (tabs.length === 1) {
        tabs[0].content = "";
        tabs[0].name = "Script 1";
        activeTab = 0;
        nextTabId = Math.max(nextTabId, 2);

        renderTabs();
        loadActiveTab();

        scheduleEditorWorkspaceSave();

        writeConsole("The last tab was cleared. One editor tab must remain open.");
        return;
    }

    tabs.splice(activeTab, 1);

    // Select the tab that moved into the removed tab's position.
    // If the removed tab was last, select the new last tab.
    activeTab = Math.min(activeTab, tabs.length - 1);

    renderTabs();
    loadActiveTab();

    scheduleEditorWorkspaceSave();

    writeConsole(`Closed ${closingTab.name}.`);
    addActivity(`Closed editor tab: ${closingTab.name}.`);
}

// Automatically save edits as the user types.
get("script-editor")?.addEventListener("input", () => {
    saveActiveTab();
    scheduleEditorWorkspaceSave();
});

// =========================================
// ATTACH - LOCAL DEVELOPMENT SESSION
// =========================================

function attachRuntime() {
    writeConsole("Connecting to Elight local test session...");

    // UI placeholder only.
    // A separate local runtime connection is not configured here.

    attached = true;

    const homeStatus = get("home-runtime-status");
    const outputStatus = get("output-status");

    if (homeStatus) {
        homeStatus.textContent = "Ready";
    }

    if (outputStatus) {
        outputStatus.textContent = "Connected";
    }

    writeConsole("Local test session initialized successfully.");
    addActivity("Connected to local test session.");
}

get("attach-btn")?.addEventListener("click", attachRuntime);
get("console-attach-btn")?.addEventListener("click", attachRuntime);

// =========================================
// EXECUTE - SAFE LOCAL TEST PLACEHOLDER
// =========================================

function executeLocalTest() {
    if (!attached) {
        writeOutput("Please Attach to the local test session first.");
        writeConsole("Execution blocked: no local test session.", "WARNING");
        return;
    }

    const editor = get("script-editor");
    const code = editor ? editor.value.trim() : "";

    if (!code) {
        writeOutput("Editor is empty.");
        return;
    }

    writeOutput("Local test request received.");
    writeOutput(`Script length: ${code.length} characters.`);
    writeOutput("A local test runner has not been connected yet.");

    writeConsole("Local test request received.");
    addActivity("Submitted a local test request.");
}

get("execute-btn")?.addEventListener("click", executeLocalTest);

get("run-test-btn")?.addEventListener("click", () => {
    navigateTo("editor");
    executeLocalTest();
});

// =========================================
// EDITOR UTILITIES
// =========================================

get("clear-btn")?.addEventListener("click", () => {
    const editor = get("script-editor");

    if (editor) {
        editor.value = "";
    }

    if (tabs[activeTab]) {
        tabs[activeTab].content = "";
        scheduleEditorWorkspaceSave();
    }

    writeConsole("Editor cleared.");
});

get("copy-btn")?.addEventListener("click", async () => {
    try {
        const editor = get("script-editor");

        await navigator.clipboard.writeText(
            editor ? editor.value : ""
        );

        writeConsole("Editor contents copied.");
    } catch (error) {
        writeConsole("Could not copy editor contents.", "ERROR");
    }
});

// =========================================
// CONSOLE UTILITIES
// =========================================

get("console-clear-btn")?.addEventListener("click", () => {
    const output = get("console-output");

    if (output) {
        output.innerHTML = "";
    }

    writeConsole("Console cleared.");
});

get("copy-logs-btn")?.addEventListener("click", async () => {
    try {
        const output = get("console-output");
        const logs = output ? output.innerText : "";

        await navigator.clipboard.writeText(logs);

        writeConsole("Console logs copied.");
    } catch (error) {
        writeConsole("Could not copy console logs.", "ERROR");
    }
});

get("pause-logs")?.addEventListener("change", event => {
    logPaused = event.target.checked;

    if (!logPaused) {
        writeConsole("Log capture resumed.");
    }
});

// =========================================
// INTEGRATED CONSOLE
// =========================================

get("toggle-console-btn")?.addEventListener("click", () => {
    consoleExpanded = !consoleExpanded;

    const output = get("integrated-console-output");
    const button = get("toggle-console-btn");

    if (output) {
        output.style.maxHeight = consoleExpanded ? "280px" : "130px";
    }

    if (button) {
        button.textContent = consoleExpanded ? "Collapse" : "Expand";
    }
});

// =========================================
// SAVED SCRIPTS
// =========================================

function renderSavedScripts(search = "") {
    const container = get("scripts-list");
    if (!container) return;

    container.innerHTML = "";

    const filtered = savedScripts.filter(script =>
        script.name.toLowerCase().includes(search.toLowerCase())
    );

    if (filtered.length === 0) {
        const empty = document.createElement("div");

        empty.className = "empty-state";

        const title = document.createElement("h2");
        title.textContent = "No saved scripts yet";

        const description = document.createElement("p");
        description.textContent = "Create a script to get started.";

        empty.append(title, description);
        container.appendChild(empty);

        return;
    }

    filtered.forEach(script => {
        const item = document.createElement("div");
        item.className = "dashboard-card";
        item.style.marginBottom = "10px";

        const title = document.createElement("h2");
        title.textContent = script.name;

        const open = document.createElement("button");
        open.type = "button";
        open.className = "secondary-btn";
        open.textContent = "Open";

        open.addEventListener("click", () => {
            saveActiveTab();

            navigateTo("editor");

            if (tabs[activeTab]) {
                tabs[activeTab].content = script.content;
            }

            loadActiveTab();
            scheduleEditorWorkspaceSave();
        });

        item.append(title, open);
        container.appendChild(item);
    });
}

get("new-script-btn")?.addEventListener("click", () => {
    const name = prompt("Enter a name for your script:");

    if (!name || !name.trim()) return;

    saveActiveTab();

    savedScripts.push({
        name: name.trim(),
        content: get("script-editor")?.value || ""
    });

    renderSavedScripts();
    writeConsole(`Created saved script: ${name.trim()}`);
});

get("script-search")?.addEventListener("input", event => {
    renderSavedScripts(event.target.value);
});

// =========================================
// STARTUP
// =========================================

async function initializeElight() {
    // Restore the workspace before rendering the editor.
    await loadEditorWorkspace();

    renderTabs();
    loadActiveTab();
    renderSavedScripts();

    navigateTo("home");
    switchSettingsTab("quality-of-life");

    await loadSettings();

    writeConsole("Elight interface initialized.");
    writeConsole("Waiting for local runtime integration.");

    addActivity("Elight workspace initialized.");

    console.log("[Elight] Renderer initialized successfully.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeElight);
} else {
    initializeElight();
}
