// State Management
let state = {
    directoryHandle: null,
    files: [],
    plan: null,
    isScanning: false,
    isPlanning: false,
    isExecuting: false
};

// UI Elements
const scanBtn = document.getElementById('scan-btn');
const planBtn = document.getElementById('plan-btn');
const executeBtn = document.getElementById('execute-btn');
const templateSelector = document.getElementById('framework-template');
const targetDirInput = document.getElementById('target-dir-input');
const browseBtn = document.getElementById('browse-btn');
const currentFilesList = document.getElementById('current-files');
const proposedPlanList = document.getElementById('proposed-plan');
const logsContainer = document.getElementById('logs');
const totalFilesSpan = document.getElementById('total-files');
const targetDirSpan = document.getElementById('target-dir-name');

// API Base URL
const API_BASE = '/api';

// Initialize
async function init() {
    log('System initialized.', 'system');
    if (!window.isSecureContext) {
        log('WARNING: Not running in a secure context. File System Access API will be disabled.', 'error');
    }
    await fetchConfig();
}

// Logging Utility
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span style="opacity: 0.5">[${time}]</span> > ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearLogs() {
    logsContainer.innerHTML = '<div class="log-entry system">> Logs cleared.</div>';
}

// Notifications
function notify(message, type = 'info') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    
    notification.innerHTML = `
        <i data-lucide="${icon}" style="color: var(--${type === 'info' ? 'primary' : type})"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    lucide.createIcons();
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// API Calls
async function fetchConfig() {
    // In browser mode, we don't fetch server config for the directory
    log('Running in Browser Mode (File System Access API)', 'system');
}

async function browseForDirectory() {
    if (!window.showDirectoryPicker) {
        const msg = "Your browser does not support the File System Access API. Please use a Chromium-based browser (Chrome, Edge).";
        log(msg, 'error');
        alert(msg);
        return;
    }

    try {
        log('Opening folder picker...', 'system');
        state.directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        
        targetDirInput.value = state.directoryHandle.name;
        targetDirSpan.textContent = state.directoryHandle.name;
        
        log(`Selected directory: ${state.directoryHandle.name}`, 'success');
        notify(`Attached to ${state.directoryHandle.name}`, 'success');
        
        await scanFiles();
    } catch (error) {
        if (error.name === 'AbortError') {
            log('Folder selection cancelled.', 'info');
        } else {
            log(`Failed to open browser: ${error.message}`, 'error');
            notify(error.message, 'error');
        }
    }
}

async function scanFiles() {
    if (!state.directoryHandle) {
        log('Please click "Browse" to select a folder first.', 'info');
        notify('No directory selected', 'info');
        return;
    }
    
    state.isScanning = true;
    scanBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Scanning...';
    lucide.createIcons();
    log('Scanning directory recursively...', 'info');

    try {
        state.files = [];
        await recursiveScan(state.directoryHandle, '');
        
        totalFilesSpan.textContent = state.files.length;
        renderFileList();
        
        planBtn.disabled = state.files.length === 0;
        log(`Found ${state.files.length} files.`, 'success');
        notify('Directory scan complete', 'success');
    } catch (error) {
        log(`Scan failed: ${error.message}`, 'error');
        notify(error.message, 'error');
    } finally {
        state.isScanning = false;
        scanBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Scan Directory';
        lucide.createIcons();
    }
}

async function recursiveScan(directoryHandle, path) {
    const ignorePatterns = ['.git', 'node_modules', 'venv', '__pycache__', '.gemini', 'dist', 'build'];
    
    for await (const entry of directoryHandle.values()) {
        if (ignorePatterns.includes(entry.name)) continue;
        
        const relPath = path ? `${path}/${entry.name}` : entry.name;
        
        if (entry.kind === 'file') {
            state.files.push(relPath);
        } else if (entry.kind === 'directory') {
            await recursiveScan(entry, relPath);
        }
    }
}

async function generatePlan() {
    if (state.isPlanning) return;
    if (!state.files.length) return;
    
    const selectedTemplate = templateSelector.value;
    state.isPlanning = true;
    planBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Consulting Gemini...';
    lucide.createIcons();
    log(`Generating ${selectedTemplate} reorganization plan...`, 'system');

    try {
        // We now send the file list directly since the server can't see our browser-managed files
        const response = await fetch(`${API_BASE}/plan`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                template: selectedTemplate,
                files: state.files 
            })
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        state.plan = data.plan;
        renderPlan();
        
        executeBtn.disabled = false;
        log('Plan generated successfully.', 'success');
        notify('AI Plan ready for review', 'success');
    } catch (error) {
        log(`Planning failed: ${error.message}`, 'error');
        notify(error.message, 'error');
    } finally {
        state.isPlanning = false;
        planBtn.innerHTML = '<i data-lucide="brain-circuit"></i> Generate AI Plan';
        lucide.createIcons();
    }
}

async function executePlan() {
    if (state.isExecuting || !state.plan || !state.directoryHandle) return;
    
    const fileCount = Object.keys(state.plan).length;
    const confirmMsg = `CRITICAL: You are about to MOVE ${fileCount} files in your codebase. This action is direct and uses the browser's File System Access API. \n\nProceed?`;
    
    if (!confirm(confirmMsg)) return;

    state.isExecuting = true;
    executeBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Executing...';
    lucide.createIcons();
    log(`Executing reorganization in browser...`, 'system');

    try {
        for (const [oldPath, newPath] of Object.entries(state.plan)) {
            if (oldPath === newPath) continue;
            
            log(`Moving: ${oldPath} -> ${newPath}`, 'info');
            await moveFileInBrowser(oldPath, newPath);
        }
        
        log('Plan executed successfully', 'success');
        notify('Reorganization complete', 'success');
        
        // Refresh file list after execution
        await scanFiles();
        state.plan = null;
        proposedPlanList.innerHTML = '<div class="empty-state">Reorganization complete. Scan again to see changes.</div>';
        executeBtn.disabled = true;
    } catch (error) {
        log(`Execution failed: ${error.message}`, 'error');
        notify(error.message, 'error');
    } finally {
        state.isExecuting = false;
        executeBtn.innerHTML = '<i data-lucide="play"></i> Execute Plan';
        lucide.createIcons();
    }
}

async function moveFileInBrowser(oldPath, newPath) {
    // Get source file
    const oldParts = oldPath.split(/[/\\]/);
    const fileName = oldParts.pop();
    let currentHandle = state.directoryHandle;
    
    // Navigate to source folder
    for (const part of oldParts) {
        if (part) currentHandle = await currentHandle.getDirectoryHandle(part);
    }
    const fileHandle = await currentHandle.getFileHandle(fileName);

    // Get/Create target folder
    const newParts = newPath.split(/[/\\]/);
    const newFileName = newParts.pop();
    let targetDirHandle = state.directoryHandle;
    for (const part of newParts) {
        if (part) targetDirHandle = await targetDirHandle.getDirectoryHandle(part, { create: true });
    }

    // Move the file
    // Note: 'move' is currently supported in Chrome/Edge for FileSystemHandle
    if (fileHandle.move) {
        await fileHandle.move(targetDirHandle, newFileName);
    } else {
        // Fallback for older implementations: copy and delete
        const newFileHandle = await targetDirHandle.getFileHandle(newFileName, { create: true });
        const writable = await newFileHandle.createWritable();
        const file = await fileHandle.getFile();
        await writable.write(file);
        await writable.close();
        await currentHandle.removeEntry(fileName);
    }
}

// Rendering
function renderFileList() {
    if (state.files.length === 0) {
        currentFilesList.innerHTML = '<div class="empty-state">No files found.</div>';
        return;
    }
    
    currentFilesList.innerHTML = state.files.map(file => `
        <div class="file-item">
            <i data-lucide="file" class="file-icon"></i>
            <span>${file}</span>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderPlan() {
    if (!state.plan) return;
    
    const planEntries = Object.entries(state.plan);
    proposedPlanList.innerHTML = planEntries.map(([oldPath, newPath]) => {
        if (oldPath === newPath) return '';
        return `
            <div class="plan-item">
                <div class="plan-path-old">${oldPath}</div>
                <div class="plan-arrow"><i data-lucide="chevron-down"></i></div>
                <div class="plan-path-new">${newPath}</div>
            </div>
        `;
    }).join('');
    
    if (proposedPlanList.innerHTML === '') {
        proposedPlanList.innerHTML = '<div class="empty-state">No changes needed! Codebase is already optimized.</div>';
    }
    
    lucide.createIcons();
}

// Event Listeners
browseBtn.addEventListener('click', browseForDirectory);
scanBtn.addEventListener('click', scanFiles);
planBtn.addEventListener('click', generatePlan);
executeBtn.addEventListener('click', executePlan);

// Add CSS for spin animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(style);

// Start
init();
