/* =========================================================
   МАТЕМАТИЧЕСКАЯ ВИКТОРИНА — логика приложения
   ========================================================= */
'use strict';

/* ---------- Состояние игры ---------- */
const state = {
  roundIndex: 0,        // текущий раунд (0..4)
  questionIndex: 0,     // вопрос внутри раунда (0..5)
  answered: false,      // зафиксирован ли ответ на текущий вопрос
  results: [],          // результаты по раундам: [{correct, wrong, timeout, details:[...]}]
  sound: true
};

/* ---------- Таймер (единственный экземпляр) ---------- */
const timer = {
  id: null,
  left: 0,
  start(seconds, onTick, onExpire) {
    this.stop(); // защита от двойного запуска
    this.left = seconds;
    onTick(this.left);
    this.id = setInterval(() => {
      this.left -= 1;
      if (this.left <= 0) {
        this.left = 0;
        this.stop();
        onTick(0);
        onExpire();
      } else {
        onTick(this.left);
      }
    }, 1000);
  },
  stop() {
    if (this.id !== null) {
      clearInterval(this.id);
      this.id = null;
    }
  }
};

/* Таймер автоперехода после показа ответа */
const feedbackTimer = {
  id: null,
  start(ms, fn) {
    this.stop();
    this.id = setTimeout(() => { this.id = null; fn(); }, ms);
  },
  stop() {
    if (this.id !== null) {
      clearTimeout(this.id);
      this.id = null;
    }
  }
};

/* ---------- Звуковые эффекты (WebAudio, без внешних файлов) ---------- */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, duration, type = 'sine', gainValue = 0.18, when = 0) {
  if (!state.sound || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, audioCtx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + when);
  osc.stop(audioCtx.currentTime + when + duration);
}
const sounds = {
  click()   { ensureAudio(); beep(660, 0.08, 'square', 0.08); },
  correct() { ensureAudio(); beep(523, 0.15); beep(659, 0.15, 'sine', 0.18, 0.12); beep(784, 0.28, 'sine', 0.18, 0.24); },
  wrong()   { ensureAudio(); beep(220, 0.25, 'sawtooth', 0.14); beep(165, 0.35, 'sawtooth', 0.12, 0.18); },
  timeout() { ensureAudio(); beep(440, 0.2, 'triangle', 0.15); beep(330, 0.2, 'triangle', 0.15, 0.2); beep(220, 0.4, 'triangle', 0.15, 0.4); },
  fanfare() { ensureAudio(); [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.16, i * 0.16)); }
};

/* ---------- Вспомогательные функции ---------- */
const $ = (sel) => document.querySelector(sel);
const LETTERS = ['A', 'B', 'C', 'D'];

function currentRound() { return QUIZ_DATA.rounds[state.roundIndex]; }
function currentQuestion() { return currentRound().questions[state.questionIndex]; }
function globalQuestionNumber() {
  let n = state.questionIndex + 1;
  for (let i = 0; i < state.roundIndex; i++) n += QUIZ_DATA.rounds[i].questions.length;
  return n;
}
function currentRoundResult() { return state.results[state.roundIndex]; }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Экран начала раунда ---------- */
function showRoundIntro() {
  timer.stop();
  feedbackTimer.stop();
  const round = currentRound();
  $('#round-kicker').textContent = 'Раунд ' + (state.roundIndex + 1) + ' из ' + QUIZ_DATA.rounds.length;
  $('#round-title').textContent = round.name;
  $('#round-motivation').textContent = round.motivation;
  $('#round-meta').innerHTML =
    'Вопросов в раунде: <b>' + round.questions.length + '</b> &nbsp;•&nbsp; ' +
    'Время на вопрос: <b>' + QUIZ_DATA.timePerQuestion + ' сек</b>';
  showScreen('screen-round-intro');
}

/* ---------- Экран вопроса ---------- */
function showQuestion() {
  timer.stop();
  feedbackTimer.stop();
  state.answered = false;

  const round = currentRound();
  const q = currentQuestion();
  const totalInRound = round.questions.length;
  const globalNum = globalQuestionNumber();

  $('#quiz-round-name').textContent = 'Раунд ' + (state.roundIndex + 1) + '. ' + round.name;
  $('#quiz-counter-round').innerHTML = 'Вопрос <b>' + (state.questionIndex + 1) + '</b> из ' + totalInRound;
  $('#quiz-counter-total').innerHTML = 'Вопрос <b>' + globalNum + '</b> из ' + TOTAL_QUESTIONS;
  $('#progress-fill').style.width = ((globalNum - 1) / TOTAL_QUESTIONS * 100) + '%';

  $('#question-text').innerHTML = q.q;

  const box = $('#answers');
  box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answer-btn';
    btn.innerHTML = '<span class="answer-letter">' + LETTERS[i] + '</span><span>' + opt + '</span>';
    btn.addEventListener('click', () => handleAnswer(i));
    box.appendChild(btn);
  });

  const fb = $('#feedback');
  fb.className = 'feedback';
  fb.textContent = '';

  showScreen('screen-question');

  // Таймер запускается только после появления вопроса
  timer.start(QUIZ_DATA.timePerQuestion, renderTimer, handleTimeout);
}

function renderTimer(seconds) {
  const total = QUIZ_DATA.timePerQuestion;
  $('#timer-value').textContent = seconds;
  const circle = $('#timer-circle');
  circle.style.setProperty('--p', (seconds / total * 100) + '%');
  circle.classList.toggle('danger', seconds <= 10);
}

/* ---------- Обработка ответа ---------- */
function lockAnswers() {
  document.querySelectorAll('.answer-btn').forEach(b => { b.disabled = true; });
}

function revealAnswers(chosenIndex) {
  const q = currentQuestion();
  document.querySelectorAll('.answer-btn').forEach((b, i) => {
    if (i === q.correct) b.classList.add('correct');
    else if (i === chosenIndex) b.classList.add('wrong');
    else b.classList.add('dim');
  });
}

function handleAnswer(chosenIndex) {
  if (state.answered) return;      // защита от повторного ответа
  state.answered = true;
  timer.stop();
  lockAnswers();

  const q = currentQuestion();
  const isCorrect = chosenIndex === q.correct;
  revealAnswers(chosenIndex);

  const res = currentRoundResult();
  const fb = $('#feedback');
  if (isCorrect) {
    res.correct++;
    res.details.push({ q: q.q, status: 'ok', chosen: chosenIndex });
    fb.textContent = 'Правильно! +1 балл';
    fb.className = 'feedback show ok';
    sounds.correct();
  } else {
    res.wrong++;
    res.details.push({ q: q.q, status: 'bad', chosen: chosenIndex });
    fb.textContent = 'Неправильно! Правильный ответ: ' + LETTERS[q.correct] + ') ' + stripTags(q.options[q.correct]);
    fb.className = 'feedback show bad';
    sounds.wrong();
  }

  feedbackTimer.start(QUIZ_DATA.feedbackDelay, nextQuestion);
}

function handleTimeout() {
  if (state.answered) return;      // ответ успел зафиксироваться
  state.answered = true;
  timer.stop();                    // гарантия: таймер не продолжает работать
  lockAnswers();

  const q = currentQuestion();
  revealAnswers(-1);

  const res = currentRoundResult();
  res.timeout++;
  res.details.push({ q: q.q, status: 'none', chosen: -1 });

  const fb = $('#feedback');
  fb.textContent = 'Время вышло! Правильный ответ: ' + LETTERS[q.correct] + ') ' + stripTags(q.options[q.correct]);
  fb.className = 'feedback show timeout';
  sounds.timeout();

  feedbackTimer.start(QUIZ_DATA.feedbackDelay, nextQuestion);
}

function stripTags(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/* ---------- Переходы ---------- */
function nextQuestion() {
  if (state.questionIndex + 1 < currentRound().questions.length) {
    state.questionIndex++;
    showQuestion();
  } else {
    showRoundResults();
  }
}

/* ---------- Результаты раунда ---------- */
function motivationFor(percent) {
  if (percent >= 84) return 'Потрясающе! Раунд пройден блестяще!';
  if (percent >= 67) return 'Отличная работа! Так держать!';
  if (percent >= 50) return 'Хороший результат! Ещё чуть-чуть!';
  if (percent >= 34) return 'Неплохо, но есть куда расти!';
  return 'Не сдавайся! Следующий раунд — твой шанс!';
}

function showRoundResults() {
  timer.stop();
  feedbackTimer.stop();

  const round = currentRound();
  const res = currentRoundResult();
  const total = round.questions.length;
  const percent = Math.round(res.correct / total * 1000) / 10;

  $('#round-result-title').textContent =
    'Раунд ' + (state.roundIndex + 1) + '. ' + round.name + ' — завершён!';
  $('#rr-correct').textContent = res.correct + ' из ' + total;
  $('#rr-wrong').textContent = res.wrong;
  $('#rr-timeout').textContent = res.timeout;
  $('#rr-percent').textContent = percent.toLocaleString('ru-RU') + '%';
  $('#rr-message').textContent = motivationFor(percent);

  // Диаграмма-шкала
  $('#rr-bar-ok').style.width = (res.correct / total * 100) + '%';
  $('#rr-bar-bad').style.width = (res.wrong / total * 100) + '%';
  $('#rr-bar-none').style.width = (res.timeout / total * 100) + '%';

  const nextBtn = $('#rr-next-btn');
  if (state.roundIndex + 1 < QUIZ_DATA.rounds.length) {
    nextBtn.textContent = 'Перейти к следующему раунду';
  } else {
    nextBtn.textContent = 'Посмотреть итоговые результаты';
  }

  showScreen('screen-round-results');
}

/* ---------- Финальные результаты ---------- */
function finalMessage(score) {
  if (score >= 27) return 'Великолепно! Ты настоящий мастер математики!';
  if (score >= 22) return 'Отличный результат!';
  if (score >= 15) return 'Хорошая работа! Продолжай тренироваться!';
  return 'Не останавливайся! Каждая задача помогает стать сильнее!';
}

function totals() {
  return state.results.reduce((acc, r) => {
    acc.correct += r.correct;
    acc.wrong += r.wrong;
    acc.timeout += r.timeout;
    return acc;
  }, { correct: 0, wrong: 0, timeout: 0 });
}

function buildRoundsTable() {
  const t = totals();
  let rows = '';
  state.results.forEach((r, i) => {
    rows += '<tr>' +
      '<td>' + QUIZ_DATA.rounds[i].name + '</td>' +
      '<td>' + r.correct + '</td>' +
      '<td>' + r.wrong + '</td>' +
      '<td>' + r.timeout + '</td>' +
      '<td>' + r.correct + '</td>' +
      '</tr>';
  });
  rows += '<tr class="total-row">' +
    '<td>ИТОГО</td>' +
    '<td>' + t.correct + '</td>' +
    '<td>' + t.wrong + '</td>' +
    '<td>' + t.timeout + '</td>' +
    '<td>' + t.correct + '</td>' +
    '</tr>';
  return rows;
}

function showFinalResults() {
  timer.stop();
  feedbackTimer.stop();

  const t = totals();
  const percent = Math.round(t.correct / TOTAL_QUESTIONS * 1000) / 10;

  $('#final-score').textContent = t.correct + ' из ' + TOTAL_QUESTIONS;
  $('#fin-total').textContent = TOTAL_QUESTIONS;
  $('#fin-correct').textContent = t.correct;
  // Неправильные = выбранные неверно + без ответа (время вышло)
  $('#fin-wrong').textContent = t.wrong + t.timeout;
  $('#fin-timeout').textContent = t.timeout;
  $('#fin-percent').textContent = percent.toLocaleString('ru-RU') + '%';
  $('#final-message').textContent = finalMessage(t.correct);
  $('#rounds-table-body').innerHTML = buildRoundsTable();

  sounds.fanfare();
  showScreen('screen-final');
}

/* ---------- Подробная статистика по вопросам ---------- */
function showDetails() {
  const list = $('#detail-list');
  list.innerHTML = '';
  let num = 0;
  state.results.forEach((r, ri) => {
    r.details.forEach(d => {
      num++;
      const q = QUIZ_DATA.rounds[ri].questions.find(item => item.q === d.q);
      const correctText = q ? LETTERS[q.correct] + ') ' + stripTags(q.options[q.correct]) : '';
      const statusText = d.status === 'ok' ? '✅ Верно' : (d.status === 'bad' ? '❌ Неверно' : '⏱ Без ответа');
      const div = document.createElement('div');
      div.className = 'detail-item ' + d.status;
      div.innerHTML =
        '<div class="dq">' + num + '. ' + d.q + '</div>' +
        '<div class="da">' + statusText + ' &nbsp;•&nbsp; Правильный ответ: <b>' + correctText + '</b></div>';
      list.appendChild(div);
    });
  });
  showScreen('screen-details');
}

/* ---------- Сброс и новая игра ---------- */
function resetGame() {
  timer.stop();
  feedbackTimer.stop();
  state.roundIndex = 0;
  state.questionIndex = 0;
  state.answered = false;
  state.results = QUIZ_DATA.rounds.map(() => ({ correct: 0, wrong: 0, timeout: 0, details: [] }));
}

/* ---------- Математический фон ---------- */
function buildMathBackground() {
  const symbols = ['π', '∑', '√', '∞', '∫', 'Δ', '±', '×', '÷', 'α', 'β', 'θ', 'x²', 'y=1/x', 'sin 30°', 'a²+b²=c²', '7', '42', '3,14', '%', '∠', '≈', '≠', 'φ', 'Ω', '∂', 'x³', '180°', '0,5', 'tg 45°'];
  const bg = $('#math-bg');
  symbols.forEach((sym, i) => {
    const s = document.createElement('span');
    s.textContent = sym;
    s.style.left = (Math.random() * 95) + 'vw';
    s.style.fontSize = (18 + Math.random() * 42) + 'px';
    const dur = 22 + Math.random() * 26;
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = (-Math.random() * dur) + 's';
    bg.appendChild(s);
  });
}

/* ---------- Инициализация ---------- */
function init() {
  buildMathBackground();

  $('#btn-start').addEventListener('click', () => {
    sounds.click();
    resetGame();
    showRoundIntro();
  });

  $('#btn-start-round').addEventListener('click', () => {
    sounds.click();
    state.questionIndex = 0;
    showQuestion();
  });

  $('#rr-next-btn').addEventListener('click', () => {
    sounds.click();
    if (state.roundIndex + 1 < QUIZ_DATA.rounds.length) {
      state.roundIndex++;
      showRoundIntro();
    } else {
      showFinalResults();
    }
  });

  $('#btn-restart').addEventListener('click', () => {
    sounds.click();
    resetGame();
    showRoundIntro();
  });

  $('#btn-details').addEventListener('click', () => {
    sounds.click();
    showDetails();
  });

  $('#btn-details-back').addEventListener('click', () => {
    sounds.click();
    showScreen('screen-final');
  });

  $('#btn-details-restart').addEventListener('click', () => {
    sounds.click();
    resetGame();
    showRoundIntro();
  });

  $('#sound-toggle').addEventListener('click', () => {
    state.sound = !state.sound;
    $('#sound-toggle').textContent = state.sound ? '🔊' : '🔇';
    $('#sound-toggle').setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
    if (state.sound) sounds.click();
  });

  // Стартовые значения
  $('#stat-rounds').innerHTML = '<b>5</b> раундов';
  $('#stat-questions').innerHTML = '<b>' + TOTAL_QUESTIONS + '</b> вопросов';
  $('#stat-time').innerHTML = '<b>' + QUIZ_DATA.timePerQuestion + '</b> секунд на вопрос';

  // Демо-якоря для быстрого визуального предпросмотра экранов
  // (не влияют на обычную игру): #demo-round, #demo-question, #demo-results, #demo-final
  // Якорь читается из location.hash или из хэша в URL этого скрипта (для тестовых копий страницы).
  let demo = location.hash;
  const ownScript = document.querySelector('script[src*="js/app.js"]');
  if (ownScript && ownScript.src.indexOf('#') !== -1) {
    demo = ownScript.src.slice(ownScript.src.indexOf('#'));
  }
  if (demo === '#demo-round') {
    resetGame();
    showRoundIntro();
  } else if (demo === '#demo-question') {
    resetGame();
    showQuestion();
  } else if (demo === '#demo-results') {
    resetGame();
    state.results[0] = { correct: 4, wrong: 1, timeout: 1, details: [] };
    showRoundResults();
  } else if (demo === '#demo-final') {
    resetGame();
    state.results = QUIZ_DATA.rounds.map(r => ({
      correct: 4, wrong: 1, timeout: 1,
      details: r.questions.map((q, qi) => ({
        q: q.q,
        status: qi < 4 ? 'ok' : (qi < 5 ? 'bad' : 'none'),
        chosen: 0
      }))
    }));
    showFinalResults();
  }
}

document.addEventListener('DOMContentLoaded', init);
