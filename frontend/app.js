/**
 * IMGCAPT - Main Application
 * Professional FLUX LoRA training dataset preparation
 */

import { ImageEditor } from './scripts/image-editor.js';
import { SSEClient } from './scripts/sse-client.js';

// Application state
const state = {
    selectedFolder: null,
    files: [],
    currentFile: null,
    processedFiles: new Set(),
    captions: new Map(),
    aspectRatio: '16:9',
    processedSets: [],
    currentProcessedSet: null,
    currentTab: 'input'
};

// Aspect ratio configurations
const aspectRatios = {
    '16:9': { width: 1067, height: 600 },
    '1:1': { width: 768, height: 768 }
};

// Module instances
let imageEditor = null;
let sseClient = null;

// DOM elements cache
const elements = {};

/**
 * Initialize DOM element references
 */
function initElements() {
    elements.fileList = document.getElementById('file-list');
    elements.processedList = document.getElementById('processed-list');
    elements.processedCount = document.getElementById('processed-count');
    elements.processedCanvas = document.getElementById('processed-canvas');
    elements.processedCaption = document.getElementById('processed-caption');
    elements.processedInfo = document.getElementById('processed-info');
    elements.currentFile = document.getElementById('current-file');
    elements.cropCanvas = document.getElementById('crop-canvas');
    elements.captionInput = document.getElementById('caption-input');
    elements.triggerInput = document.getElementById('trigger-input');
    elements.generateBtn = document.getElementById('generate-btn');
    elements.processBtn = document.getElementById('process-btn');
    elements.clearAllBtn = document.getElementById('clear-all-btn');
    elements.sseLog = document.getElementById('sse-log');
    elements.statusDot = document.getElementById('status-dot-1');
}

/**
 * Initialize image editor
 */
function initImageEditor() {
    const ctx = elements.cropCanvas.getContext('2d');
    const container = document.querySelector('.image-container');
    
    imageEditor = new ImageEditor(elements.cropCanvas, ctx);
    imageEditor.init(container);
    
    // Set initial dimensions
    const ratio = aspectRatios[state.aspectRatio];
    imageEditor.setCanvasDimensions(ratio.width, ratio.height, state.aspectRatio);
}

/**
 * Initialize SSE client
 */
function initSSE() {
    sseClient = new SSEClient();
    sseClient.init({
        logElement: elements.sseLog,
        statusDot: elements.statusDot
    });
    
    // Register event handlers
    sseClient.on('file.processed', handleFileProcessed);
    sseClient.on('process.progress', (data) => {
        console.log('Processing progress:', data.message);
    });
    sseClient.on('process.error', (data) => {
        console.error('Processing error:', data.error);
    });
    sseClient.on('processed.deleted', (data) => {
        // Remove from processed sets list
        state.processedSets = state.processedSets.filter(set => set.base_name !== data.base_name);
        
        // If current set was deleted, clear selection
        if (state.currentProcessedSet === data.base_name) {
            state.currentProcessedSet = null;
        }
        
        // Update UI if on processed tab
        if (state.currentTab === 'processed') {
            renderProcessedList();
            if (state.processedSets.length > 0 && !state.currentProcessedSet) {
                selectProcessedSet(state.processedSets[0].base_name);
            }
        } else {
            // Update count even if not on processed tab
            elements.processedCount.textContent = state.processedSets.length;
        }
        
        sseClient.log(`Processed set deleted: ${data.base_name}`);
    });
    
    // Import events
    sseClient.on('import.start', (data) => {
        document.getElementById('folder-info').textContent = 
            `Starting import from ${data.source_folder}...`;
    });
    
    sseClient.on('import.clearing', (data) => {
        document.getElementById('folder-info').textContent = data.message;
    });
    
    sseClient.on('import.found', (data) => {
        document.getElementById('folder-info').textContent = data.message;
    });
    
    sseClient.on('import.progress', (data) => {
        document.getElementById('folder-info').textContent = 
            `Importing: ${data.current}/${data.total} (${data.percent}%) - ${data.filename}`;
    });
    
    sseClient.on('import.complete', (data) => {
        document.getElementById('folder-info').textContent = data.message;
        if (data.skipped_count > 0) {
            document.getElementById('folder-info').textContent += 
                ` (${data.skipped_count} non-images skipped)`;
        }
    });
    
    sseClient.on('import.error', (data) => {
        document.getElementById('folder-info').textContent = 
            `Import failed: ${data.error}`;
    });
    
    // Caption generation events
    sseClient.on('caption.generate.start', (data) => {
        sseClient.log(`Starting caption generation for: ${data.filename}`);
    });
    
    sseClient.on('caption.generate.processing', (data) => {
        sseClient.log(`Processing ${data.filename} (${data.image_size}) - sending to Ollama...`);
    });
    
    sseClient.on('caption.generate.success', (data) => {
        sseClient.log(`✅ Caption generated for ${data.filename}: "${data.caption_preview}"`);
    });
    
    sseClient.on('caption.generate.error', (data) => {
        sseClient.log(`❌ Caption generation failed for ${data.filename}: ${data.error}`);
    });
}

/**
 * Import images from selected folder to raw folder
 */
async function importImages(folderPath, files) {
    try {
        // Update UI
        document.getElementById('folder-path').textContent = folderPath;
        document.getElementById('folder-info').textContent = `Uploading ${files.length} images...`;
        
        // Upload each file
        const formData = new FormData();
        formData.append('source_folder', folderPath);
        
        // Add all image files to FormData
        files.forEach((file, index) => {
            formData.append(`files`, file);
        });
        
        const response = await fetch('/api/import-upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to import images');
        }
        
        const result = await response.json();
        
        // Load the raw folder to show imported images
        await loadRawFolder();
        
    } catch (error) {
        console.error('Error importing images:', error);
        document.getElementById('folder-info').textContent = 'Import failed';
        sseClient.log(`Error importing images: ${error.message}`);
    }
}

/**
 * Load images from raw folder
 */
async function loadRawFolder() {
    try {
        const response = await fetch('/api/raw-images');
        
        if (!response.ok) {
            throw new Error('Failed to load raw images');
        }
        
        const data = await response.json();
        state.files = data.files;
        
        renderFileList();
        sseClient.log(`Loaded ${state.files.length} images from workspace`);
    } catch (error) {
        console.error('Error loading raw images:', error);
        sseClient.log(`Error loading raw images: ${error.message}`);
    }
}

/**
 * Load processed image sets
 */
async function loadProcessedSets() {
    try {
        const response = await fetch('/api/processed-images');
        
        if (!response.ok) {
            throw new Error('Failed to load processed images');
        }
        
        const data = await response.json();
        state.processedSets = data.sets;
        
        renderProcessedList();
        
        // Auto-select first set if none selected
        if (state.processedSets.length > 0 && !state.currentProcessedSet) {
            selectProcessedSet(state.processedSets[0].base_name);
        }
        
        // Update navigation button states
        updateNavigationButtons();
        
        sseClient.log(`Loaded ${data.count} processed sets`);
    } catch (error) {
        console.error('Error loading processed sets:', error);
        sseClient.log(`Error loading processed sets: ${error.message}`);
    }
}

/**
 * Render file list
 */
function renderFileList() {
    elements.fileList.innerHTML = '';
    
    // Update button states based on file availability
    const hasFiles = state.files.length > 0;
    elements.generateBtn.disabled = !hasFiles || !state.currentFile;
    elements.processBtn.disabled = !hasFiles || !state.currentFile;
    elements.clearAllBtn.disabled = !hasFiles;
    
    if (!hasFiles) {
        // Show empty state message
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-state';
        emptyMsg.textContent = 'No images in workspace. Click folder button to import.';
        elements.fileList.appendChild(emptyMsg);
        return;
    }
    
    state.files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        if (file === state.currentFile) {
            item.classList.add('active');
        }
        
        const processed = state.processedFiles.has(file);
        
        item.innerHTML = `
            <span class="file-name">${file}</span>
            <button class="delete-icon" data-filename="${file}" title="Delete file">
                <svg viewBox="0 0 24 24" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        // Click on file item to select (but not on delete icon)
        item.addEventListener('click', (e) => {
            // Don't select if clicking on delete icon or its children
            if (!e.target.closest('.delete-icon')) {
                selectFile(file);
            }
        });
        
        // Click on delete icon to delete
        item.querySelector('.delete-icon').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFile(file);
        });
        
        elements.fileList.appendChild(item);
    });
    
    // Auto-select first file if none selected
    if (!state.currentFile && state.files.length > 0) {
        selectFile(state.files[0]);
    }
}

/**
 * Render processed list (showing sets)
 */
function renderProcessedList() {
    elements.processedList.innerHTML = '';
    
    // Update processed count
    elements.processedCount.textContent = state.processedSets.length;
    
    if (state.processedSets.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-state';
        emptyMsg.textContent = 'No processed sets yet.';
        elements.processedList.appendChild(emptyMsg);
        return;
    }
    
    state.processedSets.forEach(set => {
        const listItem = document.createElement('div');
        listItem.className = 'processed-set-item';
        if (set.base_name === state.currentProcessedSet) {
            listItem.classList.add('active');
        }
        
        listItem.innerHTML = `
            <div class="processed-set-header">
                <div class="processed-set-name">${set.base_name}</div>
                <button class="delete-icon" data-basename="${set.base_name}" title="Delete processed set">
                    <svg viewBox="0 0 24 24" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
        
        // Click on delete icon to delete set
        listItem.querySelector('.delete-icon').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProcessedSet(set.base_name);
        });
        
        // Click to select set
        listItem.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-icon')) {
                selectProcessedSet(set.base_name);
            }
        });
        
        elements.processedList.appendChild(listItem);
    });
}

/**
 * Select and load a file
 */
async function selectFile(filename) {
    state.currentFile = filename;
    elements.currentFile.textContent = filename;
    
    // Load saved caption if exists
    const savedCaption = state.captions.get(filename) || '';
    elements.captionInput.value = savedCaption;
    
    // Enable buttons when file is selected
    elements.generateBtn.disabled = false;
    elements.processBtn.disabled = false;
    
    // Load image into editor
    const imagePath = `/api/raw-image/${encodeURIComponent(filename)}`;
    imageEditor.loadImage(imagePath);
    
    renderFileList();
}

/**
 * Generate caption for current image using vision model
 */
async function generateCaption() {
    if (!state.currentFile || !imageEditor) {
        alert('Please select an image first');
        return;
    }
    
    try {
        // Update button state
        elements.generateBtn.disabled = true;
        elements.generateBtn.textContent = 'GENERATING...';
        
        // Get canvas blob from editor
        const blob = await imageEditor.getCanvasBlob();
        
        const formData = new FormData();
        formData.append('file', blob, state.currentFile);
        
        const response = await fetch('/api/generate-caption', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Update the caption input with generated text
            elements.captionInput.value = result.caption;
            
            // Save to state
            state.captions.set(state.currentFile, result.caption);
            
            sseClient.log(`Generated caption for ${state.currentFile}`);
        } else {
            const error = await response.json();
            throw new Error(error.detail || 'Caption generation failed');
        }
        
    } catch (error) {
        console.error('Error generating caption:', error);
        
        if (error.message.includes('Ollama service unavailable')) {
            alert('Ollama is not running. Please start it with: ollama serve');
        } else {
            alert(`Caption generation failed: ${error.message}`);
        }
        
        sseClient.log(`Caption generation error: ${error.message}`);
    } finally {
        // Reset button state
        elements.generateBtn.disabled = false;
        elements.generateBtn.textContent = 'GENERATE CAPTION';
    }
}

/**
 * Process current image
 */
async function processImage() {
    if (!state.currentFile || !imageEditor) return;
    
    const caption = elements.captionInput.value.trim();
    const trigger = elements.triggerInput.value.trim();
    
    if (!caption) {
        alert('Please enter a caption');
        return;
    }
    
    try {
        // Get canvas blob from editor
        const blob = await imageEditor.getCanvasBlob();
        
        const formData = new FormData();
        formData.append('file', blob, state.currentFile);
        formData.append('original_filename', state.currentFile);
        formData.append('caption', `${trigger} ${caption}`);
        
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            handleFileProcessed(result);
        } else {
            throw new Error('Failed to process image');
        }
    } catch (error) {
        console.error('Error processing image:', error);
        sseClient.log(`Error processing image: ${error.message}`);
    }
}

/**
 * Handle processed file
 */
function handleFileProcessed(data) {
    state.processedFiles.add(state.currentFile);
    
    // Add to processed sets array if it doesn't exist
    const caption = elements.captionInput.value.trim();
    const trigger = elements.triggerInput.value.trim();
    const fullCaption = `${trigger} ${caption}`;
    const baseName = data.output_filename.replace('.png', '');
    
    const existingIndex = state.processedSets.findIndex(set => set.base_name === baseName);
    if (existingIndex === -1) {
        state.processedSets.push({
            base_name: baseName,
            image_file: data.output_filename,
            caption_file: `${baseName}.txt`,
            caption: fullCaption,
            created: new Date().toISOString()
        });
    }
    
    // Update processed displays
    elements.processedCount.textContent = state.processedSets.length;
    
    // Refresh processed list if we're on that tab
    if (state.currentTab === 'processed') {
        renderProcessedList();
    }
    
    // Move to next file
    const currentIndex = state.files.indexOf(state.currentFile);
    if (currentIndex < state.files.length - 1) {
        selectFile(state.files[currentIndex + 1]);
    }
    
    renderFileList();
    sseClient.log(`Processed: ${data.output_filename}`);
}

/**
 * Delete a file
 */
async function deleteFile(filename) {
    // No confirmation needed - just delete
    try {
        const response = await fetch(`/api/raw-image/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Remove from files list
            const fileIndex = state.files.indexOf(filename);
            state.files = state.files.filter(f => f !== filename);
            
            // If deleted file was selected, select next or previous
            if (filename === state.currentFile) {
                if (fileIndex < state.files.length) {
                    // Select next file (same index)
                    selectFile(state.files[fileIndex]);
                } else if (state.files.length > 0) {
                    // Select previous file
                    selectFile(state.files[state.files.length - 1]);
                } else {
                    // No files left
                    state.currentFile = null;
                    elements.currentFile.textContent = 'No file selected';
                    elements.captionInput.value = '';
                    elements.generateBtn.disabled = true;
                    elements.processBtn.disabled = true;
                    imageEditor.clear();
                }
            }
            
            renderFileList();
            sseClient.log(`Deleted: ${filename}`);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        sseClient.log(`Error deleting file: ${error.message}`);
    }
}

/**
 * Select a processed set and load its data
 */
async function selectProcessedSet(baseName) {
    state.currentProcessedSet = baseName;
    
    // Update active state in list
    renderProcessedList();
    
    try {
        // Load the image
        const imagePath = `/api/processed-image/${baseName}.png`;
        loadProcessedImage(imagePath, baseName);
        
        // Load the caption
        const response = await fetch(`/api/processed-caption/${baseName}`);
        if (response.ok) {
            const data = await response.json();
            elements.processedCaption.value = data.caption;
        }
        
        // Update info panel
        updateProcessedInfo(baseName);
        
        // Update navigation buttons
        updateNavigationButtons();
        
    } catch (error) {
        console.error('Error loading processed set:', error);
        sseClient.log(`Error loading processed set: ${error.message}`);
    }
}

/**
 * Load processed image into canvas
 */
function loadProcessedImage(imagePath, baseName) {
    const img = new Image();
    img.onload = () => {
        if (elements.processedCanvas) {
            const ctx = elements.processedCanvas.getContext('2d');
            elements.processedCanvas.width = img.width;
            elements.processedCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
        }
    };
    img.src = imagePath;
}

/**
 * Update the processed info panel
 */
function updateProcessedInfo(baseName) {
    if (elements.processedInfo) {
        const currentIndex = state.processedSets.findIndex(set => set.base_name === baseName) + 1;
        const totalSets = state.processedSets.length;
        
        elements.processedInfo.innerHTML = `
            <div class="processed-number-row">
                <div class="processed-current-number">${currentIndex.toString().padStart(3, '0')}</div>
                <div class="processed-total-count">/ ${totalSets}</div>
            </div>
            <div class="section-label">FILES</div>
            <div class="processed-file-names">
                <div>${baseName}.png</div>
                <div>${baseName}.txt</div>
            </div>
        `;
    }
}

/**
 * Navigate to previous processed set
 */
function prevProcessedSet() {
    if (!state.currentProcessedSet || state.processedSets.length === 0) return;
    
    const currentIndex = state.processedSets.findIndex(set => set.base_name === state.currentProcessedSet);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : state.processedSets.length - 1;
    selectProcessedSet(state.processedSets[prevIndex].base_name);
}

/**
 * Navigate to next processed set
 */
function nextProcessedSet() {
    if (!state.currentProcessedSet || state.processedSets.length === 0) return;
    
    const currentIndex = state.processedSets.findIndex(set => set.base_name === state.currentProcessedSet);
    const nextIndex = currentIndex < state.processedSets.length - 1 ? currentIndex + 1 : 0;
    selectProcessedSet(state.processedSets[nextIndex].base_name);
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
    const prevBtn = document.getElementById('prev-processed-btn');
    const nextBtn = document.getElementById('next-processed-btn');
    
    if (!prevBtn || !nextBtn) return;
    
    const hasMultipleSets = state.processedSets.length > 1;
    const hasAnySets = state.processedSets.length > 0;
    
    // Enable/disable buttons based on set availability
    prevBtn.disabled = !hasAnySets;
    nextBtn.disabled = !hasAnySets;
    
    // Show/hide based on whether we have multiple sets to navigate
    if (hasMultipleSets) {
        prevBtn.style.opacity = '1';
        nextBtn.style.opacity = '1';
    } else {
        prevBtn.style.opacity = '0.3';
        nextBtn.style.opacity = '0.3';
    }
}

/**
 * Auto-save caption for processed set
 */
let captionSaveTimeout = null;
async function autoSaveProcessedCaption() {
    if (!state.currentProcessedSet) return;
    
    // Debounce the save operation
    clearTimeout(captionSaveTimeout);
    captionSaveTimeout = setTimeout(async () => {
        try {
            const caption = elements.processedCaption.value;
            const response = await fetch(`/api/processed-caption/${state.currentProcessedSet}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ caption })
            });
            
            if (!response.ok) {
                throw new Error('Failed to save caption');
            }
            
            // Update the caption in state
            const setIndex = state.processedSets.findIndex(set => set.base_name === state.currentProcessedSet);
            if (setIndex !== -1) {
                state.processedSets[setIndex].caption = caption;
            }
            
        } catch (error) {
            console.error('Error auto-saving caption:', error);
            sseClient.log(`Error saving caption: ${error.message}`);
        }
    }, 500); // 500ms debounce
}

/**
 * Delete a processed set
 */
async function deleteProcessedSet(baseName) {
    if (!confirm(`Delete processed set ${baseName} (both image and caption)?`)) return;
    
    try {
        const response = await fetch(`/api/processed-set/${encodeURIComponent(baseName)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // The SSE event will handle UI updates
            sseClient.log(`Deleted processed set: ${baseName}`);
        } else {
            throw new Error('Failed to delete processed set');
        }
    } catch (error) {
        console.error('Error deleting processed set:', error);
        sseClient.log(`Error deleting processed set: ${error.message}`);
    }
}

/**
 * Clear all files from raw folder
 */
async function clearAllFiles() {
    if (!state.files.length) return;
    
    if (!confirm(`Delete all ${state.files.length} images from workspace?`)) return;
    
    try {
        const response = await fetch('/api/raw-images/clear', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Clear state
            state.files = [];
            state.currentFile = null;
            elements.currentFile.textContent = 'No file selected';
            elements.captionInput.value = '';
            elements.generateBtn.disabled = true;
            elements.processBtn.disabled = true;
            imageEditor.clear();
            
            renderFileList();
            sseClient.log(`Cleared all images from workspace`, 'INF');
        } else {
            throw new Error('Failed to clear workspace');
        }
    } catch (error) {
        console.error('Error clearing workspace:', error);
        sseClient.log(`Error clearing workspace: ${error.message}`, 'ERR');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active from all tabs and contents
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked tab and corresponding content
            e.target.classList.add('active');
            const tabName = e.target.dataset.tab;
            state.currentTab = tabName;
            document.getElementById(`${tabName}-tab`).classList.add('active');
            
            // Show/hide appropriate UI elements
            if (tabName === 'input') {
                // Show input elements
                document.getElementById('input-image-editor').style.display = 'block';
                document.getElementById('input-file-info').style.display = 'block';
                document.getElementById('input-caption').style.display = 'block';
                
                // Hide processed elements
                document.getElementById('processed-image-display').style.display = 'none';
                document.getElementById('processed-file-info').style.display = 'none';
                document.getElementById('processed-caption-area').style.display = 'none';
            } else if (tabName === 'processed') {
                // Show processed elements
                document.getElementById('processed-image-display').style.display = 'block';
                document.getElementById('processed-file-info').style.display = 'block';
                document.getElementById('processed-caption-area').style.display = 'block';
                
                // Hide input elements
                document.getElementById('input-image-editor').style.display = 'none';
                document.getElementById('input-file-info').style.display = 'none';
                document.getElementById('input-caption').style.display = 'none';
                
                // Load processed data
                loadProcessedSets();
            }
        });
    });
    
    // Process button
    elements.processBtn.addEventListener('click', processImage);
    
    // Generate caption button
    elements.generateBtn.addEventListener('click', generateCaption);
    
    // Clear all button
    elements.clearAllBtn.addEventListener('click', clearAllFiles);
    
    // Save caption on change
    elements.captionInput.addEventListener('input', () => {
        if (state.currentFile) {
            state.captions.set(state.currentFile, elements.captionInput.value);
        }
    });
    
    // Auto-save processed caption on change
    if (elements.processedCaption) {
        elements.processedCaption.addEventListener('input', autoSaveProcessedCaption);
    }
    
    // Navigation buttons for processed sets
    const prevBtn = document.getElementById('prev-processed-btn');
    const nextBtn = document.getElementById('next-processed-btn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', prevProcessedSet);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', nextProcessedSet);
    }
    
    // Keyboard navigation for processed sets
    document.addEventListener('keydown', (e) => {
        // Only handle arrow keys when on processed tab and not in text input
        if (state.currentTab === 'processed' && !e.target.matches('textarea, input')) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevProcessedSet();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextProcessedSet();
            }
        }
    });
    
    // Folder selection
    document.querySelector('.folder-btn').addEventListener('click', async () => {
        // For now, we'll use a file input dialog
        // In a real Electron/Tauri app, we'd use native folder picker
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.webkitdirectory = true; // For folder selection in Chrome
        
        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                // Get the folder path from first file
                const folderPath = files[0].webkitRelativePath.split('/')[0];
                const imageFiles = files.filter(f => f.type.startsWith('image/'));
                
                if (imageFiles.length > 0) {
                    await importImages(folderPath, imageFiles);
                } else {
                    alert('No images found in selected folder');
                }
            }
        });
        
        input.click();
    });
    
    // Add aspect ratio toggle
    setupAspectRatioToggle();
}

/**
 * Setup aspect ratio toggle
 */
function setupAspectRatioToggle() {
    // Handle aspect ratio buttons in the image editor pane
    document.querySelectorAll('.aspect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active from all buttons
            document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
            // Add active to clicked button
            e.target.classList.add('active');
            
            // Get the new aspect ratio
            state.aspectRatio = e.target.dataset.aspect;
            
            // Update canvas dimensions
            const ratio = aspectRatios[state.aspectRatio];
            imageEditor.setCanvasDimensions(ratio.width, ratio.height, state.aspectRatio);
            
            // Update crop overlay CSS
            const overlay = document.getElementById('crop-overlay');
            if (state.aspectRatio === '1:1') {
                overlay.classList.add('aspect-1-1');
            } else {
                overlay.classList.remove('aspect-1-1');
            }
        });
    });
}

/**
 * Initialize application
 */
function init() {
    initElements();
    initImageEditor();
    initSSE();
    setupEventListeners();
    
    // Load any existing data after a short delay
    setTimeout(() => {
        loadRawFolder();
        loadProcessedSets(); // Load processed sets on startup
    }, 500);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
