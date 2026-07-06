import {
  getLegalAdvice,
  registerUser,
  loginUser,
  getCurrentUser,
  getConversations,
  getConversationDetails,
  deleteConversation,
  getCourtroomSessions,
  getCourtroomSessionDetails,
  getDocuments,
  getDocumentDetails,
  analyzeDocument
} from './utils/api.js';

let currentUser = null;
let currentTranslations = {};
let activeTab = 'advisorTab';
let isAnimating = false;
let advisorAbortController = null;
let courtroomAbortController = null;
let documentAbortController = null;
let activeConversationId = null;

// --- DOM Elements ---
const tabLinks = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');
const languageSelect = document.getElementById('languageSelect');

// Sidebar DOM
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const historySidebar = document.getElementById('historySidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarPlaceholder = document.getElementById('sidebarPlaceholder');
const sidebarLists = document.getElementById('sidebarLists');
const conversationHistoryList = document.getElementById('conversationHistoryList');
const courtroomHistoryList = document.getElementById('courtroomHistoryList');
const documentHistoryList = document.getElementById('documentHistoryList');

// Auth DOM
const navSignInBtn = document.getElementById('navSignInBtn');
const navUserBadge = document.getElementById('navUserBadge');
const navUsername = document.getElementById('navUsername');
const navSignOutBtn = document.getElementById('navSignOutBtn');
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const closeRegisterBtn = document.getElementById('closeRegisterBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toRegisterLink = document.getElementById('toRegisterLink');
const toLoginLink = document.getElementById('toLoginLink');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

// Welcome & Tour DOM
const welcomeModal = document.getElementById('welcomeModal');
const closeWelcomeBtn = document.getElementById('closeWelcomeBtn');
const welcomeStartBtn = document.getElementById('welcomeStartBtn');
const welcomeTourBtn = document.getElementById('welcomeTourBtn');
const startTourBtn = document.getElementById('startTourBtn');

// Tab 1: Advisor DOM
const advisorInput = document.getElementById('advisorInput');
const advisorCharCounter = document.getElementById('advisorCharCounter');
const advisorAnalyzeBtn = document.getElementById('advisorAnalyzeBtn');
const advisorClearBtn = document.getElementById('advisorClearBtn');
const advisorPdfBtn = document.getElementById('advisorPdfBtn');
const advisorLoading = document.getElementById('advisorLoading');
const advisorResult = document.getElementById('advisorResult');
const promptButtons = document.querySelectorAll('.prompt-btn');

// Tab 2: Courtroom DOM
const courtroomInput = document.getElementById('courtroomInput');
const courtroomCharCounter = document.getElementById('courtroomCharCounter');
const courtroomSimulateBtn = document.getElementById('courtroomSimulateBtn');
const courtroomClearBtn = document.getElementById('courtroomClearBtn');
const courtroomPdfBtn = document.getElementById('courtroomPdfBtn');
const courtroomLoading = document.getElementById('courtroomLoading');
const courtroomChat = document.getElementById('courtroomChat');

// Tab 3: Document Auditor DOM
const dropzone = document.getElementById('dropzone');
const fileUploadInput = document.getElementById('fileUploadInput');
const selectedFilename = document.getElementById('selectedFilename');
const documentTextInput = document.getElementById('documentTextInput');
const documentAuditBtn = document.getElementById('documentAuditBtn');
const documentClearBtn = document.getElementById('documentClearBtn');
const documentLoading = document.getElementById('documentLoading');
const documentResult = document.getElementById('documentResult');
const docSummaryText = document.getElementById('docSummaryText');
const docRisksList = document.getElementById('docRisksList');
const docClausesList = document.getElementById('docClausesList');
const docPdfBtn = document.getElementById('docPdfBtn');

// Visitor Count
const visitorCountEl = document.getElementById('visitorCount');

// -------------------------------------------------------------
// DYNAMIC TRANSLATION SYSTEM
// -------------------------------------------------------------
async function initTranslations() {
  const savedLang = localStorage.getItem('preferredLanguage') || 'English';
  if (languageSelect) languageSelect.value = savedLang;
  await loadLanguage(savedLang);
}

async function loadLanguage(lang) {
  let file = 'en';
  if (lang === 'Hindi') file = 'hi';
  else if (lang === 'Telugu') file = 'te';
  else if (lang === 'Kannada') file = 'kn';

  try {
    const res = await fetch(`./src/lang/${file}.json`);
    currentTranslations = await res.json();
    translateDOM();
  } catch (err) {
    console.error('Failed to load translations:', err);
  }
}

function translateDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (currentTranslations[key]) {
      // Preserve inner HTML structure if elements contain formatting tags
      if (el.querySelector('i') || el.querySelector('span')) {
        const icon = el.querySelector('i')?.outerHTML || '';
        const badge = el.querySelector('.spinner')?.outerHTML || '';
        el.innerHTML = `${icon} <span>${currentTranslations[key]}</span>${badge}`;
      } else {
        el.textContent = currentTranslations[key];
      }
    }
  });

  // Handle placeholders
  if (advisorInput && currentTranslations['inputPlaceholder']) {
    advisorInput.placeholder = currentTranslations['inputPlaceholder'];
  }
  if (courtroomInput && currentTranslations['inputPlaceholder']) {
    courtroomInput.placeholder = currentTranslations['inputPlaceholder'];
  }
}

if (languageSelect) {
  languageSelect.addEventListener('change', async (e) => {
    const newLang = e.target.value;
    localStorage.setItem('preferredLanguage', newLang);
    await loadLanguage(newLang);
  });
}

// -------------------------------------------------------------
// TAB SYSTEM
// -------------------------------------------------------------
tabLinks.forEach(link => {
  link.addEventListener('click', () => {
    const targetTab = link.getAttribute('data-tab');
    switchTab(targetTab);
  });
});

function switchTab(tabId) {
  if (isAnimating) {
    alert('Please wait until AI completes processing.');
    return;
  }
  activeTab = tabId;
  tabLinks.forEach(l => {
    if (l.getAttribute('data-tab') === tabId) {
      l.classList.add('active');
    } else {
      l.classList.remove('active');
    }
  });
  tabContents.forEach(content => {
    if (content.id === tabId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// -------------------------------------------------------------
// TEXT FORMATTERS (STATUTORY CITATIONS & METERS)
// -------------------------------------------------------------
function formatLegalText(text) {
  let formatted = text
    .replace(/(?:📋\s*)?COVER HEADING:/gi,
      `<div class="report-section cover-heading-block"><div class="report-body">`)
    .replace(/(?:📝\s*)?EXECUTIVE SUMMARY:/gi,
      `</div></div><div class="report-section exec-summary-block">
        <header><i class="fas fa-file-alt"></i> <span>1. Executive Summary</span></header><div class="report-body">`)
    .replace(/(?:👤\s*)?CLIENT INSTRUCTIONS:/gi,
      `</div></div><div class="report-section client-instructions-block">
        <header><i class="fas fa-user-tie"></i> <span>2. Client Instructions</span></header><div class="report-body">`)
    .replace(/(?:📖\s*)?FACTS PRESENTED:/gi,
      `</div></div><div class="report-section facts-block">
        <header><i class="fas fa-paragraph"></i> <span>3. Facts Presented</span></header><div class="report-body">`)
    .replace(/(?:🔍\s*)?ISSUES FOR DETERMINATION:/gi,
      `</div></div><div class="report-section issues-block">
        <header><i class="fas fa-question-circle"></i> <span>4. Issues for Determination</span></header><div class="report-body">`)
    .replace(/(?:⚖️\s*)?APPLICABLE LAW:/gi,
      `</div></div><div class="report-section law-block">
        <header><i class="fas fa-balance-scale"></i> <span>5. Applicable Law</span></header><div class="report-body">`)
    .replace(/(?:🔬\s*)?DETAILED LEGAL ANALYSIS:/gi,
      `</div></div><div class="report-section analysis-block">
        <header><i class="fas fa-microscope"></i> <span>6. Detailed Legal Analysis</span></header><div class="report-body">`)
    .replace(/(?:🛡️\s*)?POSSIBLE DEFENCES:/gi,
      `</div></div><div class="report-section defences-block">
        <header><i class="fas fa-shield-alt"></i> <span>7. Possible Defences</span></header><div class="report-body">`)
    .replace(/(?:🧭\s*)?RECOMMENDED LITIGATION STRATEGY:/gi,
      `</div></div><div class="report-section strategy-block">
        <header><i class="fas fa-gavel"></i> <span>8. Recommended Litigation Strategy</span></header><div class="report-body">`)
    .replace(/(?:📊\s*)?REQUIRED EVIDENCE:/gi,
      `</div></div><div class="report-section evidence-block">
        <header><i class="fas fa-file-invoice"></i> <span>9. Required Evidence</span></header><div class="report-body">`)
    .replace(/(?:⏳\s*)?ESTIMATED TIMELINE:/gi,
      `</div></div><div class="report-section timeline-block">
        <header><i class="fas fa-clock"></i> <span>10. Estimated Timeline</span></header><div class="report-body">`)
    .replace(/(?:⚠️\s*)?ESTIMATED RISKS:/gi,
      `</div></div><div class="report-section risks-block">
        <header><i class="fas fa-exclamation-triangle"></i> <span>11. Estimated Risks</span></header><div class="report-body">`)
    .replace(/(?:📈\s*)?POSSIBLE OUTCOMES:/gi,
      `</div></div><div class="report-section outcomes-block">
        <header><i class="fas fa-chart-line"></i> <span>12. Possible Outcomes</span></header><div class="report-body">`)
    .replace(/(?:⚡\s*)?IMMEDIATE ACTIONS:/gi,
      `</div></div><div class="report-section actions-block">
        <header><i class="fas fa-bolt"></i> <span>13. Immediate Actions</span></header><div class="report-body">`)
    .replace(/(?:🏁\s*)?CONCLUSION:/gi,
      `</div></div><div class="report-section conclusion-block">
        <header><i class="fas fa-flag-checkered"></i> <span>14. Conclusion</span></header><div class="report-body">`)
    .replace(/(?:⚖️\s*)?LEGAL DISCLAIMER:/gi,
      `</div></div><div class="report-section disclaimer-block">
        <header><i class="fas fa-exclamation-triangle"></i> <span>Legal Disclaimer</span></header><div class="report-body">`)
    .replace(/(?:✍️\s*)?SIGNATURE BLOCK:/gi,
      `</div></div><div class="report-section signature-block"><div class="report-body">`);

  if (!formatted.startsWith('<div class="report-section')) {
    formatted = '<div class="report-section general-block"><div class="report-body"> ' + formatted;
  }
  formatted += '</div></div>';
  formatted = formatted.replace(/<\/div><\/div>\s*<\/div><\/div>/g, '</div></div>');

  // Markdown Bold Formatting
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Simple markdown table parser
  formatted = formatted.replace(/(\|[^\n]+\|\r?\n)((?:\|:?---?:?)+\|)\r?\n((?:\|[^\n]+\|\r?\n?)+)/g, (match, headerRow, separatorRow, bodyRows) => {
    const headers = headerRow.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
    const bodyLines = bodyRows.split('\n').filter(l => l.trim().startsWith('|'));
    
    let tableHtml = '<div class="table-container"><table class="legal-table"><thead><tr>';
    headers.forEach(h => {
      tableHtml += `<th>${h}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    bodyLines.forEach(line => {
      const cells = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableHtml += '<tr>';
      cells.forEach(c => {
        tableHtml += `<td>${c}</td>`;
      });
      tableHtml += '</tr>';
    });
    
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  formatted = formatted
    .replace(/Level:\s*(WEAK|MEDIUM|STRONG)/gi, (match, p1) => {
      const level = p1.toLowerCase();
      return `<div class="strength-container"><div class="strength-fill ${level}"></div></div><div class="strength-label ${level}">Case Strength: ${p1.toUpperCase()}</div>`;
    })
    .replace(/(Section\s\d+[A-Z]?):/g, '<strong class="highlight-section">$1:</strong>')
    .replace(/Under ([\w\s]+, \d{4}):/g, '<br><strong class="law-context">Under $1:</strong>')
    .replace(/Indian Penal Code, Section (\d+[A-Z]?):/g, '<br><strong class="ipc-highlight">IPC Section $1:</strong>')
    .replace(/\n(.*)/g, '<br>$1');

  return formatted;
}

// -------------------------------------------------------------
// COURTROOM TRIAL ANIMATOR
// -------------------------------------------------------------
function parseSimulationResponse(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentBlock = null;

  for (let line of lines) {
    const lowerLine = line.toLowerCase().trim();
    if (!lowerLine && !currentBlock) continue;
    
    let isHeader = false;
    let role = '';
    
    if (lowerLine.includes("petitioner counsel") && lowerLine.includes("rebuttal")) {
      isHeader = true; role = 'lawyer-user';
    } else if (lowerLine.includes("respondent counsel") && lowerLine.includes("final")) {
      isHeader = true; role = 'lawyer-defender';
    } else if (lowerLine.includes("petitioner counsel")) {
      isHeader = true; role = 'lawyer-user';
    } else if (lowerLine.includes("respondent counsel")) {
      isHeader = true; role = 'lawyer-defender';
    } else if (lowerLine.includes("final judgment")) {
      isHeader = true; role = 'final-verdict';
    } else if (/^(?:👨‍⚖️|⚖️|🏁)/.test(lowerLine) && lowerLine.endsWith(':')) {
      isHeader = true;
      role = lowerLine.includes('👨‍⚖️') ? 'lawyer-user' : lowerLine.includes('🏁') ? 'final-verdict' : 'lawyer-defender';
    }

    if (isHeader) {
      if (currentBlock) {
        currentBlock.content = currentBlock.content.trim();
        blocks.push(currentBlock);
      }
      currentBlock = { role: role, title: line.trim(), content: '' };
    } else {
      if (currentBlock) {
        currentBlock.content += line + '\n';
      } else if (line.trim()) {
        currentBlock = { role: 'lawyer-user', title: "👨‍⚖️ Petitioner Counsel:", content: line + '\n' };
      }
    }
  }
  
  if (currentBlock && currentBlock.content.trim()) {
    currentBlock.content = currentBlock.content.trim();
    blocks.push(currentBlock);
  }
  
  return blocks.length > 0 ? blocks : [{ role: 'lawyer-user', title: 'Simulation Output:', content: text }];
}

function initCourtroomStage() {
  courtroomChat.innerHTML = `
    <div class="court-stage">
      <!-- Top Bench -->
      <div class="court-bench">
        <div class="panel judge-panel">
          <div class="gavel-box"><i class="fas fa-gavel"></i></div>
          <div class="panel-header">👨‍⚖️ Presiding Judge</div>
          <div class="judge-status" id="judgeStatus">Waiting for Trial...</div>
          <div class="judge-text" id="judgeText">The courtroom is in session. Present case facts to begin.</div>
        </div>
      </div>

      <!-- Middle Counsels -->
      <div class="court-counsels">
        <div class="panel counsel-panel prosecution" id="prosecutionPanel">
          <div class="panel-header"><i class="fas fa-balance-scale"></i> Petitioner Counsel</div>
          <div class="counsel-arguments" id="prosecutionArgs"></div>
        </div>
        <div class="panel counsel-panel defense" id="defensePanel">
          <div class="panel-header"><i class="fas fa-shield-alt"></i> Respondent Counsel</div>
          <div class="counsel-arguments" id="defenseArgs"></div>
        </div>
      </div>

      <!-- Bottom Arena -->
      <div class="court-arena">
        <div class="arena-left-group">
          <div class="panel arena-panel witness" id="witnessPanel">
            <div class="panel-header"><i class="fas fa-user-friends"></i> Witness Stand</div>
            <div class="panel-content" id="witnessContent">No witnesses called.</div>
          </div>
          <div class="panel arena-panel evidence" id="evidencePanel">
            <div class="panel-header"><i class="fas fa-folder-open"></i> Evidence Panel</div>
            <div class="panel-content" id="evidenceContent">No exhibits marked.</div>
          </div>
        </div>
        
        <div class="panel arena-panel timeline" id="timelinePanel">
          <div class="panel-header"><i class="fas fa-clock"></i> Timeline of Proceedings</div>
          <div class="timeline-content" id="timelineContent">
            <div class="timeline-empty">Waiting for trial to initiate...</div>
          </div>
        </div>
      </div>

      <!-- Verdict Area -->
      <div class="court-verdict" id="verdictPanel" style="display: none;">
        <div class="verdict-header">🏁 OFFICIAL JUDICIAL VERDICT</div>
        <div class="verdict-body" id="verdictBody"></div>
      </div>
    </div>
  `;
}

function populateCourtroomStage(caseFacts, argumentsList, verdictText) {
  initCourtroomStage();
  courtroomChat.style.display = 'block';
  
  const judgeStatus = document.getElementById('judgeStatus');
  const judgeText = document.getElementById('judgeText');
  const prosecutionArgs = document.getElementById('prosecutionArgs');
  const defenseArgs = document.getElementById('defenseArgs');
  const witnessContent = document.getElementById('witnessContent');
  const evidenceContent = document.getElementById('evidenceContent');
  const verdictPanel = document.getElementById('verdictPanel');
  const verdictBody = document.getElementById('verdictBody');
  const timelineContent = document.getElementById('timelineContent');
  
  timelineContent.innerHTML = '';
  
  function addTimelineEventSync(description, icon = 'fa-info-circle') {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-icon"><i class="fas ${icon}"></i></div>
      <div class="timeline-details">
        <span class="timeline-time">Trial Archive</span>
        <span class="timeline-desc">${description}</span>
      </div>
    `;
    timelineContent.appendChild(item);
  }

  addTimelineEventSync('Case Facts loaded from archive.', 'fa-archive');

  argumentsList.forEach(arg => {
    const isUser = arg.role === 'lawyer-user' || arg.role === 'lawyer-user-rebuttal' || arg.role === 'petitioner-counsel' || arg.title.toLowerCase().includes('petitioner');
    const targetContainer = isUser ? prosecutionArgs : defenseArgs;
    
    // Extract witness
    const witnessMatch = arg.content.match(/(?:Witness|Witness Stand):\s*(.*?)(?=\n|$)/i);
    if (witnessMatch) {
      const witnessText = witnessMatch[1].trim();
      if (witnessContent.textContent.includes('No witnesses')) witnessContent.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'witness-card';
      card.innerHTML = `<i class="fas fa-user-tie"></i> <span>${witnessText}</span>`;
      witnessContent.appendChild(card);
      addTimelineEventSync(`Witness sworn: ${witnessText}`, 'fa-user-tie');
    }

    // Extract evidence
    const evidenceMatch = arg.content.match(/(?:Evidence|Exhibit):\s*(.*?)(?=\n|$)/i);
    if (evidenceMatch) {
      const evidenceText = evidenceMatch[1].trim();
      if (evidenceContent.textContent.includes('No exhibits')) evidenceContent.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'evidence-card';
      card.innerHTML = `<i class="fas fa-file-invoice"></i> <span>${evidenceText}</span>`;
      evidenceContent.appendChild(card);
      addTimelineEventSync(`Exhibit marked: ${evidenceText}`, 'fa-file-invoice');
    }

    let cleanContent = arg.content
       .replace(/(?:Witness|Witness Stand):\s*(.*?)(?=\n|$)/gi, '')
       .replace(/(?:Evidence|Exhibit):\s*(.*?)(?=\n|$)/gi, '')
       .trim();

    let formattedContent = cleanContent
       .replace(/\n/g, '<br>')
       .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const bubble = document.createElement('div');
    bubble.className = `chat-message ${isUser ? 'lawyer-user' : 'lawyer-defender'}`;
    bubble.innerHTML = `<strong style="display:block; margin-bottom: 6px;">${arg.title}</strong>${formattedContent}`;
    targetContainer.appendChild(bubble);

    // Add timeline log
    if (isUser) {
      addTimelineEventSync(arg.title.includes('Rebuttal') ? 'Petitioner Rebuttal submitted.' : 'Petitioner Counsel argues.', 'fa-gavel');
    } else {
      addTimelineEventSync(arg.title.includes('Final') ? 'Respondent Final argument submitted.' : 'Respondent Counsel defense entered.', 'fa-shield-alt');
    }
  });

  if (verdictText) {
    judgeText.textContent = 'Arguments concluded. Case verdict retrieved from archive.';
    verdictBody.innerHTML = verdictText
       .replace(/\n/g, '<br>')
       .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    verdictPanel.style.display = 'block';
    judgeStatus.textContent = '🏁 CASE RESOLVED - FINAL DECISION PUBLISHED';
    judgeStatus.style.color = 'var(--text-muted)';
    addTimelineEventSync('Case verdict delivered.', 'fa-balance-scale');
  }
}

async function playSimulationSequence(blocks, signal) {
  initCourtroomStage();
  courtroomChat.style.display = 'block'; // Block mode for stage grid layout

  const judgeStatus = document.getElementById('judgeStatus');
  const judgeText = document.getElementById('judgeText');
  const prosecutionArgs = document.getElementById('prosecutionArgs');
  const defenseArgs = document.getElementById('defenseArgs');
  const witnessContent = document.getElementById('witnessContent');
  const evidenceContent = document.getElementById('evidenceContent');
  const verdictPanel = document.getElementById('verdictPanel');
  const verdictBody = document.getElementById('verdictBody');
  const timelineContent = document.getElementById('timelineContent');

  timelineContent.innerHTML = '';

  function addTimelineEvent(description, icon = 'fa-info-circle') {
    if (timelineContent.querySelector('.timeline-empty')) {
      timelineContent.innerHTML = '';
    }
    const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const item = document.createElement('div');
    item.className = 'timeline-item slide-in-up';
    item.innerHTML = `
      <div class="timeline-icon"><i class="fas ${icon}"></i></div>
      <div class="timeline-details">
        <span class="timeline-time">${timeString}</span>
        <span class="timeline-desc">${description}</span>
      </div>
    `;
    timelineContent.appendChild(item);
    timelineContent.scrollTop = timelineContent.scrollHeight;
  }

  addTimelineEvent('Trial commenced. Court in session.', 'fa-play');

  for (let block of blocks) {
    if (!isAnimating || (signal && signal.aborted)) break;

    const isUser = block.role === 'lawyer-user';
    const isVerdict = block.role === 'final-verdict';
    const targetContainer = isUser ? prosecutionArgs : (isVerdict ? null : defenseArgs);

    // 1. Dynamic Judge State
    if (isVerdict) {
      judgeStatus.textContent = '⚖️ DELIVERING FINAL JUDGMENT...';
      judgeStatus.style.color = 'var(--success)';
      addTimelineEvent('Judge is preparing final verdict judgment.', 'fa-balance-scale');
    } else {
      judgeStatus.textContent = isUser 
        ? '🔊 LISTENING TO PETITIONER COUNSEL...' 
        : '🔊 LISTENING TO RESPONDENT COUNSEL...';
      judgeStatus.style.color = isUser ? 'var(--primary-color)' : 'var(--error)';
      
      const isRebuttal = block.title.toLowerCase().includes('rebuttal');
      const isFinal = block.title.toLowerCase().includes('final');
      
      if (isUser) {
        addTimelineEvent(isRebuttal ? 'Petitioner Counsel begins rebuttal arguments.' : 'Petitioner Counsel begins presenting oral arguments.', 'fa-gavel');
      } else {
        addTimelineEvent(isFinal ? 'Respondent Counsel begins closing arguments.' : 'Respondent Counsel begins defense statement.', 'fa-shield-alt');
      }
    }

    // 2. Typing Indicator in targeted Pod
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = `<span></span><span></span><span></span>`;
    
    if (isVerdict) {
      judgeText.innerHTML = '';
      judgeText.appendChild(typingDiv);
    } else if (targetContainer) {
      targetContainer.appendChild(typingDiv);
    }
    
    scrollToBottom(courtroomChat);
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (!isAnimating || (signal && signal.aborted)) break;
    typingDiv.remove();

    // 3. Extract Witnesses & Evidence
    const witnessMatch = block.content.match(/(?:Witness|Witness Stand):\s*(.*?)(?=\n|$)/i);
    if (witnessMatch) {
      const witnessText = witnessMatch[1].trim();
      if (witnessContent.textContent.includes('No witnesses')) {
        witnessContent.innerHTML = '';
      }
      const card = document.createElement('div');
      card.className = 'witness-card slide-in-up';
      card.innerHTML = `<i class="fas fa-user-tie"></i> <span>${witnessText}</span>`;
      witnessContent.appendChild(card);
      addTimelineEvent(`Witness sworn in: ${witnessText}`, 'fa-user-tie');
    }

    const evidenceMatch = block.content.match(/(?:Evidence|Exhibit):\s*(.*?)(?=\n|$)/i);
    if (evidenceMatch) {
      const evidenceText = evidenceMatch[1].trim();
      if (evidenceContent.textContent.includes('No exhibits')) {
        evidenceContent.innerHTML = '';
      }
      const card = document.createElement('div');
      card.className = 'evidence-card slide-in-up';
      card.innerHTML = `<i class="fas fa-file-invoice"></i> <span>${evidenceText}</span>`;
      evidenceContent.appendChild(card);
      addTimelineEvent(`Exhibit marked in evidence: ${evidenceText}`, 'fa-file-invoice');
    }

    // 4. Content Formatting
    let cleanContent = block.content
       .replace(/(?:Witness|Witness Stand):\s*(.*?)(?=\n|$)/gi, '')
       .replace(/(?:Evidence|Exhibit):\s*(.*?)(?=\n|$)/gi, '')
       .trim();

    let formattedContent = cleanContent
       .replace(/\n/g, '<br>')
       .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 5. Append text
    if (isVerdict) {
      judgeText.textContent = 'Arguments concluded. Trial adjourned. Case judgment published below.';
      verdictBody.innerHTML = formattedContent;
      verdictPanel.style.display = 'block';
      verdictPanel.classList.add('slide-in-up');
      judgeStatus.textContent = '🏁 CASE RESOLVED - FINAL DECISION PUBLISHED';
      judgeStatus.style.color = 'var(--text-muted)';
      addTimelineEvent('Final Judgment published and trial adjourned.', 'fa-flag-checkered');
    } else if (targetContainer) {
      const bubble = document.createElement('div');
      bubble.className = `chat-message ${block.role} slide-in-up`;
      bubble.innerHTML = `<strong style="display:block; margin-bottom: 6px;">${block.title}</strong>${formattedContent}`;
      targetContainer.appendChild(bubble);
      addTimelineEvent(isUser ? 'Petitioner arguments recorded in transcript.' : 'Respondent defense arguments recorded in transcript.', 'fa-file-alt');
    }
    
    scrollToBottom(courtroomChat);
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

// -------------------------------------------------------------
// SMOOTH SCROLL HELPERS & FRIENDLY ERROR MAPPER
// -------------------------------------------------------------
function smoothScrollTo(element, offset = 80) {
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function getFriendlyError(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = (error.message || '').toLowerCase();

  if (error.name === 'AbortError') return null; // caller handles abort

  if (msg.includes('timeout') || msg.includes('timed out'))
    return '⏱️ The request timed out. The AI may be under high load — please try again in a moment.';

  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota'))
    return '🚦 AI service rate limit reached. Please wait a few seconds and try again.';

  if (msg.includes('500') || msg.includes('internal server'))
    return '🔧 The server encountered an internal error. Please try again shortly.';

  if (msg.includes('503') || msg.includes('service unavailable'))
    return '☁️ The AI service is temporarily unavailable. Please try again in a minute.';

  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror'))
    return '🌐 Network error — please check your internet connection and try again.';

  if (msg.includes('incomplete') || msg.includes('truncated'))
    return '⚠️ The AI response was incomplete. Please try again — the system will attempt a fresh generation.';

  if (msg.includes('api key') || msg.includes('authentication') || msg.includes('unauthorized'))
    return '🔑 API authentication failed. Please contact support if this continues.';

  // Return the raw message if it's already user-friendly (short & no stack trace noise)
  if (error.message && error.message.length < 200 && !error.message.includes('at '))
    return `❌ ${error.message}`;

  return '❌ Something went wrong. Please try again. If the issue persists, refresh the page.';
}

// -------------------------------------------------------------
// ADVISOR AND COURTROOM SUBMISSIONS
// -------------------------------------------------------------
async function handleAdvisorSubmit() {
  const text = advisorInput.value.trim();
  if (!text) {
    alert(currentTranslations['inputRequired'] || 'Please enter details of your case.');
    return;
  }

  isAnimating = true;
  advisorAnalyzeBtn.disabled = true;
  advisorPdfBtn.disabled = true;
  advisorResult.style.display = 'none';
  advisorResult.innerHTML = '';
  advisorLoading.style.display = 'block';

  // ✅ Auto-scroll: take the user to the loading indicator immediately
  smoothScrollTo(advisorLoading);

  // Update button text
  advisorAnalyzeBtn.querySelector('.btn-text').textContent = currentTranslations['analyzing'] || 'Analyzing...';
  advisorAnalyzeBtn.querySelector('.spinner').style.display = 'inline-block';
  advisorAbortController = new AbortController();

  try {
    const response = await getLegalAdvice({
      message: text,
      mode: 'normal',
      language: languageSelect.value,
      conversationId: activeConversationId,
      signal: advisorAbortController.signal
    });

    advisorResult.innerHTML = formatLegalText(response.answer);
    advisorResult.style.display = 'block';
    
    if (response.conversationId) {
      activeConversationId = response.conversationId;
    }
    
    advisorPdfBtn.disabled = false;
    // ✅ Auto-scroll: bring completed report into view
    setTimeout(() => smoothScrollTo(advisorResult), 100);
    // Reload sidebar if user is logged in
    if (currentUser) loadHistory();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    const friendly = getFriendlyError(error);
    advisorResult.innerHTML = `<div class="error-message">${friendly}</div>`;
    advisorResult.style.display = 'block';
    // ✅ Auto-scroll: show error to user
    setTimeout(() => smoothScrollTo(advisorResult), 100);
  } finally {
    isAnimating = false;
    advisorAnalyzeBtn.disabled = false;
    advisorAnalyzeBtn.querySelector('.btn-text').textContent = currentTranslations['btnAnalyze'] || 'Analyze Situation';
    advisorAnalyzeBtn.querySelector('.spinner').style.display = 'none';
    advisorLoading.style.display = 'none';
  }
}

async function handleCourtroomSubmit() {
  const text = courtroomInput.value.trim();
  if (!text) {
    alert('Please enter facts of the dispute to simulate.');
    return;
  }

  isAnimating = true;
  courtroomSimulateBtn.disabled = true;
  courtroomPdfBtn.disabled = true;
  courtroomChat.style.display = 'none';
  courtroomChat.innerHTML = '';
  courtroomLoading.style.display = 'block';

  // ✅ Auto-scroll: take the user to the loading indicator immediately
  smoothScrollTo(courtroomLoading);

  courtroomSimulateBtn.querySelector('.btn-text').textContent = 'Debating...';
  courtroomSimulateBtn.querySelector('.spinner').style.display = 'inline-block';

  courtroomAbortController = new AbortController();

  try {
    const response = await getLegalAdvice({
      message: text,
      mode: 'courtroom',
      language: languageSelect.value,
      signal: courtroomAbortController.signal
    });

    courtroomLoading.style.display = 'none';
    courtroomChat.style.display = 'flex';
    
    // Create initial user case bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-message lawyer-user';
    userBubble.innerHTML = `<strong>Case Fact Outline:</strong><br>${text}`;
    courtroomChat.appendChild(userBubble);

    // ✅ Auto-scroll: bring courtroom chat into view before animation begins
    setTimeout(() => smoothScrollTo(courtroomChat), 100);

    const blocks = parseSimulationResponse(response.answer);
    await playSimulationSequence(blocks, courtroomAbortController.signal);

    courtroomPdfBtn.disabled = false;
    if (currentUser) loadHistory();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    const friendly = getFriendlyError(error);
    courtroomLoading.style.display = 'none';
    courtroomChat.style.display = 'flex';
    courtroomChat.innerHTML = `<div class="error-message">${friendly}</div>`;
    // ✅ Auto-scroll: show error to user
    setTimeout(() => smoothScrollTo(courtroomChat), 100);
  } finally {
    isAnimating = false;
    courtroomSimulateBtn.disabled = false;
    courtroomSimulateBtn.querySelector('.btn-text').textContent = currentTranslations['btnSimulate'] || 'Simulate Trial';
    courtroomSimulateBtn.querySelector('.spinner').style.display = 'none';
    courtroomLoading.style.display = 'none';
  }
}

advisorAnalyzeBtn.addEventListener('click', handleAdvisorSubmit);
courtroomSimulateBtn.addEventListener('click', handleCourtroomSubmit);

// -------------------------------------------------------------
// TAB 3: DOCUMENT AUDITOR CONTROLLER
// -------------------------------------------------------------
function setupDropzone() {
  dropzone.addEventListener('click', () => fileUploadInput.click());

  fileUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleSelectedFile(file);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleSelectedFile(file);
  });
}

function handleSelectedFile(file) {
  if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
    alert('LexAI Document auditor currently supports plain .txt files only. Paste formatting otherwise.');
    return;
  }

  selectedFilename.textContent = `Selected: ${file.name}`;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    documentTextInput.value = e.target.result;
    // Dispatch input event to refresh lengths if necessary
    documentTextInput.dispatchEvent(new Event('input'));
  };
  reader.readAsText(file);
}

async function handleDocumentAuditSubmit() {
  const content = documentTextInput.value.trim();
  if (!content) {
    alert('Please paste the contract text or drop a file first.');
    return;
  }

  isAnimating = true;
  documentAuditBtn.disabled = true;
  documentResult.style.display = 'none';
  documentLoading.style.display = 'block';

  // ✅ Auto-scroll: take the user to the loading indicator immediately
  smoothScrollTo(documentLoading);

  documentAuditBtn.querySelector('.btn-text').textContent = 'Auditing...';
  documentAuditBtn.querySelector('.spinner').style.display = 'inline-block';

  documentAbortController = new AbortController();

  try {
    const filename = fileUploadInput.files[0]?.name || 'Pasted_Contract.txt';
    const response = await analyzeDocument({
      filename,
      content,
      signal: documentAbortController.signal
    });

    const report = response.analysis;
    docSummaryText.textContent = report.summary;
    
    // Clear list grids
    docRisksList.innerHTML = '';
    docClausesList.innerHTML = '';

    report.risks.forEach(risk => {
      const li = document.createElement('li');
      li.textContent = risk;
      docRisksList.appendChild(li);
    });

    report.clauses.forEach(clause => {
      const li = document.createElement('li');
      li.textContent = clause;
      docClausesList.appendChild(li);
    });

    documentLoading.style.display = 'none';
    documentResult.style.display = 'block';

    // ✅ Auto-scroll: bring completed audit report into view
    setTimeout(() => smoothScrollTo(documentResult), 100);
    if (currentUser) loadHistory();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    const friendly = getFriendlyError(error);
    
    // Clear list grids
    docSummaryText.textContent = '';
    docRisksList.innerHTML = '';
    docClausesList.innerHTML = '';

    // Render friendly error message inside the result area
    docSummaryText.innerHTML = `<div class="error-message" style="margin: 0; padding: 1rem; border-radius: 6px; border: 1px solid var(--error); background: rgba(255, 23, 68, 0.05); color: var(--error);">${friendly}</div>`;
    
    documentLoading.style.display = 'none';
    documentResult.style.display = 'block';
    // ✅ Auto-scroll: show error to user
    setTimeout(() => smoothScrollTo(documentResult), 100);
  } finally {
    isAnimating = false;
    documentAuditBtn.disabled = false;
    documentAuditBtn.querySelector('.btn-text').textContent = currentTranslations['btnAudit'] || 'Audit Document';
    documentAuditBtn.querySelector('.spinner').style.display = 'none';
    documentLoading.style.display = 'none';
  }
}

documentAuditBtn.addEventListener('click', handleDocumentAuditSubmit);

// -------------------------------------------------------------
// CLEAR TEXT TRIGGERS
// -------------------------------------------------------------
advisorClearBtn.addEventListener('click', () => {
  advisorInput.value = '';
  advisorResult.style.display = 'none';
  advisorResult.innerHTML = '';
  advisorCharCounter.textContent = '0 / 2000';
  advisorPdfBtn.disabled = true;
  activeConversationId = null;
});

courtroomClearBtn.addEventListener('click', () => {
  courtroomInput.value = '';
  courtroomChat.style.display = 'none';
  courtroomChat.innerHTML = '';
  courtroomCharCounter.textContent = '0 / 2000';
  courtroomPdfBtn.disabled = true;
});

documentClearBtn.addEventListener('click', () => {
  documentTextInput.value = '';
  fileUploadInput.value = '';
  selectedFilename.textContent = '';
  documentResult.style.display = 'none';
});

// -------------------------------------------------------------
// PREMIUM PDF EXPORTER — Document-native rendering (no screenshot)
// -------------------------------------------------------------
function setupPdfExportTriggers() {
  advisorPdfBtn.addEventListener('click', () => exportLegalPdf(advisorResult, 'LexAI_Legal_Opinion.pdf', 'advice'));
  courtroomPdfBtn.addEventListener('click', () => exportLegalPdf(courtroomChat, 'LexAI_Trial_Transcript.pdf', 'courtroom'));
  docPdfBtn.addEventListener('click', () => exportLegalPdf(documentResult, 'LexAI_Contract_Audit.pdf', 'audit'));
}

/**
 * Extracts text content from the result DOM nodes into structured blocks for PDF rendering.
 */
function extractContentBlocks(nodeElement, mode) {
  const blocks = [];

  if (mode === 'advice') {
    // Parse report-section divs
    const sections = nodeElement.querySelectorAll('.report-section');
    if (sections.length > 0) {
      sections.forEach(section => {
        const header = section.querySelector('header');
        const body = section.querySelector('.report-body');
        if (header) {
          blocks.push({ type: 'sectionHeader', text: header.textContent.trim() });
        }
        if (body) {
          // Get paragraphs, lists, strength meters
          body.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
              const t = child.textContent.trim();
              if (t) blocks.push({ type: 'body', text: t });
            } else if (child.tagName === 'BR') {
              // skip — handled by whitespace
            } else if (child.tagName === 'STRONG') {
              blocks.push({ type: 'bold', text: child.textContent.trim() });
            } else if (child.tagName === 'TABLE') {
              const rows = [];
              child.querySelectorAll('tr').forEach(tr => {
                const cells = [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim());
                rows.push(cells);
              });
              if (rows.length > 0) blocks.push({ type: 'table', rows });
            } else if (child.classList && child.classList.contains('strength-label')) {
              blocks.push({ type: 'bold', text: child.textContent.trim() });
            } else {
              const t = child.textContent.trim();
              if (t) blocks.push({ type: 'body', text: t });
            }
          });
        }
      });
    } else {
      // Fallback: plain text
      blocks.push({ type: 'body', text: nodeElement.innerText || nodeElement.textContent });
    }
  } else if (mode === 'courtroom') {
    const messages = nodeElement.querySelectorAll('.chat-message');
    messages.forEach(msg => {
      const strong = msg.querySelector('strong');
      if (strong) {
        blocks.push({ type: 'sectionHeader', text: strong.textContent.trim() });
      }
      const text = msg.innerText.replace(strong ? strong.textContent : '', '').trim();
      if (text) blocks.push({ type: 'body', text });
    });
    const verdict = nodeElement.querySelector('.verdict-panel, .final-verdict-panel');
    if (verdict) {
      blocks.push({ type: 'sectionHeader', text: '🏁 Final Judgment' });
      blocks.push({ type: 'body', text: verdict.innerText || verdict.textContent });
    }
  } else if (mode === 'audit') {
    // Summary
    const summary = document.getElementById('docSummaryText');
    if (summary && summary.textContent.trim()) {
      blocks.push({ type: 'sectionHeader', text: '📋 Document Summary' });
      blocks.push({ type: 'body', text: summary.textContent.trim() });
    }
    // Risks
    const risks = document.getElementById('docRisksList');
    if (risks) {
      const items = [...risks.querySelectorAll('li')].map(li => li.textContent.trim()).filter(Boolean);
      if (items.length) {
        blocks.push({ type: 'sectionHeader', text: '⚠️ Identified Risks' });
        items.forEach(r => blocks.push({ type: 'bullet', text: r }));
      }
    }
    // Clauses
    const clauses = document.getElementById('docClausesList');
    if (clauses) {
      const items = [...clauses.querySelectorAll('li')].map(li => li.textContent.trim()).filter(Boolean);
      if (items.length) {
        blocks.push({ type: 'sectionHeader', text: '📄 Key Clauses' });
        items.forEach(c => blocks.push({ type: 'bullet', text: c }));
      }
    }
  }

  return blocks;
}

/**
 * Generates and saves a premium professional legal PDF document.
 */
async function exportLegalPdf(nodeElement, filename, mode) {
  if (!nodeElement || nodeElement.style.display === 'none') {
    alert(currentTranslations['noAdviceToDownload'] || 'No content is currently loaded to export.');
    return;
  }

  // Show loading toast
  const loaderToast = document.createElement('div');
  loaderToast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;padding:14px 20px;background:#1E3A8A;color:#fff;border-radius:10px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;`;
  loaderToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building premium legal PDF...';
  document.body.appendChild(loaderToast);

  try {
    await new Promise(resolve => setTimeout(resolve, 80)); // allow repaint

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4'); // Use pt for precise typography

    // ── Page dimensions ───────────────────────────────────────────
    const PW = pdf.internal.pageSize.getWidth();   // 595.28 pt
    const PH = pdf.internal.pageSize.getHeight();  // 841.89 pt
    const ML = 56; // left margin
    const MR = 56; // right margin
    const MT = 80; // top margin (below header)
    const MB = 72; // bottom margin (above footer)
    const CW = PW - ML - MR; // content width

    // ── Colors ────────────────────────────────────────────────────
    const C = {
      paper:       [252, 251, 247], // #FCFBF7 ivory
      bodyText:    [17,  17,  17],  // #111111
      headingText: [15,  23,  42],  // #0F172A
      accent:      [30,  58,  138], // #1E3A8A navy
      gold:        [180, 142, 60],  // gold accent
      muted:       [100, 100, 110], // gray muted
      border:      [181, 181, 181], // #B5B5B5
      hr:          [80,  80,  90],  // dark gray rule
      watermark:   [15,  23,  42],  // watermark color
    };

    // ── Report metadata ───────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const reportId = 'LEXAI-' + now.getFullYear() +
      String(now.getMonth()+1).padStart(2,'0') +
      String(now.getDate()).padStart(2,'0') + '-' +
      Math.random().toString(36).substring(2,7).toUpperCase();
    const modeLabel = mode === 'advice' ? 'Legal Opinion Memorandum'
                    : mode === 'courtroom' ? 'Courtroom Simulation Transcript'
                    : 'Contract & Document Audit Report';

    // ── Content extraction ────────────────────────────────────────
    const blocks = extractContentBlocks(nodeElement, mode);

    // ── State tracking ────────────────────────────────────────────
    let pageNum = 1;
    let curY = MT;

    // ── Helper: draw paper background ─────────────────────────────
    function drawBackground() {
      pdf.setFillColor(...C.paper);
      pdf.rect(0, 0, PW, PH, 'F');
    }

    // ── Helper: draw watermark ────────────────────────────────────
    function drawWatermark() {
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.055 }));
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(72);
      pdf.setTextColor(...C.watermark);

      // Draw rotated "LexAI" text as watermark
      const cx = PW / 2;
      const cy = PH / 2;

      // Save, translate to center, rotate, draw, restore
      pdf.text('LEXAI', cx, cy + 24, {
        align: 'center',
        angle: 30,
        charSpace: 8
      });
      pdf.setFontSize(22);
      pdf.text('AI LEGAL INTELLIGENCE', cx, cy + 68, {
        align: 'center',
        angle: 30,
        charSpace: 3
      });

      pdf.restoreGraphicsState();
    }

    // ── Helper: draw border frame ─────────────────────────────────
    function drawBorderFrame() {
      pdf.setDrawColor(...C.border);
      pdf.setLineWidth(0.75);
      pdf.rect(28, 28, PW - 56, PH - 56); // outer border

      pdf.setLineWidth(0.25);
      pdf.setDrawColor(...C.accent);
      pdf.rect(32, 32, PW - 64, PH - 64); // inner accent border
    }

    // ── Helper: draw a small geometric balance-scales logo (ASCII-safe) ──
    function drawLogoMark(x, y, size, color) {
      pdf.setDrawColor(...color);
      pdf.setLineWidth(size * 0.08);
      // Vertical pole
      pdf.line(x, y - size * 0.6, x, y + size * 0.6);
      // Horizontal beam
      pdf.line(x - size * 0.55, y - size * 0.2, x + size * 0.55, y - size * 0.2);
      // Left pan chain
      pdf.line(x - size * 0.55, y - size * 0.2, x - size * 0.55, y + size * 0.1);
      // Right pan chain
      pdf.line(x + size * 0.55, y - size * 0.2, x + size * 0.55, y + size * 0.1);
      // Left pan (arc approximated as ellipse)
      pdf.setFillColor(...color);
      pdf.ellipse(x - size * 0.55, y + size * 0.22, size * 0.28, size * 0.1, 'F');
      // Right pan
      pdf.ellipse(x + size * 0.55, y + size * 0.22, size * 0.28, size * 0.1, 'F');
      // Base stand
      pdf.line(x - size * 0.2, y + size * 0.6, x + size * 0.2, y + size * 0.6);
    }

    // ── Helper: draw header ───────────────────────────────────────
    function drawHeader() {
      // Header background stripe
      pdf.setFillColor(...C.accent);
      pdf.rect(0, 0, PW, 52, 'F');

      // Gold accent line below header
      pdf.setFillColor(...C.gold);
      pdf.rect(0, 52, PW, 2.5, 'F');

      // Draw small logo mark
      drawLogoMark(ML + 8, 26, 9, [255, 255, 255]);

      // LexAI text (ASCII only - no emoji)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(17);
      pdf.setTextColor(255, 255, 255);
      pdf.text('LexAI', ML + 22, 31);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(180, 200, 255);
      pdf.text('AI Legal Intelligence Platform', ML + 22, 43);

      // Right side: report type
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text('CONFIDENTIAL', PW - MR, 26, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(180, 200, 255);
      pdf.text(modeLabel.toUpperCase(), PW - MR, 38, { align: 'right' });
      pdf.text('Date: ' + dateStr, PW - MR, 49, { align: 'right' });
    }

    // ── Helper: draw footer ───────────────────────────────────────
    function drawFooter(pageNum, totalPages) {
      const fy = PH - 36;

      pdf.setFillColor(...C.accent);
      pdf.rect(0, PH - 44, PW, 44, 'F');

      pdf.setFillColor(...C.gold);
      pdf.rect(0, PH - 44, PW, 2, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text('Page ' + pageNum + ' of ' + totalPages, PW / 2, fy, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(160, 185, 240);
      pdf.text('Generated by LexAI  |  ' + dateStr + ', ' + timeStr + '  |  Report ID: ' + reportId, PW / 2, fy + 12, { align: 'center' });
      pdf.text('Confidential - For Authorized Use Only', PW / 2, fy + 22, { align: 'center' });
    }

    // ── Helper: draw a section heading ────────────────────────────
    function drawSectionHeader(text) {
      ensureSpace(44);

      curY += 8;

      // Gold accent bar on left
      pdf.setFillColor(...C.gold);
      pdf.rect(ML, curY, 3.5, 18, 'F');

      // Navy background pill
      pdf.setFillColor(...C.accent);
      pdf.rect(ML + 8, curY - 2, CW - 8, 22, 'F');

      // Clean the emoji/icon from text for font rendering
      const cleanText = text.replace(/[^\x00-\x7F]/g, '').trim() || text.trim();

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(255, 255, 255);
      pdf.text(cleanText.substring(0, 90), ML + 16, curY + 13);

      curY += 26;

      // Gold rule under header
      pdf.setDrawColor(...C.gold);
      pdf.setLineWidth(0.8);
      pdf.line(ML, curY, ML + CW, curY);

      curY += 8;
    }

    // ── Helper: wrap and draw body text ──────────────────────────
    function drawBodyText(text, options = {}) {
      const fontSize = options.fontSize || 10.5;
      const bold = options.bold || false;
      const color = options.color || C.bodyText;
      const indent = options.indent || 0;
      const lineHeight = options.lineHeight || (fontSize * 1.65);
      const maxWidth = CW - indent;

      pdf.setFont('times', bold ? 'bold' : 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(...color);

      // Split into lines respecting width
      const lines = pdf.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        ensureSpace(lineHeight + 2);
        pdf.text(line, ML + indent, curY);
        curY += lineHeight;
      }
    }

    // ── Helper: bullet point ──────────────────────────────────────
    function drawBullet(text) {
      const fontSize = 10.5;
      const lineHeight = fontSize * 1.6;
      const bulletIndent = 18;
      const textIndent = bulletIndent + 10;
      const maxWidth = CW - textIndent;

      pdf.setFont('times', 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(...C.bodyText);

      const lines = pdf.splitTextToSize(text, maxWidth);
      if (lines.length === 0) return;

      ensureSpace(lineHeight + 2);
      // Draw filled square bullet
      pdf.setFillColor(...C.accent);
      pdf.rect(ML + bulletIndent - 5, curY - 7, 4, 4, 'F');

      pdf.text(lines[0], ML + textIndent, curY);
      curY += lineHeight;

      for (let i = 1; i < lines.length; i++) {
        ensureSpace(lineHeight + 2);
        pdf.text(lines[i], ML + textIndent, curY);
        curY += lineHeight;
      }
    }

    // ── Helper: horizontal rule ───────────────────────────────────
    function drawHR() {
      ensureSpace(10);
      pdf.setDrawColor(...C.hr);
      pdf.setLineWidth(0.4);
      pdf.line(ML, curY, ML + CW, curY);
      curY += 8;
    }

    // ── Helper: table ─────────────────────────────────────────────
    function drawTable(rows) {
      if (!rows || rows.length === 0) return;
      const colCount = rows[0].length || 1;
      const colW = CW / colCount;
      const rowH = 20;
      const fontSize = 9;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        ensureSpace(rowH + 4);

        const isHeader = r === 0;
        if (isHeader) {
          pdf.setFillColor(...C.accent);
        } else {
          pdf.setFillColor(r % 2 === 0 ? 245 : 252, r % 2 === 0 ? 247 : 251, r % 2 === 0 ? 255 : 255);
        }
        pdf.rect(ML, curY - rowH + 4, CW, rowH, 'F');

        pdf.setDrawColor(...C.border);
        pdf.setLineWidth(0.3);
        pdf.rect(ML, curY - rowH + 4, CW, rowH);

        pdf.setFont('times', isHeader ? 'bold' : 'normal');
        pdf.setFontSize(fontSize);
        pdf.setTextColor(isHeader ? 255 : C.bodyText[0], isHeader ? 255 : C.bodyText[1], isHeader ? 255 : C.bodyText[2]);

        for (let c = 0; c < colCount; c++) {
          const cellX = ML + c * colW + 4;
          const cellText = pdf.splitTextToSize(row[c] || '', colW - 8);
          pdf.text(cellText[0] || '', cellX, curY);
          pdf.line(ML + (c + 1) * colW, curY - rowH + 4, ML + (c + 1) * colW, curY + 4);
        }

        curY += rowH;
      }
      curY += 6;
    }

    // ── Helper: ensure space, add new page if needed ──────────────
    // We do a two-pass approach: first collect all pages, then draw footers
    const pageBreakPoints = []; // will be filled during layout
    let totalPagesEstimate = 1; // updated after layout

    function ensureSpace(needed) {
      const maxY = PH - MB;
      if (curY + needed > maxY) {
        pageBreakPoints.push(pageNum);
        pdf.addPage();
        pageNum++;
        drawBackground();
        drawWatermark();
        drawBorderFrame();
        drawHeader();
        curY = MT;
      }
    }

    // ── Cover page ────────────────────────────────────────────────
    drawBackground();
    drawWatermark();
    drawBorderFrame();

    // Cover header
    pdf.setFillColor(...C.accent);
    pdf.rect(0, 0, PW, 90, 'F');
    pdf.setFillColor(...C.gold);
    pdf.rect(0, 90, PW, 3, 'F');

    // Draw centered logo mark on cover
    drawLogoMark(PW / 2 - 42, 38, 14, [255, 215, 100]);

    // LexAI branding on cover (ASCII only)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(28);
    pdf.setTextColor(255, 255, 255);
    pdf.text('LexAI', PW / 2, 46, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(180, 205, 255);
    pdf.text('AI Legal Intelligence Platform', PW / 2, 64, { align: 'center' });
    pdf.setFontSize(9);
    pdf.text('Confidential  |  For Authorized Use Only', PW / 2, 80, { align: 'center' });

    // Cover document title
    pdf.setFont('times', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(...C.headingText);
    const titleLines = pdf.splitTextToSize(modeLabel.toUpperCase(), CW);
    let coverY = 145;
    titleLines.forEach(line => {
      pdf.text(line, PW / 2, coverY, { align: 'center' });
      coverY += 26;
    });

    // Gold separator under title
    pdf.setDrawColor(...C.gold);
    pdf.setLineWidth(1.5);
    pdf.line(PW / 2 - 80, coverY + 4, PW / 2 + 80, coverY + 4);
    coverY += 22;

    // Metadata box
    pdf.setFillColor(240, 242, 250);
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(ML + 20, coverY, CW - 40, 100, 6, 6, 'FD');

    const metaItems = [
      ['Report ID:', reportId],
      ['Date:', dateStr],
      ['Time:', timeStr],
      ['Classification:', 'CONFIDENTIAL'],
      ['Generated By:', 'LexAI - AI Legal Research Assistant'],
    ];

    let metaY = coverY + 22;
    metaItems.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...C.accent);
      pdf.text(label, ML + 36, metaY);

      pdf.setFont('times', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...C.bodyText);
      pdf.text(value, ML + 120, metaY);
      metaY += 16;
    });

    // Disclaimer at cover bottom
    pdf.setFont('times', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...C.muted);
    const disclaimer = 'This document has been prepared by LexAI, an AI-powered legal research assistant. It does not constitute formal legal advice or create an advocate-client relationship. Please consult a qualified advocate for certified legal opinion.';
    const disclaimerLines = pdf.splitTextToSize(disclaimer, CW);
    let dy = PH - 80;
    disclaimerLines.forEach(line => {
      pdf.text(line, PW / 2, dy, { align: 'center' });
      dy += 13;
    });

    // Cover footer
    pdf.setFillColor(...C.accent);
    pdf.rect(0, PH - 44, PW, 44, 'F');
    pdf.setFillColor(...C.gold);
    pdf.rect(0, PH - 44, PW, 2, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(160, 185, 240);
    pdf.text('Page 1 of [N]  |  LexAI Platform  |  Confidential', PW / 2, PH - 18, { align: 'center' });

    // ── Content pages ─────────────────────────────────────────────
    pdf.addPage();
    pageNum = 2;
    drawBackground();
    drawWatermark();
    drawBorderFrame();
    drawHeader();
    curY = MT;

    // Process each block
    for (const block of blocks) {
      if (block.type === 'sectionHeader') {
        drawSectionHeader(block.text);
      } else if (block.type === 'body') {
        // Split large body text by line breaks
        const paragraphs = block.text.split(/\n+/);
        for (const para of paragraphs) {
          const trimmed = para.trim();
          if (!trimmed) { curY += 5; continue; }

          // Detect bullet-like lines starting with -, •, *, numbers
          if (/^[-•*]\s/.test(trimmed)) {
            drawBullet(trimmed.replace(/^[-•*]\s*/, ''));
          } else if (/^\d+\.\s/.test(trimmed)) {
            drawBullet(trimmed);
          } else {
            drawBodyText(trimmed);
            curY += 3;
          }
        }
        curY += 4;
      } else if (block.type === 'bold') {
        drawBodyText(block.text, { bold: true, color: C.headingText });
        curY += 3;
      } else if (block.type === 'bullet') {
        drawBullet(block.text);
      } else if (block.type === 'table') {
        drawTable(block.rows);
      }
    }

    // ── Final page count and footer pass ─────────────────────────
    const totalPages = pageNum;

    // Re-draw footers on all pages now that we know totalPages
    const totalPageCount = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= totalPageCount; p++) {
      pdf.setPage(p);
      drawFooter(p, totalPageCount);
    }

    // Fix cover page footer text (page 1)
    pdf.setPage(1);
    pdf.setFillColor(...C.accent);
    pdf.rect(0, PH - 44, PW, 44, 'F');
    pdf.setFillColor(...C.gold);
    pdf.rect(0, PH - 44, PW, 2, 'F');
    drawFooter(1, totalPageCount);

    pdf.save(filename);
    loaderToast.remove();

  } catch (err) {
    loaderToast.remove();
    console.error('PDF generation error:', err);
    alert('Failed to generate PDF. Please try again.');
  }
}
// -------------------------------------------------------------
// HISTORICAL DRAWER LOGIC
// -------------------------------------------------------------
function toggleSidebar() {
  historySidebar.classList.toggle('active');
  sidebarOverlay.classList.toggle('active');
}

toggleSidebarBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', toggleSidebar);

async function loadHistory() {
  if (!currentUser) {
    sidebarPlaceholder.style.display = 'block';
    sidebarLists.style.display = 'none';
    return;
  }

  sidebarPlaceholder.style.display = 'none';
  sidebarLists.style.display = 'block';

  try {
    const [convs, trials, docs] = await Promise.all([
      getConversations(),
      getCourtroomSessions(),
      getDocuments()
    ]);

    renderHistoryList(conversationHistoryList, convs, 'conversation');
    renderHistoryList(courtroomHistoryList, trials, 'courtroom');
    renderHistoryList(documentHistoryList, docs, 'document');
  } catch (err) {
    console.error('Failed to retrieve lists:', err.message);
  }
}

function renderHistoryList(containerEl, items, type) {
  containerEl.innerHTML = '';
  if (!items || items.length === 0) {
    containerEl.innerHTML = '<li class="sidebar-info-msg" style="padding: 0.5rem 0; font-size: 0.8rem;">No recent logs.</li>';
    return;
  }

  items.slice(0, 10).forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    
    const title = type === 'document' ? item.filename : (item.title || item.caseFacts);
    const displayTitle = title.length > 25 ? title.substring(0, 22) + '...' : title;

    li.innerHTML = `
      <span>${displayTitle}</span>
      ${type === 'conversation' ? `<button class="delete-history-btn" aria-label="Delete history item"><i class="fas fa-trash-alt"></i></button>` : ''}
    `;

    // Click handler to load historic item
    li.addEventListener('click', async (e) => {
      if (e.target.closest('.delete-history-btn')) {
        e.stopPropagation();
        if (confirm('Delete this consultation from database?')) {
          try {
            await deleteConversation(item._id);
            loadHistory();
            if (activeConversationId === item._id) {
              advisorClearBtn.click();
            }
          } catch (delErr) {
            alert('Failed to delete history item.');
          }
        }
        return;
      }
      
      toggleSidebar();
      await loadHistoryDetail(item._id, type);
    });

    containerEl.appendChild(li);
  });
}

async function loadHistoryDetail(id, type) {
  if (type === 'conversation') {
    switchTab('advisorTab');
    advisorLoading.style.display = 'block';
    advisorResult.style.display = 'none';

    try {
      const data = await getConversationDetails(id);
      activeConversationId = data._id;
      
      // Load last AI message for display
      const aiMsgs = data.messages.filter(m => m.sender === 'ai');
      const lastAi = aiMsgs[aiMsgs.length - 1];
      const userMsgs = data.messages.filter(m => m.sender === 'user');
      const lastUser = userMsgs[userMsgs.length - 1];

      if (lastUser) advisorInput.value = lastUser.content;
      if (lastAi) {
        advisorResult.innerHTML = formatLegalText(lastAi.content);
        advisorResult.style.display = 'block';
        advisorPdfBtn.disabled = false;
      }
    } catch (err) {
      alert('Failed to fetch detailed historical messages.');
    } finally {
      advisorLoading.style.display = 'none';
    }
  } else if (type === 'courtroom') {
    switchTab('courtroomTab');
    courtroomLoading.style.display = 'block';
    courtroomChat.style.display = 'none';
    courtroomChat.innerHTML = '';

    try {
      const data = await getCourtroomSessionDetails(id);
      courtroomLoading.style.display = 'none';
      
      courtroomInput.value = data.caseFacts;

      populateCourtroomStage(data.caseFacts, data.arguments, data.verdict);

      courtroomPdfBtn.disabled = false;
    } catch (err) {
      alert('Failed to fetch trial details.');
    } finally {
      courtroomLoading.style.display = 'none';
    }
  } else if (type === 'document') {
    switchTab('documentTab');
    documentLoading.style.display = 'block';
    documentResult.style.display = 'none';

    try {
      const data = await getDocumentDetails(id);
      
      docSummaryText.textContent = data.summary;
      
      docRisksList.innerHTML = '';
      data.risks.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        docRisksList.appendChild(li);
      });

      docClausesList.innerHTML = '';
      data.clauses.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        docClausesList.appendChild(li);
      });

      documentLoading.style.display = 'none';
      documentResult.style.display = 'block';
    } catch (err) {
      alert('Failed to load document details.');
    } finally {
      documentLoading.style.display = 'none';
    }
  }
}

// -------------------------------------------------------------
// USER SIGN IN & ACCOUNT MANAGEMENT
// -------------------------------------------------------------
function openModal(modal) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

navSignInBtn.addEventListener('click', () => {
  loginError.style.display = 'none';
  openModal(loginModal);
});

closeLoginBtn.addEventListener('click', () => closeModal(loginModal));
closeRegisterBtn.addEventListener('click', () => closeModal(registerModal));

toRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  closeModal(loginModal);
  registerError.style.display = 'none';
  openModal(registerModal);
});

toLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  closeModal(registerModal);
  loginError.style.display = 'none';
  openModal(loginModal);
});

navSignOutBtn.addEventListener('click', () => {
  localStorage.removeItem('authToken');
  updateCurrentUser(null);
  advisorClearBtn.click();
  courtroomClearBtn.click();
  documentClearBtn.click();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const data = await loginUser({ email, password });
    localStorage.setItem('authToken', data.token);
    updateCurrentUser(data.user);
    closeModal(loginModal);
    // Clear forms
    loginForm.reset();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = 'block';
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.style.display = 'none';
  const username = document.getElementById('registerUsername').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const data = await registerUser({ username, email, password });
    localStorage.setItem('authToken', data.token);
    updateCurrentUser(data.user);
    closeModal(registerModal);
    registerForm.reset();
  } catch (err) {
    registerError.textContent = err.message;
    registerError.style.display = 'block';
  }
});

function updateCurrentUser(user) {
  currentUser = user;
  if (user) {
    navSignInBtn.style.display = 'none';
    navUserBadge.style.display = 'flex';
    navUsername.textContent = user.username;
  } else {
    navSignInBtn.style.display = 'block';
    navUserBadge.style.display = 'none';
    navUsername.textContent = '';
  }
  loadHistory();
}

async function verifyAuthStatus() {
  try {
    const user = await getCurrentUser();
    updateCurrentUser(user);
  } catch (err) {
    updateCurrentUser(null);
  }
}

// -------------------------------------------------------------
// GUIDED TOUR SYSTEM
// -------------------------------------------------------------
let tourActive = false;
function startTour() {
  if (tourActive) return;
  tourActive = true;
  alert('Welcome to the LexAI Guided Tour! We will walk you through the three core sections.');
  
  // Step 1
  switchTab('advisorTab');
  setTimeout(() => {
    alert('1. AI Legal Advisor: Paste your legal grievance in the textarea, then click "Analyze Situation". The assistant will reference sections from IPC and BNS statutes and output case strength scores.');
    
    // Step 2
    switchTab('courtroomTab');
    setTimeout(() => {
      alert('2. Courtroom Simulator: Input facts of a dispute, then click "Simulate Trial". A step-by-step simulated debate between prosecution and defense attorneys will play out, resulting in a final verdict from the judge.');
      
      // Step 3
      switchTab('documentTab');
      setTimeout(() => {
        alert('3. Document Auditor: Drag and drop plain text files, or paste contract terms. Click "Audit Document" to run a clause analysis, flag red-flags, and view a summary.');
        tourActive = false;
        alert('Tour complete! Log in to persist your consultations.');
      }, 500);
    }, 500);
  }, 500);
}

startTourBtn.addEventListener('click', startTour);
welcomeTourBtn.addEventListener('click', () => {
  closeModal(welcomeModal);
  startTour();
});

welcomeStartBtn.addEventListener('click', () => closeModal(welcomeModal));
closeWelcomeBtn.addEventListener('click', () => closeModal(welcomeModal));

function checkWelcomeModal() {
  const welcomed = localStorage.getItem('welcomed');
  if (!welcomed) {
    setTimeout(() => {
      openModal(welcomeModal);
      localStorage.setItem('welcomed', 'true');
    }, 1200);
  }
}

// -------------------------------------------------------------
// MISCELLANEOUS UI LOGIC (CHAR COUNTER, VISITOR COUNTER)
// -------------------------------------------------------------
function setupCharCounters() {
  advisorInput.addEventListener('input', () => {
    const len = advisorInput.value.length;
    advisorCharCounter.textContent = `${len} / 2000`;
    advisorCharCounter.style.color = len > 1900 ? 'var(--error)' : 'var(--text-muted)';
  });

  courtroomInput.addEventListener('input', () => {
    const len = courtroomInput.value.length;
    courtroomCharCounter.textContent = `${len} / 2000`;
    courtroomCharCounter.style.color = len > 1900 ? 'var(--error)' : 'var(--text-muted)';
  });
}

function setupExamplePrompts() {
  promptButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      advisorInput.value = btn.getAttribute('data-prompt');
      advisorInput.dispatchEvent(new Event('input'));
      switchTab('advisorTab');
      advisorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function initVisitorCount() {
  try {
    let count = parseInt(localStorage.getItem('visitorCount') || '0');
    count++;
    localStorage.setItem('visitorCount', count.toString());
    if (visitorCountEl) {
      visitorCountEl.innerHTML = `<i class="fas fa-users"></i> <span data-i18n="visitors">Visitors:</span> ${count}`;
    }
  } catch (err) {
    console.warn('LocalStorage blocked or disabled:', err);
  }
}

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTranslations();
  verifyAuthStatus();
  setupDropzone();
  setupPdfExportTriggers();
  setupCharCounters();
  setupExamplePrompts();
  initVisitorCount();
  checkWelcomeModal();
  initHeroEffects();
});

// -------------------------------------------------------------
// PREMIUM HERO 3D AND CANVAS INTERACTIONS
// -------------------------------------------------------------
function initHeroEffects() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const heroSection = canvas.parentElement;

  // Track reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Particles config
  let particles = [];
  const particleCount = prefersReducedMotion ? 0 : 45;
  const maxLineDist = 110;
  
  // Mouse coordinates
  let mouse = { x: null, y: null, radius: 150 };

  // Set canvas bounds
  function resizeCanvas() {
    canvas.width = heroSection.clientWidth;
    canvas.height = heroSection.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Particle Class
  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.size = Math.random() * 2 + 1;
      this.color = Math.random() > 0.5 ? 'rgba(197, 168, 92, 0.45)' : 'rgba(0, 229, 255, 0.35)';
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  // Populate particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  // Animation variables
  let lastTime = 0;
  let frameCount = 0;
  let fps = 60;
  let isLowPerformance = false;
  let isVisible = true;

  // Optimize performance on scroll
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.1 });
    observer.observe(heroSection);
  }

  // Canvas loop
  function animate(timestamp) {
    if (prefersReducedMotion || isLowPerformance) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (!isVisible) {
      requestAnimationFrame(animate);
      return;
    }

    // Measure FPS
    if (lastTime) {
      const delta = timestamp - lastTime;
      frameCount++;
      if (delta >= 1000) {
        fps = Math.round((frameCount * 1000) / delta);
        frameCount = 0;
        lastTime = timestamp;
        
        if (fps < 35) {
          isLowPerformance = true;
          console.warn('Low performance detected. Disabling canvas neural particle animation.');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
      }
    } else {
      lastTime = timestamp;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxLineDist) {
          const alpha = (1 - dist / maxLineDist) * 0.15;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          
          const grad = ctx.createLinearGradient(particles[i].x, particles[i].y, particles[j].x, particles[j].y);
          grad.addColorStop(0, `rgba(197, 168, 92, ${alpha})`);
          grad.addColorStop(1, `rgba(0, 229, 255, ${alpha})`);
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    if (mouse.x !== null && mouse.y !== null) {
      particles.forEach(p => {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouse.radius) {
          const alpha = (1 - dist / mouse.radius) * 0.25;
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    requestAnimationFrame(animate);
  }

  heroSection.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  heroSection.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  if (!prefersReducedMotion) {
    requestAnimationFrame(animate);
  }

  // 3D Parallax Tilt Effects on HUD widgets
  const visualContainer = document.querySelector('.hero-visual');
  const widgets = document.querySelectorAll('.hero-visual .glass-card');

  if (visualContainer && widgets.length > 0 && !prefersReducedMotion) {
    heroSection.addEventListener('mousemove', (e) => {
      const rect = heroSection.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;
      
      const rotateX = (-mouseY / (rect.height / 2)) * 12;
      const rotateY = (mouseX / (rect.width / 2)) * 12;
      
      visualContainer.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      
      widgets.forEach(widget => {
        const depth = parseFloat(widget.getAttribute('data-depth') || '0.15');
        const offsetX = mouseX * depth;
        const offsetY = mouseY * depth;
        
        widget.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 20px) rotateX(${-rotateX * 0.5}deg) rotateY(${-rotateY * 0.5}deg)`;
      });
    });

    heroSection.addEventListener('mouseleave', () => {
      visualContainer.style.transform = 'rotateX(0deg) rotateY(0deg)';
      widgets.forEach(widget => {
        widget.style.transform = 'translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg)';
      });
    });
  }
}
