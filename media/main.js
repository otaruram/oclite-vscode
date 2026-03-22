// ── OCLite Diagram Wizard — Sidebar Script ─────────────────────────
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // ── DOM References ──
  const promptInput = document.getElementById('prompt-input');
  const styleDropdown = document.getElementById('style-dropdown');
  const generateBtn = document.getElementById('generate-btn');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('status-text');
  const statusBar = document.querySelector('.status-bar');
  const stepIndicator = document.getElementById('step-indicator');
  const resultArea = document.getElementById('mermaid-result-area');
  const resultCode = document.getElementById('mermaid-result-code');
  const copyExcalidrawBtn = document.getElementById('open-excalidraw-btn');
  const projectBanner = document.getElementById('project-banner');
  const projectIcon = document.getElementById('project-icon');
  const projectMessage = document.getElementById('project-message');
  const suggestionArea = document.getElementById('suggestion-area');
  const suggestionText = document.getElementById('suggestion-text');

  let currentMermaidCode = '';

  // ── Generate Button ──
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const prompt = promptInput ? promptInput.value.trim() : '';
      const style = styleDropdown ? styleDropdown.value : 'Auto (Let AI Choose)';

      if (!prompt) {
        setStatus('⚠️ Please enter a description first', 'error');
        if (promptInput) promptInput.focus();
        return;
      }

      generateBtn.disabled = true;
      generateBtn.classList.add('loading');
      if (resultArea) resultArea.classList.add('hidden');
      if (stepIndicator) stepIndicator.classList.remove('hidden');

      vscode.postMessage({ command: 'generate', prompt, style });
    });
  }

  // ── Copy & Open Excalidraw ──
  if (copyExcalidrawBtn) {
    copyExcalidrawBtn.addEventListener('click', () => {
      if (currentMermaidCode) {
        vscode.postMessage({ command: 'open-excalidraw', code: currentMermaidCode });
      }
    });
  }

  // ── Enter Key Support ──
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (generateBtn) generateBtn.click();
      }
    });
  }

  // ── Incoming Messages ──
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;

    switch (msg.type || msg.command) {
      case 'status':
        setStatus(msg.value, 'active');
        if (msg.step) setStep(msg.step);
        break;

      case 'success_mermaid':
        currentMermaidCode = msg.code || '';
        if (resultCode) resultCode.textContent = currentMermaidCode;
        if (resultArea) resultArea.classList.remove('hidden');
        setStatus('✨ Diagram generated!', 'success');
        setStep(2, true);
        resetButton();
        break;

      case 'error':
        setStatus('❌ ' + (msg.value || 'Generation failed'), 'error');
        resetButton();
        break;

      case 'projectDetected':
        if (msg.project && projectBanner) {
          projectBanner.classList.remove('hidden');
          if (projectIcon) projectIcon.textContent = msg.project.icon || '📁';
          if (projectMessage) projectMessage.textContent = msg.project.message || '';
        }
        break;

      case 'suggestion':
        // Auto-set style dropdown
        if (msg.style && styleDropdown) {
          for (let i = 0; i < styleDropdown.options.length; i++) {
            if (styleDropdown.options[i].value === msg.style) {
              styleDropdown.selectedIndex = i;
              break;
            }
          }
        }
        break;

      case 'workspace-suggestion':
        if (msg.suggestion && suggestionArea && suggestionText) {
          suggestionArea.classList.remove('hidden');
          suggestionText.textContent = msg.suggestion;
        }
        break;

      case 'aiSuggestion':
        if (msg.suggestion && suggestionArea && suggestionText) {
          suggestionArea.classList.remove('hidden');
          suggestionText.textContent = msg.suggestion;
        }
        break;
    }
  });

  // ── Helpers ──
  function setStatus(text, type) {
    if (statusText) statusText.textContent = text;
    if (statusBar) {
      statusBar.className = 'status-bar';
      if (type) statusBar.classList.add(type);
    }
  }

  function setStep(step, done) {
    if (!stepIndicator) return;
    const steps = stepIndicator.querySelectorAll('.step');
    const lines = stepIndicator.querySelectorAll('.step-line');

    steps.forEach((s, i) => {
      s.classList.remove('active', 'done');
      if (i + 1 < step) s.classList.add('done');
      else if (i + 1 === step) s.classList.add(done ? 'done' : 'active');
    });
    lines.forEach((l, i) => {
      l.classList.remove('done');
      if (i + 1 < step) l.classList.add('done');
    });
  }

  function resetButton() {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.classList.remove('loading');
    }
  }

  // ── Request suggestion on load ──
  vscode.postMessage({ command: 'requestSuggestion' });
})();
