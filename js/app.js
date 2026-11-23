// ==================== KONFIGURASI UTAMA ====================
const ADMIN_MASTER_PIN = 'MjMxMTI2'; // PIN 6 Angka Admin LBB (231126)
const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMXLtM4WQwOCoDDb-lNpJfyBJR1BP2pRM6CnobiAhdca3hMYhBgw5LaPrA2sMKl-VkbQ/exec';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

let availablePackets = [];
let activePacket = null;
let studentInfo = null;
let studentAnswers = {}; // { [qIndex]: ['A'] atau ['A','C'] }
let studentDoubts = {};  // { [qIndex]: true }
let currentQIndex = 0;
let timerInterval = null;
let remainingSeconds = 0;
let lastResultPayload = null;

// State untuk Panel Admin Pembuat Soal
let adminQuestions = [];

function refreshIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ==================== 1. MUAT DAFTAR PAKET UJIAN ====================
async function loadPacketsManifest() {
  const container = document.getElementById('packetsList');
  try {
    const res = await fetch('paket/manifest.json?t=' + Date.now());
    if (!res.ok) throw new Error('Manifest tidak ditemukan');
    availablePackets = await res.json();
    renderPacketsList();
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <p class="muted-text">Belum ada paket ujian di folder <code>paket/manifest.json</code>.</p>
      </div>
    `;
  }
}

function renderPacketsList() {
  const container = document.getElementById('packetsList');
  container.innerHTML = '';

  availablePackets.forEach(pkt => {
    const card = document.createElement('div');
    card.className = 'packet-card';
    card.onclick = () => openStudentLoginModal(pkt);
    card.innerHTML = `
      <div class="packet-info">
        <h3>${pkt.title}</h3>
        <p>${pkt.subtitle || ''}</p>
        <div class="packet-meta-tags">
          <span class="tag-mini">${pkt.questionCount} Soal</span>
          <span class="tag-mini">${pkt.duration} Menit</span>
        </div>
      </div>
      <i data-lucide="chevron-right" style="color:#840000;"></i>
    `;
    container.appendChild(card);
  });
  refreshIcons();
}

function openStudentLoginModal(pkt) {
  document.getElementById('selectedPacketFile').value = pkt.file;
  document.getElementById('modalPacketTitle').innerText = pkt.title;
  document.getElementById('stuTokenInput').value = '';
  document.getElementById('tokenErrorMsg').classList.add('hidden');
  document.getElementById('studentLoginModal').classList.remove('hidden');
  refreshIcons();
}

async function submitStartExam(e) {
  e.preventDefault();
  const file = document.getElementById('selectedPacketFile').value;
  const name = document.getElementById('stuName').value.trim();
  const school = document.getElementById('stuSchool').value.trim();
  const stuClass = document.getElementById('stuClass').value.trim();
  const enteredToken = document.getElementById('stuTokenInput').value.trim().toUpperCase();

  try {
    const res = await fetch(`paket/${file}?t=` + Date.now());
    const packetData = await res.json();

    if (packetData.token && enteredToken !== packetData.token.toUpperCase()) {
      document.getElementById('tokenErrorMsg').classList.remove('hidden');
      return;
    }

    activePacket = packetData;
    studentInfo = { name, school, stuClass };
    closeModal('studentLoginModal');
    startExamSession();
  } catch (err) {
    alert('Gagal memuat file soal. Pastikan koneksi internet stabil.');
  }
}

// ==================== 2. SESI UJIAN CBT (DENGAN AUTO-SAVE) ====================
function getStorageBackupKey() {
  return `tryout_autosave_${activePacket.title}_${studentInfo.name}_${studentInfo.stuClass}`;
}

function startExamSession() {
  const savedRaw = localStorage.getItem(getStorageBackupKey());
  if (savedRaw) {
    try {
      const parsed = JSON.parse(savedRaw);
      studentAnswers = parsed.answers || {};
      studentDoubts = parsed.doubts || {};
      remainingSeconds = parsed.remainingSeconds || (activePacket.duration * 60);
    } catch (_) {
      studentAnswers = {};
      studentDoubts = {};
      remainingSeconds = activePacket.duration * 60;
    }
  } else {
    studentAnswers = {};
    studentDoubts = {};
    remainingSeconds = activePacket.duration * 60;
  }

  currentQIndex = 0;
  document.getElementById('hudStudentName').innerText = studentInfo.name;
  document.getElementById('hudPacketMeta').innerText = `${activePacket.title} • ${studentInfo.school} (${studentInfo.stuClass})`;

  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('examScreen').classList.remove('hidden');

  updateAnsweredBadge();
  renderCBTQuestion();
  renderNumberGrid();
  startCountdownTimer();
  refreshIcons();
}

function saveProgressLocally() {
  if (!activePacket || !studentInfo) return;
  localStorage.setItem(getStorageBackupKey(), JSON.stringify({
    answers: studentAnswers,
    doubts: studentDoubts,
    remainingSeconds
  }));
}

function startCountdownTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds % 5 === 0) saveProgressLocally();
    updateTimerDisplay();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      alert('Waktu ujian telah habis! Jawabanmu akan dikirim otomatis.');
      finalizeAndSubmitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(Math.max(0, remainingSeconds) / 60);
  const s = Math.max(0, remainingSeconds) % 60;
  const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  document.getElementById('examTimerText').innerText = text;

  const box = document.getElementById('timerBox');
  if (remainingSeconds <= 300) box.classList.add('warning');
  else box.classList.remove('warning');
}

function updateAnsweredBadge() {
  const total = activePacket.questions.length;
  const answered = Object.keys(studentAnswers).filter(k => studentAnswers[k] && studentAnswers[k].length > 0).length;
  document.getElementById('answeredCountBadge').innerText = `${answered} / ${total} Terjawab`;
}

function renderCBTQuestion() {
  const q = activePacket.questions[currentQIndex];
  const total = activePacket.questions.length;
  const letters = OPTION_LETTERS.slice(0, activePacket.optionCount || 4);

  document.getElementById('cbtQuestionNum').innerText = `Soal No. ${currentQIndex + 1} dari ${total}`;
  document.getElementById('cbtQuestionType').innerText =
    q.type === 'mcma' ? 'MCMA (Pilih Lebih dari 1)' : 'Pilihan Ganda';

  const imgBox = document.getElementById('cbtImageBox');
  if (q.image) {
    document.getElementById('cbtQuestionImg').src = q.image;
    imgBox.classList.remove('hidden');
  } else {
    imgBox.classList.add('hidden');
  }

  document.getElementById('cbtQuestionText').innerText =
    q.text || '(Perhatikan soal pada lembar cetak PDF untuk nomor ini)';

  const optContainer = document.getElementById('cbtOptionsContainer');
  optContainer.innerHTML = '';
  const selectedArr = studentAnswers[currentQIndex] || [];

  letters.forEach((letter, idx) => {
    const isSelected = selectedArr.includes(letter);
    const optText = (q.options && q.options[idx]) ? q.options[idx] : `Pilihan ${letter}`;

    const div = document.createElement('div');
    div.className = `option-item ${isSelected ? 'selected' : ''}`;
    div.onclick = () => selectAnswer(currentQIndex, letter, q.type);
    div.innerHTML = `
      <div class="opt-bullet ${q.type === 'mcma' ? 'mcma-box' : ''}">${letter}</div>
      <div class="opt-label-text">${optText}</div>
    `;
    optContainer.appendChild(div);
  });

  document.getElementById('cbtDoubtCheck').checked = !!studentDoubts[currentQIndex];
  document.getElementById('btnPrevQ').disabled = currentQIndex === 0;
  document.getElementById('btnNextQ').disabled = currentQIndex === total - 1;

  // Tampilkan tombol "Selesai & Kirim Jawaban" HANYA saat berada di nomor soal terakhir
  const bottomBar = document.getElementById('examBottomBar');
  if (currentQIndex === total - 1) {
    bottomBar.classList.remove('hidden');
  } else {
    bottomBar.classList.add('hidden');
  }
}

function selectAnswer(qIdx, letter, type) {
  let current = studentAnswers[qIdx] ? [...studentAnswers[qIdx]] : [];

  if (type === 'mcma') {
    if (current.includes(letter)) {
      current = current.filter(l => l !== letter);
    } else {
      current.push(letter);
      current.sort();
    }
  } else {
    current = [letter];
  }

  studentAnswers[qIdx] = current;
  saveProgressLocally();
  updateAnsweredBadge();
  renderCBTQuestion();
  renderNumberGrid();
}

function toggleDoubtCurrent() {
  studentDoubts[currentQIndex] = document.getElementById('cbtDoubtCheck').checked;
  saveProgressLocally();
  renderNumberGrid();
}

function navigateQuestion(delta) {
  const next = currentQIndex + delta;
  if (next >= 0 && next < activePacket.questions.length) {
    currentQIndex = next;
    renderCBTQuestion();
    renderNumberGrid();
  }
}

function renderNumberGrid() {
  const grid = document.getElementById('questionNumberGrid');
  grid.innerHTML = '';

  activePacket.questions.forEach((_, idx) => {
    const hasAns = studentAnswers[idx] && studentAnswers[idx].length > 0;
    const isDoubt = !!studentDoubts[idx];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-btn';
    if (isDoubt) btn.classList.add('doubt');
    else if (hasAns) btn.classList.add('answered');
    if (idx === currentQIndex) btn.classList.add('current');

    btn.innerText = idx + 1;
    btn.onclick = () => {
      currentQIndex = idx;
      renderCBTQuestion();
      renderNumberGrid();
    };
    grid.appendChild(btn);
  });
}

// ==================== 3. PENILAIAN OTOMATIS & KIRIM KE GOOGLE SHEETS ====================
function openConfirmSubmitModal() {
  const total = activePacket.questions.length;
  const answered = Object.keys(studentAnswers).filter(k => studentAnswers[k] && studentAnswers[k].length > 0).length;
  const unanswered = total - answered;

  document.getElementById('submitSummaryText').innerText =
    unanswered > 0
      ? `Kamu sudah menjawab ${answered} dari ${total} soal. Masih ada ${unanswered} soal kosong. Yakin ingin mengirim sekarang?`
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

    const userAns = (studentAnswers[idx] || []).slice().sort();
    const keyAns = (q.answer || []).slice().sort();

    if (userAns.length > 0) answeredCount++;
    rawAnswersList.push(`${idx + 1}:${userAns.join('+') || '-'}`);

    if (q.type === 'mcma') {
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
    rawAnswers: result.rawAnswersString
  };

  await sendPayloadWithRetry(lastResultPayload);
}

// Kirim hasil ke Google Sheets secara senyap di belakang layar (tanpa menampilkan URL/status teknis ke siswa)
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
}

// ==================== 4. PANEL ADMIN PEMBUAT SOAL LBB ====================
function openAdminAuthModal() {
  document.getElementById('adminPinInput').value = '';
  document.getElementById('adminPinError').classList.add('hidden');
  document.getElementById('adminAuthModal').classList.remove('hidden');
  refreshIcons();
}

function submitAdminAuth(e) {
  e.preventDefault();
  const pin = document.getElementById('adminPinInput').value.trim();
  if (btoa(pin) === ADMIN_MASTER_PIN) {
    closeModal('adminAuthModal');
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
  refreshIcons();
}

function exitAdminPanel() {
  document.getElementById('adminScreen').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
}

function generateRandomToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('admToken').value = token;
}

function addSingleQuestion() {
  adminQuestions.push({
    type: 'single',
    text: '',
    image: '',
    options: ['', '', '', '', ''],
    answer: ['A'],
    points: 2.5
  });
  renderAdminQuestions();
}

function addBulkQuestions(count) {
  for (let i = 0; i < count; i++) {
    adminQuestions.push({
      type: 'single',
      text: '',
      image: '',
      options: ['', '', '', '', ''],
      answer: ['A'],
      points: 2.5
    });
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
  container.innerHTML = '';

  adminQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'admin-q-item';

    const keysHtml = letters.map(l => {
      const isAct = q.answer.includes(l) ? 'active' : '';
      return `<button type="button" class="key-chip ${isAct}" onclick="toggleAdminAnswerKey(${idx}, '${l}')">${l}</button>`;
    }).join('');

    const optInputsHtml = letters.map((l, optIdx) => `
      <input type="text" placeholder="Teks opsi ${l} (opsional jika soal cetak)"
        value="${q.options[optIdx] || ''}"
        onchange="adminQuestions[${idx}].options[${optIdx}] = this.value"
        style="margin-top:6px;" />
    `).join('');

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
          </select>
        </div>
        <div class="form-group">
          <label>Bobot Poin</label>
          <input type="number" step="0.5" value="${q.points}" onchange="adminQuestions[${idx}].points = parseFloat(this.value) || 1" />
        </div>
      </div>

      <div class="form-group">
        <label>Teks Soal (Opsional jika pakai lembar cetak PDF)</label>
        <textarea rows="2" placeholder="Ketik teks soal atau kosongkan..." onchange="adminQuestions[${idx}].text = this.value">${q.text || ''}</textarea>
      </div>

      <div class="form-group">
        <label>Gambar Soal (Jika Ada — Otomatis Dikompresi Ringan)</label>
        <input type="file" accept="image/*" onchange="handleAdminImageUpload(event, ${idx})" />
        ${q.image ? `<img src="${q.image}" class="adm-img-preview" />` : ''}
      </div>

      <div class="form-group">
        <label>Teks Pilihan Jawaban (Opsional)</label>
        ${optInputsHtml}
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <label>Kunci Jawaban Benar ${q.type === 'mcma' ? '(Bisa klik lebih dari 1 huruf)' : ''}</label>
        <div class="admin-key-selector">${keysHtml}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

function changeAdminQType(idx, newType) {
  adminQuestions[idx].type = newType;
  if (newType === 'single' && adminQuestions[idx].answer.length > 1) {
    adminQuestions[idx].answer = [adminQuestions[idx].answer[0]];
  }
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

// Kompresi otomatis gambar soal ke JPEG ringan agar kuat 1000 user bersamaan
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
      questions: adminQuestions.map(q => ({
        type: q.type,
        text: q.text,
        image: q.image,
        options: q.options.slice(0, optionCount),
        answer: q.answer,
        points: q.points
      }))
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

  // Ubah tampilan tombol menjadi hijau bertuliskan "Downloaded" selama 3 detik
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

  const formBody = new URLSearchParams();
  formBody.append('payload', JSON.stringify(payloadObj));

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formBody
    });

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
} // <-- kurung kurawal tutup terakhir untuk async function sendPacketToAdminDrive()

    // Ubah tampilan tombol menjadi hijau bertuliskan "Terkirim!" selama 3 detik
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
        answer: q.answer || ['A'],
        points: q.points || 2.5
      }));

      renderAdminQuestions();
      alert('Paket soal berhasil dimuat untuk diedit!');
    } catch (_) {
      alert('File JSON tidak valid.');
    }
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  loadPacketsManifest();
  refreshIcons();
});