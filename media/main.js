// OCLite WebView Main Script
// Phase 2: VS Code UI Toolkit Integration with Real-time Status

const vscode = acquireVsCodeApi();

// State management
let isGenerating = false;
let currentImageUrl = null;

window.addEventListener('load', () => {
    // UI Elements
    const generateBtn = document.getElementById('generate-btn');
    const promptInput = document.getElementById('prompt-input');
    const styleDropdown = document.getElementById('style-dropdown');
    const resultArea = document.getElementById('result-area');
    const resultImage = document.getElementById('result-image');
    const statusText = document.getElementById('status-text');
    const progressRing = document.getElementById('progress-ring');
    const saveBtn = document.getElementById('save-btn');
    const regenerateBtn = document.getElementById('regenerate-btn');
    const stepIndicator = document.getElementById('step-indicator');
    const refinedPromptArea = document.getElementById('refined-prompt-area');
    const refinedPromptText = document.getElementById('refined-prompt-text');
    const projectBanner = document.getElementById('project-banner');
    const projectIcon = document.getElementById('project-icon');
    const projectMessage = document.getElementById('project-message');
    const suggestionArea = document.getElementById('suggestion-area');
    const suggestionText = document.getElementById('suggestion-text');

    // Generate button handler
    generateBtn.addEventListener('click', () => {
        const prompt = promptInput.value?.trim();
        const style = styleDropdown.value;

        if (!prompt) {
            showStatus('Please enter a prompt description.', 'warning');
            promptInput.focus();
            return;
        }

        startGeneration();

        vscode.postMessage({
            command: 'generate',
            prompt: prompt,
            style: style
        });
    });

    // Save button handler
    saveBtn?.addEventListener('click', () => {
        if (currentImageUrl) {
            vscode.postMessage({
                command: 'save',
                imageUrl: currentImageUrl
            });
        }
    });

    // Regenerate button handler
    regenerateBtn?.addEventListener('click', () => {
        const prompt = promptInput.value?.trim();
        const style = styleDropdown.value;

        if (!prompt) {
            showStatus('Please enter a prompt description.', 'warning');
            return;
        }

        startGeneration();

        vscode.postMessage({
            command: 'generate',
            prompt: prompt,
            style: style
        });
    });

    // Enter key to generate
    promptInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            generateBtn.click();
        }
    });

    /**
     * Start generation UI state
     */
    function startGeneration() {
        isGenerating = true;
        resultArea.classList.add('hidden');
        refinedPromptArea.classList.add('hidden');
        progressRing.classList.remove('hidden');
        stepIndicator?.classList.remove('hidden');
        generateBtn.disabled = true;
        statusText.innerText = 'Initializing Agent...';
        currentImageUrl = null;

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

            case 'refinedPrompt':
                refinedPromptArea.classList.remove('hidden');
                refinedPromptText.innerText = message.refined;
                break;

            case 'success':
                endGeneration(true);
                currentImageUrl = message.imageUrl;
                resultImage.src = message.imageUrl;
                resultArea.classList.remove('hidden');
                showStatus('✅ Generation complete!');
                
                // Smooth scroll to result
                setTimeout(() => {
                    resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
                break;

            case 'error':
                endGeneration(false);
                stepIndicator?.classList.add('hidden');
                showStatus('❌ Error: ' + message.value, 'error');
                break;

            case 'saved':
                showStatus(`💾 Saved: ${message.fileName}`);
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
});

/* ...existing code... */

app.mount('#app');
