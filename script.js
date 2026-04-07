// Global variables
let conversationHistory = [];
let isProcessing = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;
const MAX_CONVERSATION_LENGTH = 20;

// DOM elements
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const clearChatBtn = document.getElementById('clearChatBtn');
const errorModal = document.getElementById('errorModal');
const errorMessage = document.getElementById('errorMessage');
const closeErrorModalBtn = document.getElementById('closeErrorModal');
const charCount = document.getElementById('charCount');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

// Configuration
;
let retryCount = 0;
const MAX_RETRIES = 2;

// ─── Markdown → Clean HTML renderer ────────────────────────────────────────
function renderMarkdown(text) {
    if (!text) return '';

    let html = text;

    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(
        /(https?:\/\/[^\s<")\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="md-link"><i class="fas fa-external-link-alt"></i> $1</a>'
    );

    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm,   '<h1 class="md-h1">$1</h1>');

    html = html.replace(/^---+$/gm, '<hr class="md-hr">');

    html = html.replace(/((?:^[ \t]*[-*•][ \t]+.+\n?)+)/gm, (block) => {
        const items = block
            .trim()
            .split('\n')
            .filter(l => l.trim())
            .map(l => `<li>${l.replace(/^[ \t]*[-*•][ \t]+/, '').trim()}</li>`)
            .join('');
        return `<ul class="md-ul">${items}</ul>`;
    });

    html = html.replace(/((?:^[ \t]*\d+\.[ \t]+.+\n?)+)/gm, (block) => {
        const items = block
            .trim()
            .split('\n')
            .filter(l => l.trim())
            .map(l => `<li>${l.replace(/^[ \t]*\d+\.[ \t]+/, '').trim()}</li>`)
            .join('');
        return `<ol class="md-ol">${items}</ol>`;
    });

    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g,          '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g,          '<em>$1</em>');
    html = html.replace(/_(.+?)_/g,            '<em>$1</em>');

    html = html.replace(/`(.+?)`/g, '<code class="md-code">$1</code>');

    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

    const lines = html.split(/\n{2,}/);
    html = lines.map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<(ul|ol|li|h[1-3]|hr|blockquote|pre)/.test(block)) return block;
        return `<p class="md-p">${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
}

// ─── Initialize ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    initializeTheme();
    setupEventListeners();
    loadConversationFromStorage();
    updateCharCount();
});

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    if (themeIcon) {
        themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// ─── Event listeners ─────────────────────────────────────────────────────────
function setupEventListeners() {
    if (sendBtn)            sendBtn.addEventListener('click', handleSendMessage);
    if (themeToggleBtn)     themeToggleBtn.addEventListener('click', toggleTheme);
    if (clearChatBtn)       clearChatBtn.addEventListener('click', clearChat);
    if (closeErrorModalBtn) closeErrorModalBtn.addEventListener('click', closeErrorModal);

    if (errorModal) {
        errorModal.addEventListener('click', e => {
            if (e.target === errorModal) closeErrorModal();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        chatInput.addEventListener('input', () => {
            autoResize();
            updateCharCount();
            updateSendButton();
        });
    }

    document.querySelectorAll('.question-chip').forEach(chip => {
        chip.addEventListener('click', function () {
            const query = this.getAttribute('data-query');
            if (chatInput) {
                chatInput.value = query;
                updateCharCount();
                handleSendMessage();
            }
        });
    });
}

function autoResize() {
    if (!chatInput) return;
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
}

function updateCharCount() {
    if (!chatInput || !charCount) return;
    const len = chatInput.value.length;
    charCount.textContent = `${len} / 500`;
    charCount.style.color = len > 450 ? 'var(--danger)' : '';
}

function updateSendButton() {
    if (!chatInput || !sendBtn) return;
    const ok = chatInput.value.trim().length > 0 && chatInput.value.length <= 500 && !isProcessing;
    sendBtn.disabled = !ok;
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function handleSendMessage() {
    if (!chatInput) return;
    const message = chatInput.value.trim();
    if (!message || message.length > 500 || isProcessing) return;

    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.style.display = 'none';

    addMessage('user', message);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateCharCount();
    updateSendButton();

    await processQuery(message);
}

async function processQuery(query) {
    if (isProcessing) return;

    // If query is not judiciary/legal related, show a short inline notice
    if (!isJudiciaryQuery(query)) {
        showNonJudiciaryNotice();
        return;
    }

    const now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
        const wait = Math.ceil((MIN_REQUEST_INTERVAL - (now - lastRequestTime)) / 1000);
        showError(`Please wait ${wait} second(s) before making another request.`);
        return;
    }

    isProcessing = true;
    showLoading(true);
    updateSendButton();

    try {
        const response = await callHuggingFaceAPI(query);
        if (response.success) {
            addMessage('assistant', response.content);
        } else {
            showError(response.error || 'Failed to process your request');
        }
    } catch (err) {
        showError('An error occurred. Please try again.');
    } finally {
        isProcessing = false;
        showLoading(false);
        updateSendButton();
        lastRequestTime = Date.now();
    }
}

// ─── Non-judiciary notice (replaces old getNonJudiciaryMessage) ───────────────
function showNonJudiciaryNotice() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-balance-scale"></i>
        </div>
        <div class="message-content">
            <div class="message-body" style="
                border-left: 3px solid #e8a838;
                padding: 10px 14px;
                background: rgba(232,168,56,0.08);
                border-radius: 0 8px 8px 0;
                font-size: 14px;
                color: var(--color-text-secondary, #555);
            ">
                <span style="font-weight: 600; color: var(--color-text-primary, #222);">
                    ⚖️ This assistant handles legal queries only.
                </span><br>
                Please ask something related to Indian law, courts, legal procedures, or judicial matters.
            </div>
            <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── Judiciary Query Validation ───────────────────────────────────────────────
function isJudiciaryQuery(query) {
    const legalKeywords = [
        'law', 'legal', 'court', 'judge', 'justice', 'judiciary', 'judgment', 'verdict',
        'case', 'lawsuit', 'litigation', 'plaintiff', 'defendant', 'attorney', 'lawyer',
        'advocate', 'counsel', 'prosecution', 'defense', 'trial', 'hearing', 'appeal',
        'ipc', 'crpc', 'cpc', 'constitution', 'supreme court', 'high court', 'district court',
        'magistrate', 'bail', 'fir', 'police', 'evidence', 'witness', 'testimony',
        'section', 'act', 'amendment', 'statute', 'regulation', 'ordinance', 'bill',
        'code', 'rule', 'procedure', 'jurisdiction', 'precedent', 'case law',
        'criminal', 'civil', 'family', 'property', 'contract', 'tort', 'corporate',
        'tax', 'labor', 'environmental', 'human rights', 'constitutional', 'administrative',
        'guilty', 'innocent', 'conviction', 'acquittal', 'sentence', 'punishment',
        'fine', 'imprisonment', 'compensation', 'damages', 'injunction', 'writ',
        'supreme court of india', 'high court', 'subordinate court', 'tribunal',
        'legal aid', 'public interest litigation', 'pil', 'contempt of court',
        'what is', 'explain', 'definition', 'meaning', 'provision', 'legal provision',
        'legal right', 'legal duty', 'legal obligation', 'legal remedy'
    ];

    const queryLower = query.toLowerCase();

    const hasLegalKeywords = legalKeywords.some(keyword =>
        queryLower.includes(keyword.toLowerCase())
    );

    const hasSectionReference = /\b(section|sec|article|art)\s+\d+/i.test(queryLower);

    const hasCourtReference = /\b(supreme court|high court|district court|sessions court|family court)\b/i.test(queryLower);

    const hasLegalAbbreviations = /\b(ipc|crpc|cpc|sc|hc|pil|fir)\b/i.test(queryLower);

    return hasLegalKeywords || hasSectionReference || hasCourtReference || hasLegalAbbreviations;
}

// ─── Hugging Face API ─────────────────────────────────────────────────────────
async function callHuggingFaceAPI(query) {
    const systemPrompt = `You are STRICTLY a Judiciary AI Assistant specialized in Indian Law.

RULES:
1. Answer ONLY legal/judiciary questions.
2. If NOT legal → respond EXACTLY:
"This query is not related to judiciary. Please ask a legal question."
3. Do NOT answer general, coding, food, or casual queries.
4. Never break these rules.

STYLE:
- Professional
- Structured
- Clear explanations
- Use legal terminology where appropriate
- Provide examples from Indian law when relevant
- If applicable, cite relevant sections, acts, or case laws
- Avoid unnecessary verbosity

QUESTION:
${query}

RESPONSE:       `;

    const requestBody = {
        model: HF_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
        ],
        max_tokens: 800,
        temperature: 0.3,
        stream: false
    };

    try {
        const response = await fetch(HF_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${hf_api_key}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('API Error Status:', response.status);
            console.error('API Error Response:', errText);

            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait before retrying.');
            } else if (response.status === 401) {
                throw new Error('Invalid API key. Please check your Hugging Face token.');
            } else if (response.status === 404) {
                throw new Error('Model not found on HuggingFace router. Check model name.');
            } else if (response.status === 400) {
                throw new Error(`Bad request: ${errText}`);
            } else {
                throw new Error(`API error ${response.status}: ${errText}`);
            }
        }

        const data = await response.json();

        if (data?.choices?.length > 0) {
            const raw = data.choices[0].message.content;
            return { success: true, content: raw, model: currentModel };
        } else {
            throw new Error('No response from AI model');
        }
    } catch (err) {
        return { success: false, error: err.message || 'API call failed' };
    }
}

// ─── Add message to chat ──────────────────────────────────────────────────────
function addMessage(role, content) {
    if (conversationHistory.length >= MAX_CONVERSATION_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_LENGTH + 2);
        const msgs = chatMessages.querySelectorAll('.message');
        for (let i = 0; i < 2 && msgs[i]; i++) msgs[i].remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const avatarIcon = role === 'user' ? 'fa-user' : 'fa-balance-scale';

    const renderedContent = role === 'assistant'
        ? renderMarkdown(content)
        : `<p>${escapeHtml(content)}</p>`;

    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas ${avatarIcon}"></i>
        </div>
        <div class="message-content">
            <div class="message-body">${renderedContent}</div>
            <span class="timestamp">${timestamp}</span>
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    conversationHistory.push({ role, content, timestamp: new Date().toISOString() });
    saveConversationToStorage();
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Loading indicator ────────────────────────────────────────────────────────
function showLoading(show) {
    if (show) {
        const div = document.createElement('div');
        div.className = 'message assistant loading-message';
        div.id = 'loadingMessage';
        div.innerHTML = `
            <div class="message-avatar loading">
                <i class="fas fa-balance-scale"></i>
            </div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
        const el = document.getElementById('loadingMessage');
        if (el) el.remove();
    }
}

// ─── Error modal ──────────────────────────────────────────────────────────────
function showError(message) {
    if (!errorMessage || !errorModal) return;
    errorMessage.textContent = message;
    errorModal.style.display = 'flex';
}

function closeErrorModal() {
    if (!errorModal) return;
    errorModal.style.display = 'none';
}

// ─── Clear chat ───────────────────────────────────────────────────────────────
function clearChat() {
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-content">
                <div class="welcome-icon">
                    <i class="fas fa-balance-scale"></i>
                </div>
                <h2>Welcome to Legal AI Assistant</h2>
                <p>Your professional legal research companion. Ask me anything about Indian laws, legal provisions, case laws, and judicial procedures.</p>
                <div class="quick-questions">
                    <h3>Popular Questions</h3>
                    <div class="question-chips">
                        <button class="question-chip" data-query="Explain Section 420 IPC">
                            <i class="fas fa-gavel"></i><span>Section 420 IPC</span>
                        </button>
                        <button class="question-chip" data-query="What is criminal breach of trust?">
                            <i class="fas fa-shield-alt"></i><span>Criminal Breach of Trust</span>
                        </button>
                        <button class="question-chip" data-query="Explain property rights in India">
                            <i class="fas fa-home"></i><span>Property Rights</span>
                        </button>
                        <button class="question-chip" data-query="What is bail and its types?">
                            <i class="fas fa-key"></i><span>Bail Types</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('.question-chip').forEach(chip => {
        chip.addEventListener('click', function () {
            const query = this.getAttribute('data-query');
            if (chatInput) {
                chatInput.value = query;
                updateCharCount();
                handleSendMessage();
            }
        });
    });

    conversationHistory = [];
    localStorage.removeItem('legalChatHistory');
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function saveConversationToStorage() {
    try { localStorage.setItem('legalChatHistory', JSON.stringify(conversationHistory)); }
    catch (e) { console.error('Save error:', e); }
}

function loadConversationFromStorage() {
    try {
        const saved = localStorage.getItem('legalChatHistory');
        if (saved) {
            const history = JSON.parse(saved);
            conversationHistory = [];
            const welcome = chatMessages.querySelector('.welcome-message');
            if (welcome && history.length > 0) welcome.style.display = 'none';
            history.forEach(msg => addMessage(msg.role, msg.content));
        }
    } catch (e) { console.error('Load error:', e); }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeErrorModal();
});