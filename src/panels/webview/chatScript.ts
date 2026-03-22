/**
 * chatScript.ts — Inline JS for the OCLite Chat webview
 */
export function getChatScript(): string {
    // Use \x60 for backtick to avoid template literal conflicts
    return `
        var vscode = (function() {
            try {
                if (typeof acquireVsCodeApi === 'function') { return acquireVsCodeApi(); }
            } catch(e) {}
            return { postMessage: function(msg) { console.log('[OCLite stub]', msg); } };
        })();

        function post(msg) {
            try { vscode.postMessage(msg); } catch(e) { console.error('[OCLite] postMessage error', e); }
        }

        // Make post available globally for onclick handlers
        window.post = post;

        var chatDiv        = document.getElementById('chat');
        var promptEl       = document.getElementById('prompt');
        var sendBtn        = document.getElementById('sendBtn');
        var uploadBtn      = document.getElementById('uploadBtn');
        var fileInput      = document.getElementById('fileInput');
        var attachedFileDiv = document.getElementById('attachedFile');
        var historyPanel   = document.getElementById('historyPanel');
        var historyContent = document.getElementById('historyContent');
        var historyStats   = document.getElementById('historyStats');

        var firstMessage       = true;
        var attachedImageBase64 = null;
        var attachedTextData    = null;
        var attachedBinaryBase64 = null;
        var attachedFileName    = null;
        var currentSessionId    = null;

        // ── Header buttons ──────────────────────────────────────────────
        document.getElementById('switchToParticipant').addEventListener('click', function() {
            post({ type: 'switchToParticipant' });
        });
        document.getElementById('historyBtn').addEventListener('click', function() {
            historyPanel.classList.add('visible');
            post({ type: 'getSessionList' });
        });
        document.getElementById('newSessionBtn').addEventListener('click', function() {
            post({ type: 'newSession' });
        });
        document.getElementById('closeHistoryBtn').addEventListener('click', function() {
            historyPanel.classList.remove('visible');
        });
        document.getElementById('exportHistoryBtn').addEventListener('click', function() {
            post({ type: 'exportHistory' });
        });
        document.getElementById('clearHistoryBtn').addEventListener('click', function() {
            post({ type: 'clearHistory' });
        });

        // ── History helpers ──────────────────────────────────────────────
        // Use event delegation — inline onclick is blocked by CSP
        historyContent.addEventListener('click', function(e) {
            var target = e.target;

            // Delete button
            var delBtn = target.closest ? target.closest('.session-delete-btn') : null;
            if (!delBtn && target.classList.contains('session-delete-btn')) { delBtn = target; }
            if (delBtn) {
                e.stopPropagation();
                e.preventDefault();
                var sessionId = delBtn.getAttribute('data-session-id');
                if (sessionId) {
                    post({ type: 'deleteSession', sessionId: sessionId });
                }
                return;
            }

            // Session item (load)
            var item = target.closest ? target.closest('.session-item') : null;
            if (!item && target.classList.contains('session-item')) { item = target; }
            if (item) {
                var sid = item.getAttribute('data-session-id');
                if (sid) {
                    post({ type: 'loadSession', sessionId: sid });
                    historyPanel.classList.remove('visible');
                }
            }
        });

        function renderSessionList(data) {
            var sessions = data.sessions;
            var stats = data.stats;
            var activeId = data.currentSessionId;
            currentSessionId = activeId;
            if (sessions.length === 0) {
                historyContent.innerHTML = '<div style="text-align:center;padding:20px;opacity:0.7"><div style="font-size:24px;margin-bottom:8px">\uD83D\uDCDA</div><div>No chat history yet</div></div>';
            } else {
                historyContent.innerHTML = sessions.map(function(s) {
                    var active = s.id === activeId ? ' active' : '';
                    var date = new Date(s.lastModified).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
                    return '<div class="session-item' + active + '" data-session-id="' + s.id + '">' +
                        '<div class="session-title">' + esc(s.title) + '</div>' +
                        '<div class="session-meta"><span>' + s.messageCount + ' pesan \u2022 ' + date + '</span>' +
                        '<div class="session-actions"><button class="session-delete-btn" data-session-id="' + s.id + '">\uD83D\uDDD1\uFE0F Hapus</button></div></div></div>';
                }).join('');
            }
            historyStats.innerHTML = stats.totalSessions + ' sessions \u2022 ' + stats.totalMessages + ' total messages';
        }

        // ── Chat rendering ───────────────────────────────────────────────
        function esc(str) {
            var d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function renderAIContent(text) {
            // Split on triple-backtick code blocks
            var TICK3 = '\\x60\\x60\\x60';
            var parts = text.split(new RegExp('(' + TICK3 + '[\\\\s\\\\S]*?' + TICK3 + ')', 'g'));
            var html = '';
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (part.indexOf(TICK3) === 0 && part.lastIndexOf(TICK3) === part.length - 3) {
                    var code = part.slice(3, -3).replace(/^\\w*\\n?/, '');
                    html += '<div class="code-block"><button class="insert-btn" data-code="' + esc(code).replace(/"/g, '&quot;') + '">Insert</button>' + esc(code) + '</div>';
                } else {
                    html += esc(part);
                }
            }
            return html;
        }

        function loadHistoryMessages(messages) {
            chatDiv.innerHTML = '';
            firstMessage = false;
            messages.forEach(function(msg) {
                var div = document.createElement('div');
                div.className = 'msg ' + msg.type;
                if (msg.type === 'user') {
                    var html = esc(msg.content);
                    if (msg.attachedFileName) { html = '<div style="font-size:10px;opacity:0.8;margin-bottom:4px">\\uD83D\\uDCCE ' + esc(msg.attachedFileName) + '</div>' + html; }
                    if (msg.attachedImage)    { html = '<img src="' + msg.attachedImage + '" style="max-width:100%;max-height:150px;border-radius:4px;margin-bottom:4px"/><br>' + html; }
                    div.innerHTML = html;
                } else {
                    div.innerHTML = '<div class="label">OCLite</div>' + renderAIContent(msg.content);
                }
                chatDiv.appendChild(div);
            });
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }

        // ── Send message ─────────────────────────────────────────────────
        function sendMessage() {
            var text = promptEl.value.trim();
            if (!text && !attachedImageBase64 && !attachedTextData && !attachedBinaryBase64) { return; }
            if (firstMessage) { chatDiv.innerHTML = ''; firstMessage = false; }

            var userDiv = document.createElement('div');
            userDiv.className = 'msg user';
            var html = esc(text);
            if (attachedFileName)    { html = '<div style="font-size:10px;opacity:0.8;margin-bottom:4px">\\uD83D\\uDCCE ' + esc(attachedFileName) + '</div>' + html; }
            if (attachedImageBase64) { html = '<img src="' + attachedImageBase64 + '" style="max-width:100%;max-height:150px;border-radius:4px;margin-bottom:4px"/><br>' + html; }
            userDiv.innerHTML = html;
            chatDiv.appendChild(userDiv);

            var typing = document.createElement('div');
            typing.className = 'typing'; typing.id = 'typing';
            typing.innerHTML = '<span></span><span></span><span></span>';
            chatDiv.appendChild(typing);
            chatDiv.scrollTop = chatDiv.scrollHeight;

            promptEl.value = '';
            promptEl.disabled = true;
            sendBtn.disabled = true;

            post({ type: 'askAI', value: text, attachedImage: attachedImageBase64, attachedText: attachedTextData, attachedBinary: attachedBinaryBase64, attachedFileName: attachedFileName });
            clearAttachment();
        }

        // ── File attachment ──────────────────────────────────────────────
        uploadBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) { return; }
            attachedFileName = file.name;
            var isImage  = file.type.indexOf('image/') === 0;
            var isBinary = /\\.(pdf|doc|docx)$/i.test(file.name);
            var reader = new FileReader();
            reader.onload = function(ev) {
                if (isImage)       { attachedImageBase64 = ev.target.result; attachedBinaryBase64 = null; attachedTextData = null; }
                else if (isBinary) { attachedBinaryBase64 = ev.target.result; attachedImageBase64 = null; attachedTextData = null; }
                else               { attachedTextData = ev.target.result; attachedImageBase64 = null; attachedBinaryBase64 = null; }
                attachedFileDiv.style.display = 'block';
                attachedFileDiv.innerHTML = '\\uD83D\\uDCCE ' + esc(file.name) + ' <span style="cursor:pointer;float:right" onclick="clearAttachment()">\\u274C</span>';
            };
            if (isImage || isBinary) { reader.readAsDataURL(file); } else { reader.readAsText(file); }
        });

        window.clearAttachment = function() {
            attachedImageBase64 = attachedBinaryBase64 = attachedTextData = attachedFileName = null;
            fileInput.value = '';
            attachedFileDiv.style.display = 'none';
        };

        promptEl.addEventListener('paste', function(e) {
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.kind === 'file' && item.type.indexOf('image/') === 0) {
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        attachedImageBase64 = ev.target.result;
                        attachedBinaryBase64 = attachedTextData = null;
                        attachedFileName = 'Pasted Image.png';
                        attachedFileDiv.style.display = 'block';
                        attachedFileDiv.innerHTML = '\\uD83D\\uDCCE Pasted Image <span style="cursor:pointer;float:right" onclick="clearAttachment()">\\u274C</span>';
                    };
                    reader.readAsDataURL(item.getAsFile());
                }
            }
        });

        // ── Quick action buttons ─────────────────────────────────────────
        chatDiv.addEventListener('click', function(e) {
            var target = e.target;
            if (target.classList.contains('insert-btn')) {
                var code = target.getAttribute('data-code');
                if (code) { post({ type: 'insertCode', value: code }); }
                return;
            }
            var btn = target.closest ? target.closest('.quick-btn') : null;
            if (!btn && target.classList.contains('quick-btn')) { btn = target; }
            if (btn) {
                var action = btn.getAttribute('data-action');
                if (btn.classList.contains('enhanced-btn')) {
                    btn.classList.add('loading');
                    setTimeout(function() { btn.classList.remove('loading'); }, 3000);
                }
                var prompts = {
                    explain:    '\\uD83E\\uDDE0 Analyze and explain the code in my active editor with detailed breakdown',
                    improve:    '\\u26A1 Review and improve the code in my active editor with optimization suggestions',
                    brainstorm: '\\uD83D\\uDE80 Brainstorm 10 creative ideas and innovative solutions for '
                };
                if (prompts[action]) { promptEl.value = prompts[action]; promptEl.focus(); }
            }
        });

        // ── Send / keyboard ──────────────────────────────────────────────
        sendBtn.addEventListener('click', sendMessage);
        promptEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });

        // ── Messages from extension ──────────────────────────────────────
        window.addEventListener('message', function(event) {
            var msg = event.data;
            if (msg.type === 'addResponse') {
                var t = document.getElementById('typing');
                if (t) { t.remove(); }
                var div = document.createElement('div');
                div.className = 'msg ai';
                div.innerHTML = '<div class="label">OCLite</div>' + renderAIContent(msg.value || '(no response)');
                chatDiv.appendChild(div);
                chatDiv.scrollTop = chatDiv.scrollHeight;
                promptEl.disabled = false; sendBtn.disabled = false; promptEl.focus();
            }
            else if (msg.type === 'imageGenerated') {
                var t = document.getElementById('typing');
                if (t) { t.remove(); }
                
                // Create result div with image and action buttons
                var div = document.createElement('div');
                div.className = 'msg ai';
                div.innerHTML = '<div class="label">OCLite</div>' +
                    '<div style="margin-bottom:12px">' +
                    '<strong>\\u2705 Image Generated!</strong><br>' +
                    '<em style="opacity:0.8">' + esc(msg.prompt) + '</em>' +
                    '</div>' +
                    '<img src="' + msg.imageUrl + '" style="max-width:100%;border-radius:8px;margin-bottom:12px;cursor:pointer" onclick="post({type:\\'previewImage\\',path:\\''+msg.imageUrl+'\\'})" />' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                    '<button class="action-btn" onclick="post({type:\\'previewImage\\',path:\\''+msg.tempPath+'\\'})" style="flex:1;min-width:100px;padding:8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border);border-radius:4px;cursor:pointer">\\uD83D\\uDC41\\uFE0F Preview</button>' +
                    '<button class="action-btn" onclick="post({type:\\'saveImage\\',path:\\''+msg.tempPath+'\\',prompt:\\''+esc(msg.prompt)+'\\'})" style="flex:1;min-width:100px;padding:8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border);border-radius:4px;cursor:pointer">\\uD83D\\uDCBE Save</button>' +
                    '<button class="action-btn" onclick="post({type:\\'viewGallery\\'})" style="flex:1;min-width:100px;padding:8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border);border-radius:4px;cursor:pointer">\\uD83D\\uDDBC\\uFE0F Gallery</button>' +
                    '<button class="action-btn" onclick="post({type:\\'copyLink\\',url:\\''+msg.imageUrl+'\\',blobName:\\''+msg.blobName+'\\'})" style="flex:1;min-width:100px;padding:8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border);border-radius:4px;cursor:pointer">\\uD83D\\uDCCB Link</button>' +
                    '<button class="action-btn" onclick="post({type:\\'generateVariations\\',prompt:\\''+esc(msg.prompt)+'\\'})" style="flex:1;min-width:100px;padding:8px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border);border-radius:4px;cursor:pointer">\\uD83D\\uDD04 3 Variations</button>' +
                    '</div>';
                chatDiv.appendChild(div);
                chatDiv.scrollTop = chatDiv.scrollHeight;
                promptEl.disabled = false; sendBtn.disabled = false; promptEl.focus();
            }
            else if (msg.type === 'loadHistory') {
                loadHistoryMessages(msg.messages);
                currentSessionId = msg.sessionId;
            }
            else if (msg.type === 'newSessionCreated') {
                chatDiv.innerHTML = '<div class="welcome"><div class="icon">\\uD83D\\uDCAC</div><strong>New Chat Session</strong><p>Start a new conversation!</p></div>';
                firstMessage = true; currentSessionId = msg.sessionId;
            }
            else if (msg.type === 'sessionList')    { renderSessionList(msg); }
            else if (msg.type === 'sessionDeleted') {
                if (historyPanel.classList.contains('visible')) { post({ type: 'getSessionList' }); }
            }
            else if (msg.type === 'historyCleared') {
                chatDiv.innerHTML = '<div class="welcome"><div class="icon">\\uD83D\\uDCAC</div><strong>Chat History Cleared</strong><p>All previous conversations have been deleted.</p></div>';
                firstMessage = true;
                historyPanel.classList.remove('visible');
            }
        });
    `;
}
