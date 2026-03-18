// OCLite WebView Main Script
// Phase 2: VS Code UI Toolkit Integration with Real-time Status

const vscode = acquireVsCodeApi();

// State management
let isGenerating = false;

// UI Elements
const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt-input');
const styleDropdown = document.getElementById('style-dropdown');
const statusText = document.getElementById('status-text');
const progressRing = document.getElementById('progress-ring');
const stepIndicator = document.getElementById('step-indicator');
const projectBanner = document.getElementById('project-banner');
const projectIcon = document.getElementById('project-icon');
const projectMessage = document.getElementById('project-message');
const suggestionArea = document.getElementById('suggestion-area');
const suggestionText = document.getElementById('suggestion-text');

// Mermaid elements
const mermaidResultArea = document.getElementById('mermaid-result-area');
const mermaidResultCode = document.getElementById('mermaid-result-code');
const openExcalidrawBtn = document.getElementById('open-excalidraw-btn');
let currentMermaidCode = null;

// Generate button handler
if (generateBtn) {
    generateBtn.addEventListener('click', () => {
        const prompt = promptInput?.value?.trim();
        const style = styleDropdown?.value;

        if (!prompt) {
            showStatus('Please enter a prompt description.', 'warning');
            promptInput?.focus();
            return;
        }

        startGeneration();

        vscode.postMessage({
            command: 'generate',
            prompt: prompt,
            style: style
        });
    });
}

// Save and Regenerate buttons removed for text-based diagram generator.

// Open in Excalidraw handler
if (openExcalidrawBtn) {
    openExcalidrawBtn.addEventListener('click', () => {
        if (currentMermaidCode) {
            vscode.postMessage({
                command: 'open-excalidraw',
                code: currentMermaidCode
            });
        }
    });
}

// Enter key to generate
if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            generateBtn?.click();
        }
    });
}

    /**
     * Start generation UI state
     */
    function startGeneration() {
        isGenerating = true;
        progressRing?.classList.remove('hidden');
        stepIndicator?.classList.remove('hidden');
        generateBtn.disabled = true;
        statusText.innerText = 'Generating diagram...';
        currentMermaidCode = null;
        mermaidResultArea?.classList.add('hidden');

        // Reset step indicators
        resetSteps();
    }

    /**
     * Reset all step indicators
     */
    function resetSteps() {
        const steps = document.querySelectorAll('.step');
        steps.forEach(step => {
            step.classList.remove('active', 'completed');
        });
    }

    /**
     * Update step progress indicator
     */
    function updateStepProgress(currentStep, totalSteps) {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNum < currentStep) {
                step.classList.add('completed');
            } else if (stepNum === currentStep) {
                step.classList.add('active');
            }
        });
    }

    /**
     * Show status message with optional type
     */
    function showStatus(message, type = 'info') {
        statusText.innerText = message;
    }

    /**
     * End generation and reset UI
     */
    function endGeneration(success = true) {
        isGenerating = false;
        progressRing.classList.add('hidden');
        generateBtn.disabled = false;

        if (success) {
            // Mark all steps as completed
            const steps = document.querySelectorAll('.step');
            steps.forEach(step => {
                step.classList.remove('active');
                step.classList.add('completed');
            });
        }
    }

    // Message handler from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'status':
                showStatus(message.value);
                if (message.step && message.totalSteps) {
                    updateStepProgress(message.step, message.totalSteps);
                }
                break;

            case 'progress':
                if (message.message) {
                    showStatus(message.message);
                }
                break;

            case 'success':
                endGeneration(true);
                showStatus('✅ Generation complete!');
                break;

            case 'success_mermaid':
                endGeneration(true);
                currentMermaidCode = message.code;
                if (mermaidResultCode && mermaidResultArea) {
                    mermaidResultCode.innerText = message.code;
                    mermaidResultArea.classList.remove('hidden');
                }
                showStatus('✅ Diagram code ready! Copy & open in Excalidraw.');
                setTimeout(() => {
                    mermaidResultArea?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
                break;

            case 'error':
                endGeneration(false);
                stepIndicator?.classList.add('hidden');
                showStatus('❌ Error: ' + message.value, 'error');
                break;

            case 'saved':
                showStatus(`💾 Saved successfully.`);
                break;

            case 'projectDetected':
                if (message.project) {
                    projectBanner.classList.remove('hidden');
                    projectIcon.innerText = message.project.icon || '📁';
                    projectMessage.innerText = message.project.message;
                }
                break;

            case 'suggestion':
                if (message.style) {
                    // Auto-select the suggested style
                    styleDropdown.value = message.style;
                    
                    // Show suggestion notification
                    suggestionArea?.classList.remove('hidden');
                    if (suggestionText) {
                        suggestionText.innerText = `Recommended: ${message.style} based on your project type.`;
                    }
                    
                    // Auto-hide after 5 seconds
                    setTimeout(() => {
                        suggestionArea?.classList.add('hidden');
                    }, 5000);
                }
                break;

            case 'aiSuggestion':
                if (message.suggestion) {
                    suggestionArea?.classList.remove('hidden');
                    if (suggestionText) {
                        suggestionText.innerText = message.suggestion;
                    }
                }
                break;
        }
    });

    // Request workspace analysis on load
    vscode.postMessage({ command: 'requestSuggestion' });
