// ==================== KONFIGURASI UTAMA ====================
const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMXLtM4WQwOCoDDb-lNpJfyBJR1BP2pRM6CnobiAhdca3hMYhBgw5LaPrA2sMKl-VkbQ/exec';
const ADMIN_MASTER_PIN = 'MjMxMTI2'; // PIN: 231126
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

let availablePackets = [];
let selectedPacketIndex = null;
let activePacket = null;
let studentInfo = { name: '', school: '', stuClass: '' };
let studentAnswers = {};
let doubtQuestions = {};
let currentQIndex = 0;
let remainingSeconds = 0;
let timerInterval = null;
let lastResultPayload = null;
let adminQuestions = [];

// State Monitoring & Rekap
let isExamRunning = false;
let tabSwitchCount = 0;
let allRecapRows = [];
let filteredRecapRows = [];

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

// ==================== 1. TAB SWITCHER, PILIH PAKET & MASUK UJIAN ====================
function switchPortalRole(role) {
  const tabStu = document.getElementById('tabRoleStudent');
  const tabAdm = document.getElementById('tabRoleAdmin');
  const paneStu = document.getElementById('studentLoginPane');
  const paneAdm = document.getElementById('adminLoginPane');

  if (role === 'admin') {
    tabStu.classList.remove('active');
    tabAdm.classList.add('active');
    paneStu.classList.add('hidden');
    paneAdm.classList.remove('hidden');

    const pinInput = document.getElementById('adminPinInput');
    const pinErr = document.getElementById('adminPinError');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 50);
    }
    if (pinErr) pinErr.classList.add('hidden');
  } else {
    tabAdm.classList.remove('active');
    tabStu.classList.add('active');
    paneAdm.classList.add('hidden');
    paneStu.classList.remove('hidden');
  }
  refreshIcons();
}

async function loadPacketsManifest() {
  const listContainer = document.getElementById('packetsCardList');
  if (!listContainer) return;

  try {
    const res = await fetch(`paket/manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('Manifest gagal dimuat');
    availablePackets = await res.json();

    if (!availablePackets || availablePackets.length === 0) {
      listContainer.innerHTML = `<div class="muted-text" style="text-align:center; padding:18px;">Belum ada paket ujian tersedia.</div>`;
      return;
    }

    listContainer.innerHTML = availablePackets.map((pkt, idx) => `
      <button type="button" class="packet-select-item" onclick="selectExamPacket(${idx})">
        <div class="packet-item-info">
          <strong>${pkt.title}</strong>
          <div class="packet-item-sub">${pkt.subtitle || 'Tryout CBT'}</div>
          <div class="packet-item-badges">
            <span class="pkt-mini-pill">${pkt.questionCount} Soal</span>
            <span class="pkt-mini-pill">${pkt.duration} Menit</span>
          </div>
        </div>
        <span class="packet-item-arrow">
          <i data-lucide="chevron-right"></i>
        </span>
      </button>
    `).join('');
    refreshIcons();
  } catch (err) {
    listContainer.innerHTML = `<div class="muted-text" style="text-align:center; padding:18px;">Belum ada paket ujian tersedia.</div>`;
  }
}

function selectExamPacket(idx) {
  const pkt = availablePackets[idx];
  if (!pkt) return;

  selectedPacketIndex = idx;
  document.getElementById('tokenErrorMsg').classList.add('hidden');
  document.getElementById('selectedPacketBadge').innerText = `${pkt.questionCount} Soal • ${pkt.duration} Menit`;
  document.getElementById('selectedPacketHeading').innerText = pkt.title;
  document.getElementById('selectedPacketSubheading').innerText = 'Lengkapi biodata peserta dan masukkan token ujian';

  // Sembunyikan tab switcher Peserta Ujian / Admin agar header naik sejajar
  const roleSwitcher = document.querySelector('.role-tab-switcher');
  if (roleSwitcher) roleSwitcher.classList.add('hidden');

  document.getElementById('packetSelectionStep').classList.add('hidden');
  document.getElementById('studentBiodataStep').classList.remove('hidden');
  refreshIcons();

  const nameInput = document.getElementById('stuName');
  if (nameInput) setTimeout(() => nameInput.focus(), 60);
}

function backToPacketSelection() {
  selectedPacketIndex = null;

  // Tampilkan kembali tab switcher Peserta Ujian / Admin
  const roleSwitcher = document.querySelector('.role-tab-switcher');
  if (roleSwitcher) roleSwitcher.classList.remove('hidden');

  document.getElementById('studentBiodataStep').classList.add('hidden');
  document.getElementById('packetSelectionStep').classList.remove('hidden');
  refreshIcons();
}

async function handleDirectExamLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('tokenErrorMsg');
  const submitBtn = document.getElementById('btnStartExamSubmit');

  errEl.classList.add('hidden');

  if (selectedPacketIndex === null || !availablePackets[selectedPacketIndex]) {
    alert('Silakan pilih paket ujian tryout terlebih dahulu.');
    backToPacketSelection();
    return;
  }

  const name = document.getElementById('stuName').value.trim();
  const school = document.getElementById('stuSchool').value.trim();
  const stuClass = document.getElementById('stuClass').value.trim();
  const inputToken = document.getElementById('stuToken').value.trim().toUpperCase();

  submitBtn.disabled = true;
  submitBtn.innerText = 'Memeriksa Paket...';

  try {
    const meta = availablePackets[selectedPacketIndex];
    const res = await fetch(`paket/${meta.file}?t=${Date.now()}`);
    if (!res.ok) throw new Error('File soal tidak ditemukan');
    const packetData = await res.json();

    const validToken = (packetData.token || '').trim().toUpperCase();
    if (validToken && inputToken !== validToken) {
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Mulai Mengerjakan';
      return;
    }

    activePacket = packetData;
    studentInfo = { name, school, stuClass };

    startExamSession();
  } catch (err) {
    alert('Gagal memuat paket soal. Pastikan koneksi stabil dan file paket tersedia.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Mulai Mengerjakan';
  }
}

// ==================== 2. SESI UJIAN CBT & DETEKSI PINDAH TAB ====================
function getStorageBackupKey() {
  const slug = (activePacket?.title || 'paket').replace(/\s+/g, '_');
  const stu = (studentInfo?.name || 'siswa').replace(/\s+/g, '_');
  return `ecendekia_backup_${slug}_${stu}`;
}

function saveProgressLocally() {
  if (!activePacket) return;
  try {
    localStorage.setItem(getStorageBackupKey(), JSON.stringify({
      studentAnswers,
      doubtQuestions,
      remainingSeconds,
      tabSwitchCount
    }));
  } catch (_) {}
}

function startExamSession() {
  studentAnswers = {};
  doubtQuestions = {};
  currentQIndex = 0;
  remainingSeconds = (parseInt(activePacket.duration) || 60) * 60;
  tabSwitchCount = 0;
  isExamRunning = true;

  const saved = localStorage.getItem(getStorageBackupKey());
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.studentAnswers) studentAnswers = parsed.studentAnswers;
      if (parsed.doubtQuestions) doubtQuestions = parsed.doubtQuestions;
      if (parsed.remainingSeconds > 10) remainingSeconds = parsed.remainingSeconds;
      if (parsed.tabSwitchCount) tabSwitchCount = parsed.tabSwitchCount;
    } catch (_) {}
  }

  const warnBanner = document.getElementById('tabWarningBanner');
  if (warnBanner) {
    if (tabSwitchCount > 0) {
      document.getElementById('tabWarningText').innerText =
        `Peringatan: Terdeteksi meninggalkan layar ujian sebanyak ${tabSwitchCount}x. Aktivitas ini tercatat di laporan pengawas.`;
      warnBanner.classList.remove('hidden');
    } else {
      warnBanner.classList.add('hidden');
    }
  }

  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('examScreen').classList.remove('hidden');

  document.getElementById('topbarStudentName').innerText = `${studentInfo.name} (${studentInfo.stuClass})`;
  document.getElementById('topbarPacketTitle').innerText = `${activePacket.title} • ${studentInfo.school}`;

  renderCBTQuestion();
  renderNumberGrid();
  startCountdownTimer();
  refreshIcons();
}

function startCountdownTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const displayEl = document.getElementById('timerDisplay');
  const badgeEl = document.getElementById('timerBadge');

  const updateUI = () => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    displayEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (remainingSeconds <= 300) badgeEl.classList.add('danger');
    else badgeEl.classList.remove('danger');
  };

  updateUI();
  timerInterval = setInterval(() => {
    remainingSeconds--;
    saveProgressLocally();
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      finalizeAndSubmitExam();
      return;
    }
    updateUI();
  }, 1000);
}

// Deteksi jika siswa berpindah tab atau keluar dari browser saat ujian berlangsung
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isExamRunning) {
    recordTabSwitchViolation();
  }
});

function recordTabSwitchViolation() {
  tabSwitchCount++;
  saveProgressLocally();

  const banner = document.getElementById('tabWarningBanner');
  const textEl = document.getElementById('tabWarningText');
  if (banner && textEl) {
    textEl.innerText = `Peringatan: Terdeteksi meninggalkan layar ujian sebanyak ${tabSwitchCount}x. Aktivitas ini tercatat di laporan pengawas.`;
    banner.classList.remove('hidden');
    refreshIcons();
  }
}

function renderCBTQuestion() {
  const questions = activePacket.questions || [];
  const q = questions[currentQIndex];
  if (!q) return;

  const total = questions.length;
  document.getElementById('cbtQuestionNum').innerText = `Soal No. ${currentQIndex + 1} dari ${total}`;

  let typeLabel = 'Pilihan Ganda';
  if (q.type === 'mcma') typeLabel = 'Pilihan Ganda Kompleks (MCMA)';
  else if (q.type === 'category') typeLabel = 'Pilihan Kategori';
  document.getElementById('cbtQuestionType').innerText = typeLabel;

  const imgBox = document.getElementById('cbtImageBox');
  const imgEl = document.getElementById('cbtQuestionImg');
  if (q.image) {
    imgEl.src = q.image;
    imgBox.classList.remove('hidden');
  } else {
    imgBox.classList.add('hidden');
    imgEl.src = '';
  }

  document.getElementById('cbtQuestionText').innerText = q.text || '';

  const optContainer = document.getElementById('cbtOptionsContainer');
  optContainer.innerHTML = '';

  if (q.type === 'category') {
    const categories = q.categories || ['Benar', 'Salah'];
    const statements = q.statements || [];
    const currentArr = studentAnswers[currentQIndex] || [];

    const tableWrap = document.createElement('div');
    tableWrap.className = 'cat-table-wrap';

    const thCols = categories.map(c => `<th>${c}</th>`).join('');
    const rowsHtml = statements.map((stmt, sIdx) => {
      const chosen = currentArr[sIdx] || '';
      const cells = categories.map(cat => {
        const isChecked = chosen === cat ? 'checked' : '';
        return `
          <td class="cat-radio-cell" onclick="selectCategoryCell(${sIdx}, '${cat.replace(/'/g, "\\'")}')">
            <span class="cat-radio-dot ${isChecked}"></span>
          </td>
        `;
      }).join('');
      return `<tr><td>${stmt}</td>${cells}</tr>`;
    }).join('');

    tableWrap.innerHTML = `
      <table class="cat-table">
        <thead>
          <tr><th>Pernyataan</th>${thCols}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    optContainer.appendChild(tableWrap);
  } else {
    const optCount = parseInt(activePacket.optionCount) || 4;
    const letters = OPTION_LETTERS.slice(0, optCount);
    const chosenArr = studentAnswers[currentQIndex] || [];

    letters.forEach((letter, idx) => {
      const optText = (q.options && q.options[idx]) ? q.options[idx] : `Pilihan ${letter}`;
      const isSelected = chosenArr.includes(letter);

      const item = document.createElement('div');
      item.className = `option-item ${isSelected ? 'selected' : ''}`;
      item.onclick = () => selectOptionAnswer(letter, q.type === 'mcma');
      item.innerHTML = `
        <span class="opt-letter">${letter}</span>
        <span class="opt-text">${optText}</span>
      `;
      optContainer.appendChild(item);
    });
  }

  document.getElementById('cbtDoubtCheck').checked = !!doubtQuestions[currentQIndex];

  document.getElementById('btnPrevQ').disabled = currentQIndex === 0;
  const nextBtn = document.getElementById('btnNextQ');
  const bottomBar = document.getElementById('examBottomBar');

  if (currentQIndex === total - 1) {
    nextBtn.classList.add('hidden');
    bottomBar.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    bottomBar.classList.add('hidden');
  }

  updateAnsweredCounter();
}

function selectOptionAnswer(letter, isMcma) {
  if (isMcma) {
    let arr = studentAnswers[currentQIndex] ? [...studentAnswers[currentQIndex]] : [];
    if (arr.includes(letter)) arr = arr.filter(l => l !== letter);
    else arr.push(letter);
    arr.sort();
    studentAnswers[currentQIndex] = arr;
  } else {
    studentAnswers[currentQIndex] = [letter];
  }
  saveProgressLocally();
  renderCBTQuestion();
  renderNumberGrid();
}

function selectCategoryCell(stmtIdx, chosenCategory) {
  const totalStmts = (activePacket.questions[currentQIndex].statements || []).length;
  let arr = studentAnswers[currentQIndex] ? [...studentAnswers[currentQIndex]] : new Array(totalStmts).fill('');
  arr[stmtIdx] = chosenCategory;
  studentAnswers[currentQIndex] = arr;
  saveProgressLocally();
  renderCBTQuestion();
  renderNumberGrid();
}

function toggleDoubtCurrent() {
  doubtQuestions[currentQIndex] = document.getElementById('cbtDoubtCheck').checked;
  saveProgressLocally();
  renderNumberGrid();
}

function navigateQuestion(delta) {
  const total = activePacket.questions.length;
  const target = currentQIndex + delta;
  if (target >= 0 && target < total) {
    currentQIndex = target;
    renderCBTQuestion();
    renderNumberGrid();
  }
}

function isQuestionAnswered(idx) {
  const q = activePacket.questions[idx];
  const ans = studentAnswers[idx];
  if (!ans || ans.length === 0) return false;
  if (q.type === 'category') {
    const stmtsLen = (q.statements || []).length;
    return ans.filter(v => v && v.trim() !== '').length === stmtsLen;
  }
  return true;
}

function updateAnsweredCounter() {
  const total = activePacket.questions.length;
  let answered = 0;
  for (let i = 0; i < total; i++) {
    if (isQuestionAnswered(i)) answered++;
  }
  document.getElementById('answeredCountBadge').innerText = `${answered} / ${total} Terjawab`;
}

function renderNumberGrid() {
  const grid = document.getElementById('questionNumberGrid');
  grid.innerHTML = '';
  const total = activePacket.questions.length;

  for (let idx = 0; idx < total; idx++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-btn';

    if (doubtQuestions[idx]) btn.classList.add('doubt');
    else if (isQuestionAnswered(idx)) btn.classList.add('answered');
    if (idx === currentQIndex) btn.classList.add('current');

    btn.innerText = idx + 1;
    btn.onclick = () => {
      currentQIndex = idx;
      renderCBTQuestion();
      renderNumberGrid();
    };
    grid.appendChild(btn);
  }
}

// ==================== 3. PENILAIAN OTOMATIS & KIRIM KE GOOGLE SHEETS ====================
function openConfirmSubmitModal() {
  const total = activePacket.questions.length;
  let answered = 0;
  for (let i = 0; i < total; i++) {
    if (isQuestionAnswered(i)) answered++;
  }
  const unanswered = total - answered;

  document.getElementById('submitSummaryText').innerText = unanswered > 0
    ? `Kamu sudah menjawab ${answered} dari ${total} soal. Masih ada ${unanswered} soal belum lengkap. Yakin ingin mengirim sekarang?`
    : `Semua ${total} soal sudah terjawab. Kirim jawaban sekarang?`;

  document.getElementById('confirmSubmitModal').classList.remove('hidden');
  refreshIcons();
}

function calculateExamScore() {
  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let answeredCount = 0;
  const rawAnswersList = [];

  const mcmaRule = activePacket.mcmaRule || 'all_or_nothing';

  activePacket.questions.forEach((q, idx) => {
    const pts = parseFloat(q.points) || 1;
    maxScore += pts;

    if (isQuestionAnswered(idx)) answeredCount++;

    if (q.type === 'category') {
      const userArr = studentAnswers[idx] || [];
      const keyArr = q.answer || [];
      rawAnswersList.push(`${idx + 1}:[${userArr.join(',') || '-'}]`);

      if (keyArr.length > 0) {
        let matched = 0;
        keyArr.forEach((k, sIdx) => {
          if (userArr[sIdx] && userArr[sIdx] === k) matched++;
        });

        if (matched === keyArr.length) {
          totalScore += pts;
          correctCount++;
        } else if (mcmaRule === 'partial' && matched > 0) {
          totalScore += pts * (matched / keyArr.length);
        }
      }
    } else if (q.type === 'mcma') {
      const userAns = (studentAnswers[idx] || []).slice().sort();
      const keyAns = (q.answer || []).slice().sort();
      rawAnswersList.push(`${idx + 1}:${userAns.join('+') || '-'}`);

      const isExact = userAns.length === keyAns.length && userAns.every((v, i) => v === keyAns[i]);
      if (isExact) {
        totalScore += pts;
        correctCount++;
      } else if (mcmaRule === 'partial' && userAns.length > 0 && keyAns.length > 0) {
        const hasWrongOption = userAns.some(ans => !keyAns.includes(ans));
        if (!hasWrongOption) {
          const ratio = userAns.length / keyAns.length;
          totalScore += pts * ratio;
        }
      }
    } else {
      const userAns = studentAnswers[idx] || [];
      const keyAns = q.answer || [];
      rawAnswersList.push(`${idx + 1}:${userAns[0] || '-'}`);

      if (userAns[0] && userAns[0] === keyAns[0]) {
        totalScore += pts;
        correctCount++;
      }
    }
  });

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    maxScore,
    correctCount,
    answeredCount,
    wrongOrEmpty: activePacket.questions.length - correctCount,
    rawAnswersString: rawAnswersList.join(' | ')
  };
}

async function finalizeAndSubmitExam() {
  isExamRunning = false;
  if (timerInterval) clearInterval(timerInterval);
  closeModal('confirmSubmitModal');

  const result = calculateExamScore();
  localStorage.removeItem(getStorageBackupKey());

  document.getElementById('examScreen').classList.add('hidden');
  document.getElementById('resultScreen').classList.remove('hidden');

  document.getElementById('resStudentName').innerText = studentInfo.name;
  document.getElementById('resStudentMeta').innerText = `${studentInfo.school} • ${studentInfo.stuClass} (${activePacket.title})`;
  document.getElementById('resTotalScore').innerText = result.totalScore;
  document.getElementById('resMaxScore').innerText = `dari ${result.maxScore} poin maksimal`;
  document.getElementById('resAnswered').innerText = result.answeredCount;
  document.getElementById('resCorrect').innerText = result.correctCount;
  document.getElementById('resWrong').innerText = result.wrongOrEmpty;

  lastResultPayload = {
    timestamp: new Date().toLocaleString('id-ID'),
    packetTitle: activePacket.title,
    name: studentInfo.name,
    school: studentInfo.school,
    stuClass: studentInfo.stuClass,
    score: result.totalScore,
    maxScore: result.maxScore,
    correctCount: result.correctCount,
    tabSwitches: tabSwitchCount,
    rawAnswers: result.rawAnswersString
  };

  await sendPayloadWithRetry(lastResultPayload);
}

async function sendPayloadWithRetry(payload, maxRetries = 4) {
  const scriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;
  const retryBtn = document.getElementById('btnRetrySync');

  if (!scriptUrl || scriptUrl.includes('PASTE_URL')) {
    return;
  }

  if (retryBtn) retryBtn.classList.add('hidden');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        const jitterMs = 800 * attempt + Math.floor(Math.random() * 1200);
        await new Promise(r => setTimeout(r, jitterMs));
      } else if (retryBtn) {
        retryBtn.classList.remove('hidden');
      }
    }
  }
}

function retrySendToGoogleSheets() {
  if (lastResultPayload) sendPayloadWithRetry(lastResultPayload);
}

function backToHome() {
  document.getElementById('resultScreen').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
  backToPacketSelection();
}

// ==================== 4. PANEL ADMIN 2-CARD SIDEBAR WORKSPACE ====================
function submitAdminAuth(e) {
  e.preventDefault();
  const pin = document.getElementById('adminPinInput').value.trim();
  if (btoa(pin) === ADMIN_MASTER_PIN) {
    switchPortalRole('student');
    openAdminPanel();
  } else {
    document.getElementById('adminPinError').classList.remove('hidden');
  }
}

function openAdminPanel() {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('adminScreen').classList.remove('hidden');

  if (adminQuestions.length === 0) {
    addBulkQuestions(5);
  } else {
    renderAdminQuestions();
  }

  switchAdminTab('dashboard');
  updateAdminDashboardStats();
  refreshIcons();
}

function exitAdminPanel() {
  document.getElementById('adminScreen').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
  switchPortalRole('student');
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.admin-tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });

  const activePane = document.getElementById(`adminTab-${tabName}`);
  if (activePane) activePane.classList.remove('hidden');

  if (tabName === 'recap' && allRecapRows.length === 0) {
    fetchRecapFromSheets();
  }

  updateAdminDashboardStats();
  refreshIcons();
}

function updateAdminDashboardStats() {
  const qCount = adminQuestions.length;
  const title = (document.getElementById('admTitle')?.value || '').trim() || 'Paket Tryout LBB';
  const duration = parseInt(document.getElementById('admDuration')?.value) || 60;
  const token = (document.getElementById('admToken')?.value || '').trim().toUpperCase() || 'TRYOUT26';

  const sideBadge = document.getElementById('sideQCountBadge');
  const dashQ = document.getElementById('dashDraftQCount');
  const dashTok = document.getElementById('dashDraftToken');
  const dashDur = document.getElementById('dashDraftDuration');
  const dashInstalled = document.getElementById('dashInstalledCount');
  const pubTitle = document.getElementById('pubPreviewTitle');
  const pubMeta = document.getElementById('pubPreviewMeta');

  if (sideBadge) sideBadge.innerText = qCount;
  if (dashQ) dashQ.innerText = `${qCount} Soal`;
  if (dashTok) dashTok.innerText = token;
  if (dashDur) dashDur.innerText = `Durasi ${duration} Menit`;
  if (dashInstalled) dashInstalled.innerText = `${availablePackets.length} Paket`;
  if (pubTitle) pubTitle.innerText = title;
  if (pubMeta) pubMeta.innerText = `${qCount} Soal • Durasi ${duration} Menit • Token: ${token}`;

  const listEl = document.getElementById('dashActivePacketsList');
  if (listEl) {
    if (!availablePackets || availablePackets.length === 0) {
      listEl.innerHTML = `<p class="muted-text">Belum ada paket terpasang (atau sedang dijalankan via file lokal tanpa server).</p>`;
    } else {
      listEl.innerHTML = availablePackets.map(p => `
        <div class="dash-packet-row">
          <div>
            <strong>${p.title}</strong>
            <div class="muted-text">${p.subtitle || ''}</div>
          </div>
          <span class="tag-mini">${p.questionCount} Soal • ${p.duration}m</span>
        </div>
      `).join('');
    }
  }
}

function generateRandomToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('admToken').value = token;
  updateAdminDashboardStats();
}

function createEmptyQuestion() {
  return {
    type: 'single',
    text: '',
    image: '',
    options: ['', '', '', '', ''],
    categories: ['Benar', 'Salah'],
    statements: ['', '', ''],
    answer: ['A'],
    points: 2.5
  };
}

function addSingleQuestion() {
  adminQuestions.push(createEmptyQuestion());
  renderAdminQuestions();
}

function addBulkQuestions(count) {
  for (let i = 0; i < count; i++) {
    adminQuestions.push(createEmptyQuestion());
  }
  renderAdminQuestions();
}

function deleteAdminQuestion(idx) {
  adminQuestions.splice(idx, 1);
  renderAdminQuestions();
}

function renderAdminQuestions() {
  const container = document.getElementById('adminQuestionsContainer');
  const optCount = parseInt(document.getElementById('admOptionCount').value) || 4;
  const letters = OPTION_LETTERS.slice(0, optCount);

  document.getElementById('admTotalQCount').innerText = adminQuestions.length;
  updateAdminDashboardStats();
  container.innerHTML = '';

  adminQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'admin-q-item';

    let answerSectionHtml = '';

    if (q.type === 'category') {
      const cats = (q.categories && q.categories.length) ? q.categories : ['Benar', 'Salah'];
      const stmts = (q.statements && q.statements.length) ? q.statements : ['', '', ''];

      const stmtRowsHtml = stmts.map((st, sIdx) => {
        const chosenKey = q.answer[sIdx] || cats[0];
        const catButtons = cats.map(c => {
          const isAct = chosenKey === c ? 'active' : '';
          return `<button type="button" class="cat-key-chip ${isAct}" onclick="setAdminCategoryKey(${idx}, ${sIdx}, '${c.replace(/'/g, "\\'")}')">${c}</button>`;
        }).join('');

        return `
          <div class="admin-cat-row">
            <input type="text" placeholder="Pernyataan ${sIdx + 1}..."
              value="${st.replace(/"/g, '&quot;')}"
              onchange="adminQuestions[${idx}].statements[${sIdx}] = this.value" />
            <div class="admin-cat-keys">${catButtons}</div>
            ${stmts.length > 1 ? `<button type="button" class="btn-del-q" onclick="removeAdminStatement(${idx}, ${sIdx})" title="Hapus Baris">✕</button>` : ''}
          </div>
        `;
      }).join('');

      answerSectionHtml = `
        <div class="form-group">
          <label>Label Kategori Kolom (Pisahkan dengan koma, contoh: Benar, Salah)</label>
          <input type="text" value="${cats.join(', ')}" onchange="updateAdminCategories(${idx}, this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="margin-bottom:0;">Daftar Pernyataan & Kunci Jawaban</label>
            <button type="button" class="btn-outline-sm" onclick="addAdminStatement(${idx})">+ Baris Pernyataan</button>
          </div>
          ${stmtRowsHtml}
        </div>
      `;
    } else {
      const keysHtml = letters.map(l => {
        const isAct = q.answer.includes(l) ? 'active' : '';
        return `<button type="button" class="key-chip ${isAct}" onclick="toggleAdminAnswerKey(${idx}, '${l}')">${l}</button>`;
      }).join('');

      const optInputsHtml = letters.map((l, optIdx) => `
        <input type="text" placeholder="Teks opsi ${l} (opsional jika soal cetak)"
          value="${(q.options[optIdx] || '').replace(/"/g, '&quot;')}"
          onchange="adminQuestions[${idx}].options[${optIdx}] = this.value"
          style="margin-top:6px;" />
      `).join('');

      answerSectionHtml = `
        <div class="form-group">
          <label>Teks Pilihan Jawaban (Opsional)</label>
          ${optInputsHtml}
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>Kunci Jawaban Benar ${q.type === 'mcma' ? '(Bisa klik lebih dari 1 huruf)' : ''}</label>
          <div class="admin-key-selector">${keysHtml}</div>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="admin-q-item-top">
        <strong>Nomor ${idx + 1}</strong>
        <button type="button" class="btn-del-q" onclick="deleteAdminQuestion(${idx})">Hapus Nomor</button>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Tipe Soal</label>
          <select onchange="changeAdminQType(${idx}, this.value)">
            <option value="single" ${q.type === 'single' ? 'selected' : ''}>Pilihan Ganda (1 Jawaban)</option>
            <option value="mcma" ${q.type === 'mcma' ? 'selected' : ''}>MCMA (Jawaban Ganda)</option>
            <option value="category" ${q.type === 'category' ? 'selected' : ''}>Pilihan Kategori (Tabel Benar/Salah)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Bobot Poin</label>
          <input type="number" step="0.5" value="${q.points}" onchange="adminQuestions[${idx}].points = parseFloat(this.value) || 1" />
        </div>
      </div>

      <div class="form-group">
        <label>Teks Soal / Pengantar (Opsional jika pakai lembar cetak PDF)</label>
        <textarea rows="2" placeholder="Ketik teks soal atau kosongkan..." onchange="adminQuestions[${idx}].text = this.value">${q.text || ''}</textarea>
      </div>

      <div class="form-group">
        <label>Gambar Soal (Jika Ada — Otomatis Dikompresi Ringan)</label>
        <input type="file" accept="image/*" onchange="handleAdminImageUpload(event, ${idx})" />
        ${q.image ? `<img src="${q.image}" class="adm-img-preview" />` : ''}
      </div>

      ${answerSectionHtml}
    `;
    container.appendChild(item);
  });
}

function changeAdminQType(idx, newType) {
  const q = adminQuestions[idx];
  q.type = newType;

  if (newType === 'category') {
    if (!q.categories || q.categories.length < 2) q.categories = ['Benar', 'Salah'];
    if (!q.statements || q.statements.length === 0) q.statements = ['', '', ''];
    q.answer = q.statements.map((_, i) => (q.answer[i] && q.categories.includes(q.answer[i])) ? q.answer[i] : q.categories[0]);
  } else if (newType === 'single') {
    if (!OPTION_LETTERS.includes(q.answer[0])) q.answer = ['A'];
    else q.answer = [q.answer[0]];
  } else if (newType === 'mcma') {
    if (!q.answer.length || !OPTION_LETTERS.includes(q.answer[0])) q.answer = ['A'];
  }
  renderAdminQuestions();
}

function updateAdminCategories(idx, rawValue) {
  const parsed = rawValue.split(',').map(s => s.trim()).filter(Boolean);
  if (parsed.length < 2) {
    alert('Minimal harus ada 2 kategori (contoh: Benar, Salah).');
    renderAdminQuestions();
    return;
  }
  const q = adminQuestions[idx];
  q.categories = parsed;
  q.answer = q.statements.map((_, sIdx) => parsed.includes(q.answer[sIdx]) ? q.answer[sIdx] : parsed[0]);
  renderAdminQuestions();
}

function addAdminStatement(idx) {
  const q = adminQuestions[idx];
  q.statements.push('');
  q.answer.push(q.categories[0] || 'Benar');
  renderAdminQuestions();
}

function removeAdminStatement(idx, sIdx) {
  const q = adminQuestions[idx];
  if (q.statements.length <= 1) return;
  q.statements.splice(sIdx, 1);
  q.answer.splice(sIdx, 1);
  renderAdminQuestions();
}

function setAdminCategoryKey(idx, sIdx, chosenCat) {
  adminQuestions[idx].answer[sIdx] = chosenCat;
  renderAdminQuestions();
}

function toggleAdminAnswerKey(idx, letter) {
  const q = adminQuestions[idx];
  if (q.type === 'mcma') {
    if (q.answer.includes(letter)) {
      if (q.answer.length > 1) q.answer = q.answer.filter(l => l !== letter);
    } else {
      q.answer.push(letter);
      q.answer.sort();
    }
  } else {
    q.answer = [letter];
  }
  renderAdminQuestions();
}

function handleAdminImageUpload(event, idx) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX_W = 680;
      const scale = img.width > MAX_W ? MAX_W / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      adminQuestions[idx].image = canvas.toDataURL('image/jpeg', 0.72);
      renderAdminQuestions();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function buildPacketObject() {
  const title = document.getElementById('admTitle').value.trim() || 'Paket Tryout LBB';
  const subtitle = document.getElementById('admSubtitle').value.trim() || `${adminQuestions.length} Soal`;
  const duration = parseInt(document.getElementById('admDuration').value) || 60;
  const optionCount = parseInt(document.getElementById('admOptionCount').value) || 4;
  const token = document.getElementById('admToken').value.trim().toUpperCase() || 'TRYOUT26';
  const mcmaRule = document.getElementById('admMcmaRule').value;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return {
    fileName: `${slug || 'paket-tryout'}.json`,
    packetObj: {
      title,
      subtitle,
      duration,
      optionCount,
      token,
      mcmaRule,
      questions: adminQuestions.map(q => {
        if (q.type === 'category') {
          return {
            type: 'category',
            text: q.text,
            image: q.image,
            categories: q.categories,
            statements: q.statements,
            answer: q.answer,
            points: q.points
          };
        }
        return {
          type: q.type,
          text: q.text,
          image: q.image,
          options: q.options.slice(0, optionCount),
          answer: q.answer,
          points: q.points
        };
      })
    }
  };
}

function exportPacketJson() {
  if (adminQuestions.length === 0) {
    alert('Tambahkan minimal 1 soal terlebih dahulu.');
    return;
  }

  const { fileName, packetObj } = buildPacketObject();
  const blob = new Blob([JSON.stringify(packetObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  const btn = document.getElementById('btnDownloadPacketLocal');
  if (btn && !btn.dataset.animating) {
    btn.dataset.animating = '1';
    const oriHtml = btn.innerHTML;
    btn.classList.add('btn-success-state');
    btn.innerHTML = `<i data-lucide="check"></i> Downloaded`;
    refreshIcons();

    setTimeout(() => {
      btn.classList.remove('btn-success-state');
      btn.innerHTML = oriHtml;
      delete btn.dataset.animating;
      refreshIcons();
    }, 3000);
  }
}

async function sendPacketToAdminDrive() {
  const scriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;
  if (!scriptUrl || scriptUrl.includes('PASTE_URL')) {
    alert('URL Google Apps Script belum dipasang di js/app.js.');
    return;
  }

  if (adminQuestions.length === 0) {
    alert('Tambahkan minimal 1 soal terlebih dahulu.');
    return;
  }

  const { fileName, packetObj } = buildPacketObject();
  const btn = document.getElementById('btnSendPacketCloud');
  if (!btn || btn.dataset.animating) return;

  btn.dataset.animating = '1';
  const oriHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerText = 'Mengirim...';

  const payloadObj = {
    action: 'upload_packet',
    packetTitle: packetObj.title,
    questionCount: adminQuestions.length,
    fileName: fileName,
    content: JSON.stringify(packetObj, null, 2)
  };

  try {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = scriptUrl;
    form.target = 'hiddenFrame';
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify(payloadObj);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
      form.remove();
    }, 1000);

    btn.classList.add('btn-success-state');
    btn.innerHTML = `<i data-lucide="check-circle"></i> Terkirim!`;
    refreshIcons();

    setTimeout(() => {
      btn.classList.remove('btn-success-state');
      btn.disabled = false;
      btn.innerHTML = oriHtml;
      delete btn.dataset.animating;
      refreshIcons();
    }, 3000);
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = oriHtml;
    delete btn.dataset.animating;
    refreshIcons();
    alert('Gagal mengirim ke Google Drive. Gunakan tombol Download Cadangan (.JSON) di bawahnya.');
  }
}

function importPacketJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      document.getElementById('admTitle').value = data.title || '';
      document.getElementById('admSubtitle').value = data.subtitle || '';
      document.getElementById('admDuration').value = data.duration || 60;
      document.getElementById('admOptionCount').value = data.optionCount || 4;
      document.getElementById('admToken').value = data.token || 'TRYOUT26';
      document.getElementById('admMcmaRule').value = data.mcmaRule || 'all_or_nothing';

      adminQuestions = (data.questions || []).map(q => ({
        type: q.type || 'single',
        text: q.text || '',
        image: q.image || '',
        options: q.options || ['', '', '', '', ''],
        categories: q.categories || ['Benar', 'Salah'],
        statements: q.statements || ['', '', ''],
        answer: q.answer || (q.type === 'category' ? ['Benar', 'Benar', 'Benar'] : ['A']),
        points: q.points || 2.5
      }));

      renderAdminQuestions();
      switchAdminTab('questions');
      alert('Paket soal berhasil dimuat untuk diedit!');
    } catch (_) {
      alert('File JSON tidak valid.');
    }
  };
  reader.readAsText(file);
}

// ==================== 5. REKAP NILAI & EKSPOR EXCEL (.CSV) ====================
async function fetchRecapFromSheets() {
  const scriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;
  const btn = document.getElementById('btnFetchRecap');
  const tbody = document.getElementById('recapTableBody');

  if (!scriptUrl || scriptUrl.includes('PASTE_URL')) {
    alert('URL Google Apps Script belum dipasang di js/app.js.');
    return;
  }

  const oriHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Memuat...';
  }
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px;">Mengambil data nilai dari Google Sheets...</td></tr>`;
  }

  try {
    const res = await fetch(`${scriptUrl}?action=get_results&t=${Date.now()}`);
    const data = await res.json();

    if (data.status === 'ok' && Array.isArray(data.rows)) {
      allRecapRows = data.rows;
      populateRecapFilterOptions();
      applyRecapFilters();
    } else {
      throw new Error('Format data tidak valid');
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--primary);">Gagal memuat data. Pastikan Google Apps Script sudah di-deploy ulang dengan akses "Anyone".</td></tr>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oriHtml;
      refreshIcons();
    }
  }
}

function populateRecapFilterOptions() {
  const pktSelect = document.getElementById('filterRecapPacket');
  const schSelect = document.getElementById('filterRecapSchool');
  const clsSelect = document.getElementById('filterRecapClass');

  const uniquePackets = [...new Set(allRecapRows.map(r => r.packetTitle).filter(Boolean))].sort();
  const uniqueSchools = [...new Set(allRecapRows.map(r => r.school).filter(Boolean))].sort();
  const uniqueClasses = [...new Set(allRecapRows.map(r => r.stuClass).filter(Boolean))].sort();

  pktSelect.innerHTML = `<option value="">Semua Paket Ujian</option>` +
    uniquePackets.map(p => `<option value="${p}">${p}</option>`).join('');
  schSelect.innerHTML = `<option value="">Semua Asal Sekolah</option>` +
    uniqueSchools.map(s => `<option value="${s}">${s}</option>`).join('');
  clsSelect.innerHTML = `<option value="">Semua Kelas</option>` +
    uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('');
}

function applyRecapFilters() {
  const fPkt = document.getElementById('filterRecapPacket').value;
  const fSch = document.getElementById('filterRecapSchool').value;
  const fCls = document.getElementById('filterRecapClass').value;
  const sortBy = document.getElementById('sortRecapBy').value;

  filteredRecapRows = allRecapRows.filter(r => {
    if (fPkt && r.packetTitle !== fPkt) return false;
    if (fSch && r.school !== fSch) return false;
    if (fCls && r.stuClass !== fCls) return false;
    return true;
  });

  if (sortBy === 'score_desc') {
    filteredRecapRows.sort((a, b) => b.score - a.score);
  } else if (sortBy === 'name_asc') {
    filteredRecapRows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'class_asc') {
    filteredRecapRows.sort((a, b) => a.stuClass.localeCompare(b.stuClass) || a.name.localeCompare(b.name));
  } else {
    filteredRecapRows.sort((a, b) => b.rowIndex - a.rowIndex);
  }

  renderRecapTable();
}

function renderRecapTable() {
  const tbody = document.getElementById('recapTableBody');
  const countLabel = document.getElementById('recapCountLabel');
  const avgLabel = document.getElementById('recapAvgLabel');

  const count = filteredRecapRows.length;
  const avg = count > 0
    ? (filteredRecapRows.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / count).toFixed(2)
    : '0';

  if (countLabel) countLabel.innerText = `Menampilkan ${count} data siswa`;
  if (avgLabel) avgLabel.innerText = `Rata-rata Skor: ${avg}`;

  if (!tbody) return;
  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--text-muted);">Tidak ada data yang sesuai filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredRecapRows.map((r, i) => {
    const tabBadge = r.tabSwitches > 0
      ? `<span class="tab-badge-warn">${r.tabSwitches}x Keluar</span>`
      : `<span class="tab-badge-ok">Aman (0x)</span>`;

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${r.timestamp}</td>
        <td><strong>${r.packetTitle}</strong></td>
        <td>${r.name}</td>
        <td>${r.school}</td>
        <td>${r.stuClass}</td>
        <td><strong style="color:var(--primary);">${r.score}</strong> / ${r.maxScore}</td>
        <td>${r.correctCount}</td>
        <td>${tabBadge}</td>
      </tr>
    `;
  }).join('');
}

function exportRecapToExcelCsv() {
  if (!filteredRecapRows || filteredRecapRows.length === 0) {
    alert('Belum ada data nilai untuk diunduh. Klik "Tarik Data Nilai" terlebih dahulu.');
    return;
  }

  const headers = [
    'No',
    'Waktu Selesai',
    'Paket Ujian',
    'Nama Siswa',
    'Asal Sekolah',
    'Kelas / No Peserta',
    'Skor Akhir',
    'Skor Maksimal',
    'Jumlah Benar',
    'Keluar Tab (x)',
    'Rincian Jawaban'
  ];

  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const csvLines = [
    headers.map(escapeCsv).join(';'),
    ...filteredRecapRows.map((r, i) => [
      i + 1,
      r.timestamp,
      r.packetTitle,
      r.name,
      r.school,
      r.stuClass,
      String(r.score).replace('.', ','),
      r.maxScore,
      r.correctCount,
      r.tabSwitches,
      r.rawAnswers
    ].map(escapeCsv).join(';'))
  ];

  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const fPkt = document.getElementById('filterRecapPacket').value || 'Semua-Paket';
  const slug = fPkt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const a = document.createElement('a');
  a.href = url;
  a.download = `Rekap-Nilai-${slug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  loadPacketsManifest();
  refreshIcons();
});