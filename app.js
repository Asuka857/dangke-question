const STORAGE_KEY = "dangke-question-bank-state";
const AUTO_NEXT_DELAY_MS = 900;

const state = {
  payload: null,
  filteredQuestions: [],
  currentIndex: 0,
  randomMode: false,
  showAnswer: false,
  progress: {},
  wrongSet: new Set(),
  selectedOptions: [],
  answerFeedback: null,
  autoNextTimer: null,
};

const elements = {
  heroStats: document.getElementById("hero-stats"),
  typeFilter: document.getElementById("type-filter"),
  searchInput: document.getElementById("search-input"),
  jumpInput: document.getElementById("jump-input"),
  jumpButton: document.getElementById("jump-button"),
  jumpStatus: document.getElementById("jump-status"),
  upload: document.getElementById("json-upload"),
  incrementalStatus: document.getElementById("incremental-status"),
  recordStatus: document.getElementById("record-status"),
  exportRecord: document.getElementById("export-record"),
  importRecordTrigger: document.getElementById("import-record-trigger"),
  importRecord: document.getElementById("import-record"),
  resultCount: document.getElementById("result-count"),
  questionPosition: document.getElementById("question-position"),
  progressLabel: document.getElementById("progress-label"),
  progressFill: document.getElementById("progress-fill"),
  questionMeta: document.getElementById("question-meta"),
  questionStem: document.getElementById("question-stem"),
  fillWrongButton: document.getElementById("fill-wrong-button"),
  optionList: document.getElementById("option-list"),
  optionActions: document.getElementById("option-actions"),
  submitAnswer: document.getElementById("submit-answer"),
  resetSelection: document.getElementById("reset-selection"),
  answerBox: document.getElementById("answer-box"),
  noteBox: document.getElementById("note-box"),
  sequentialButton: document.getElementById("mode-sequential"),
  randomButton: document.getElementById("mode-random"),
  prevButton: document.getElementById("prev-question"),
  nextButton: document.getElementById("next-question"),
  answerButton: document.getElementById("toggle-answer"),
  wrongButton: document.getElementById("toggle-wrong"),
  incrementalButton: document.getElementById("toggle-incremental-practice"),
  reviewWrongButton: document.getElementById("toggle-wrong-review"),
  clearWrongButton: document.getElementById("clear-wrong-set"),
};

state.reviewWrongOnly = false;
state.incrementalOnly = false;
state.restoredQuestionId = null;
state.restoredTypeFilter = "全部";
state.restoredSearchKeyword = "";

function getCurrentQuestion() {
  return state.filteredQuestions[state.currentIndex] || null;
}

function isFillQuestion(question) {
  return question?.type === "填空题";
}

function buildPersistedSnapshot() {
  const currentQuestion = getCurrentQuestion();
  const typeFilter = elements.typeFilter?.value || state.restoredTypeFilter || "全部";
  const searchKeyword = elements.searchInput?.value || state.restoredSearchKeyword || "";

  state.restoredQuestionId = currentQuestion?.id || state.restoredQuestionId || null;
  state.restoredTypeFilter = typeFilter;
  state.restoredSearchKeyword = searchKeyword;

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    progress: state.progress,
    wrongIds: [...state.wrongSet],
    currentQuestionId: state.restoredQuestionId,
    typeFilter,
    searchKeyword,
    randomMode: state.randomMode,
    reviewWrongOnly: state.reviewWrongOnly,
    incrementalOnly: state.incrementalOnly,
  };
}

function updateRecordStatus() {
  const wrongCount = state.wrongSet.size;
  const viewedCount = Object.keys(state.progress || {}).length;
  const question = getCurrentQuestion();
  const position = state.filteredQuestions.length ? state.currentIndex + 1 : 0;
  const total = state.filteredQuestions.length;

  elements.recordStatus.textContent = question
    ? `已保存在当前浏览器：上次做到 ${question.id}（${position} / ${total}），错题 ${wrongCount} 题，已浏览 ${viewedCount} 题。`
    : `已保存在当前浏览器：错题 ${wrongCount} 题，已浏览 ${viewedCount} 题。`;
}

function setJumpStatus(message, isError = false) {
  elements.jumpStatus.textContent = message;
  elements.jumpStatus.classList.toggle("is-error", isError);
}

function updateJumpStatus() {
  if (!state.filteredQuestions.length) {
    setJumpStatus("当前结果为空，可输入题目 ID 直接定位到某一题。", true);
    return;
  }
  setJumpStatus(
    `当前可跳转 1 - ${state.filteredQuestions.length} 题，也可输入 Q00025 这类题目 ID。`,
  );
}

function loadPersistedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.progress = saved.progress || {};
    state.wrongSet = new Set(saved.wrongIds || []);
    state.randomMode = Boolean(saved.randomMode);
    state.reviewWrongOnly = Boolean(saved.reviewWrongOnly);
    state.incrementalOnly = Boolean(saved.incrementalOnly);
    state.restoredQuestionId = saved.currentQuestionId || null;
    state.restoredTypeFilter = saved.typeFilter || "全部";
    state.restoredSearchKeyword = saved.searchKeyword || "";
  } catch {
    state.progress = {};
    state.wrongSet = new Set();
    state.randomMode = false;
    state.reviewWrongOnly = false;
    state.incrementalOnly = false;
    state.restoredQuestionId = null;
    state.restoredTypeFilter = "全部";
    state.restoredSearchKeyword = "";
  }
}

function persistState() {
  const snapshot = buildPersistedSnapshot();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(snapshot),
  );
  updateRecordStatus();
}

function buildHeroStats(meta) {
  const cards = [
    { label: "题库总量", value: meta.totalQuestions || 0 },
    { label: "新增题", value: meta.incrementalNewQuestions || 0 },
    { label: "待复核题", value: meta.conflictItems || 0 },
    { label: "题型种类", value: Object.keys(meta.typeCounts || {}).length },
    { label: "生成时间", value: (meta.generatedAt || "").slice(0, 10) || "-" },
  ];

  elements.heroStats.innerHTML = cards
    .map(
      (card) =>
        `<div class="stat-card"><strong>${card.value}</strong><span>${card.label}</span></div>`,
    )
    .join("");
}

function populateTypeFilter(questions) {
  const types = [...new Set(questions.map((question) => question.type))];
  elements.typeFilter.innerHTML = ['<option value="全部">全部题型</option>']
    .concat(types.map((type) => `<option value="${type}">${type}</option>`))
    .join("");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAnswerLabels(answer = "") {
  return [...new Set(String(answer).toUpperCase().replace(/[^A-Z]/g, "").split("").filter(Boolean))];
}

function isSelectableQuestion(question) {
  return Boolean(question && Object.keys(question.options || {}).length);
}

function isMultiSelectQuestion(question) {
  if (!question) {
    return false;
  }
  if (question.type === "多选题") {
    return true;
  }
  return normalizeAnswerLabels(question.answer).length > 1;
}

function getSelectedAnswerLabel() {
  return state.selectedOptions.slice().sort().join("");
}

function getCorrectAnswerText(question) {
  const labels = normalizeAnswerLabels(question.answer);
  if (!labels.length) {
    return question.answer || "暂无答案";
  }
  const detail = labels
    .map((label) => {
      const value = question.options?.[label];
      return value ? `${label}. ${value}` : label;
    })
    .join("；");
  return detail || question.answer;
}

function getDisplayStem(question) {
  return question.stem;
}

function setAnswerFeedback(type, message) {
  elements.answerBox.classList.remove("hidden", "is-correct", "is-incorrect", "is-info");
  elements.answerBox.classList.add(type);
  elements.answerBox.innerHTML = message;
}

function clearAnswerFeedback() {
  elements.answerBox.classList.remove("is-correct", "is-incorrect", "is-info");
  elements.answerBox.classList.add("hidden");
  elements.answerBox.innerHTML = "";
}

function clearAutoNextTimer() {
  if (state.autoNextTimer) {
    window.clearTimeout(state.autoNextTimer);
    state.autoNextTimer = null;
  }
}

function updateWrongReviewControls() {
  const wrongCount = state.wrongSet.size;
  elements.reviewWrongButton.textContent = state.reviewWrongOnly
    ? `退出错题复习（${wrongCount}）`
    : `错题复习（${wrongCount}）`;
  elements.reviewWrongButton.classList.toggle("is-active", state.reviewWrongOnly);
  elements.clearWrongButton.disabled = wrongCount === 0;
}

function getIncrementalQuestionCount() {
  return state.payload?.meta?.incrementalNewQuestions || 0;
}

function formatSourceCollections(question) {
  const labels = (question.sourceCollections || []).map((name) => {
    if (name === "existing") {
      return "原始文件";
    }
    if (name === "incremental") {
      return "新增数据";
    }
    return name;
  });
  return labels.join(" / ") || "未标注来源";
}

function updateIncrementalControls() {
  const total = getIncrementalQuestionCount();
  elements.incrementalButton.textContent = state.incrementalOnly
    ? `退出新增题练习（${total}）`
    : `新增题练习（${total}）`;
  elements.incrementalButton.classList.toggle("is-active", state.incrementalOnly);
  elements.incrementalButton.disabled = total === 0;
  elements.incrementalStatus.textContent = total
    ? `新增来源去重后共有 ${state.payload?.meta?.incrementalQuestions || 0} 题，其中实际新增入库 ${total} 题。`
    : "当前题库未标记新增入库题。";
}

function toggleCurrentWrongQuestion() {
  const question = state.filteredQuestions[state.currentIndex];
  if (!question) {
    return;
  }
  if (state.wrongSet.has(question.id)) {
    state.wrongSet.delete(question.id);
  } else {
    state.wrongSet.add(question.id);
  }
  persistState();
  if (state.reviewWrongOnly) {
    state.currentIndex = 0;
    applyFilters();
    return;
  }
  updateWrongReviewControls();
  renderQuestion();
}

function resetInteractionState() {
  clearAutoNextTimer();
  state.selectedOptions = [];
  state.answerFeedback = null;
  state.showAnswer = false;
}

function applyFilters({ preserveQuestionId = false } = {}) {
  resetInteractionState();
  if (state.reviewWrongOnly && state.wrongSet.size === 0) {
    state.reviewWrongOnly = false;
  }
  if (state.incrementalOnly && !(state.payload?.questions || []).some((question) => question.isIncrementalAddition)) {
    state.incrementalOnly = false;
  }
  const typeValue = elements.typeFilter.value;
  const keyword = normalizeText(elements.searchInput.value);
  const targetQuestionId = preserveQuestionId ? state.restoredQuestionId : null;
  const questions = state.payload?.questions || [];

  state.filteredQuestions = questions.filter((question) => {
    const typeMatched = typeValue === "全部" || question.type === typeValue;
    const wrongMatched = !state.reviewWrongOnly || state.wrongSet.has(question.id);
    const incrementalMatched = !state.incrementalOnly || question.isIncrementalAddition;
    if (!typeMatched) {
      return false;
    }
    if (!wrongMatched) {
      return false;
    }
    if (!incrementalMatched) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const searchable = [
      question.stem,
      ...Object.values(question.options || {}),
      question.answer,
      ...(question.notes || []),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(keyword);
  });

  if (!state.filteredQuestions.length) {
    state.currentIndex = 0;
    renderEmptyState();
    updateSummary();
    updateWrongReviewControls();
    updateIncrementalControls();
    updateJumpStatus();
    persistState();
    return;
  }

  if (state.randomMode) {
    shuffleQuestions();
  }
  if (targetQuestionId) {
    const restoredIndex = state.filteredQuestions.findIndex((question) => question.id === targetQuestionId);
    state.currentIndex = restoredIndex >= 0 ? restoredIndex : 0;
  } else {
    state.currentIndex = Math.min(state.currentIndex, state.filteredQuestions.length - 1);
  }
  updateSummary();
  updateWrongReviewControls();
  updateIncrementalControls();
  renderQuestion();
  updateJumpStatus();
  persistState();
}

function shuffleQuestions() {
  const cloned = [...state.filteredQuestions];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[target]] = [cloned[target], cloned[index]];
  }
  state.filteredQuestions = cloned;
}

function renderEmptyState() {
  elements.questionMeta.innerHTML = "";
  elements.questionStem.textContent = "没有匹配到题目";
  elements.optionList.innerHTML = "";
  elements.optionActions.classList.add("hidden");
  clearAnswerFeedback();
  elements.noteBox.classList.add("hidden");
  elements.fillWrongButton.classList.add("hidden");
  elements.questionPosition.textContent = "0 / 0";
  elements.progressLabel.textContent = "进度 0%";
  elements.progressFill.style.width = "0%";
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.answerButton.disabled = true;
  elements.answerButton.textContent = "显示答案";
  updateIncrementalControls();
  updateRecordStatus();
}

function updateSummary() {
  const total = state.filteredQuestions.length;
  if (state.reviewWrongOnly && state.incrementalOnly) {
    elements.resultCount.textContent = `新增错题复习 ${total} 题`;
  } else if (state.reviewWrongOnly) {
    elements.resultCount.textContent = `错题复习 ${total} 题`;
  } else if (state.incrementalOnly) {
    elements.resultCount.textContent = `新增题练习 ${total} 题`;
  } else {
    elements.resultCount.textContent = `当前结果 ${total} 题`;
  }
  elements.sequentialButton.classList.toggle("is-active", !state.randomMode);
  elements.randomButton.classList.toggle("is-active", state.randomMode);
}

function renderQuestion() {
  const question = state.filteredQuestions[state.currentIndex];
  if (!question) {
    renderEmptyState();
    return;
  }

  const progressValue = Math.round(((state.currentIndex + 1) / state.filteredQuestions.length) * 100);
  const isWrong = state.wrongSet.has(question.id);
  const visitCount = state.progress[question.id] || 0;
  const sourceLabel = formatSourceCollections(question);
  const incrementalTag = question.isIncrementalAddition
    ? "新增入库题"
    : question.containsIncrementalSource
      ? "含新增来源"
      : "原始题库";

  elements.questionMeta.innerHTML = [
    `<div class="meta-pill">${question.id}</div>`,
    `<div class="meta-pill">${question.type}</div>`,
    `<div class="meta-pill">${incrementalTag}</div>`,
    `<div class="meta-pill">${sourceLabel}</div>`,
    `<div class="meta-pill">来源 ${question.sourceFiles.length} 个文件</div>`,
    `<div class="meta-pill">已查看 ${visitCount} 次</div>`,
    `<div class="meta-pill">${isWrong ? "已标记错题" : "未标记错题"}</div>`,
  ].join("");

  elements.questionStem.textContent = getDisplayStem(question);
  elements.optionList.innerHTML = renderOptions(question);
  renderOptionActions(question);
  renderAnswerState(question);

  const noteText = question.notes?.length ? question.notes.join("；") : "";
  if (noteText) {
    elements.noteBox.innerHTML = `<strong>备注：</strong>${noteText}`;
    elements.noteBox.classList.toggle("hidden", !(state.showAnswer || state.answerFeedback));
  } else {
    elements.noteBox.classList.add("hidden");
  }

  elements.questionPosition.textContent = `${state.currentIndex + 1} / ${state.filteredQuestions.length}`;
  elements.progressLabel.textContent = `进度 ${progressValue}%`;
  elements.progressFill.style.width = `${progressValue}%`;
  elements.wrongButton.textContent = isWrong ? "取消错题" : "错题标记";
  if (isFillQuestion(question)) {
    elements.fillWrongButton.classList.remove("hidden");
    elements.fillWrongButton.textContent = isWrong ? "移出错题" : "加入错题";
  } else {
    elements.fillWrongButton.classList.add("hidden");
  }
  elements.prevButton.disabled = state.currentIndex === 0;
  elements.nextButton.disabled = state.currentIndex >= state.filteredQuestions.length - 1;
  if (state.answerFeedback) {
    elements.answerButton.textContent = "答案已显示";
    elements.answerButton.disabled = true;
  } else if (isFillQuestion(question)) {
    elements.answerButton.textContent = state.showAnswer ? "隐藏填空答案" : "显示填空答案";
    elements.answerButton.disabled = false;
  } else {
    elements.answerButton.textContent = state.showAnswer ? "隐藏答案" : "显示答案";
    elements.answerButton.disabled = false;
  }
  updateRecordStatus();
}

function renderOptions(question) {
  const entries = Object.entries(question.options || {});
  if (!entries.length) {
    return '<div class="option-item"><strong>-</strong><div>该题无结构化选项。</div></div>';
  }

  const correctLabels = new Set(normalizeAnswerLabels(question.answer));
  const selectedLabels = new Set(state.selectedOptions);
  const answered = Boolean(state.answerFeedback);

  return entries
    .map(([label, value]) => {
      const classes = ["option-item"];
      if (selectedLabels.has(label)) {
        classes.push("is-selected");
      }
      if (answered && correctLabels.has(label)) {
        classes.push("is-correct");
      }
      if (answered && selectedLabels.has(label) && !correctLabels.has(label)) {
        classes.push("is-wrong");
      }
      if (answered) {
        classes.push("is-disabled");
      }

      return `
        <button type="button" class="${classes.join(" ")}" data-option-label="${label}">
          <strong>${label}</strong>
          <div>${value}</div>
        </button>
      `;
    })
    .join("");
}

function renderOptionActions(question) {
  const selectable = isSelectableQuestion(question);
  const isMulti = isMultiSelectQuestion(question);
  const answered = Boolean(state.answerFeedback);

  elements.optionActions.classList.toggle("hidden", !selectable || !isMulti);
  elements.submitAnswer.disabled = answered || !state.selectedOptions.length;
  elements.resetSelection.disabled = answered || !state.selectedOptions.length;
}

function renderAnswerState(question) {
  if (state.answerFeedback) {
    setAnswerFeedback(state.answerFeedback.type, state.answerFeedback.message);
    return;
  }

  if (isFillQuestion(question)) {
    if (!state.showAnswer) {
      clearAnswerFeedback();
      return;
    }
    const reviewText = question.reviewReason
      ? `<br /><strong>复核提示：</strong>${question.reviewReason}`
      : "";
    setAnswerFeedback("is-info", `<strong>填空答案：</strong>${question.answer || "暂无答案"}${reviewText}`);
    return;
  }

  if (!state.showAnswer) {
    clearAnswerFeedback();
    return;
  }

  const answerText = getCorrectAnswerText(question);
  const reviewText = question.reviewReason
    ? `<br /><strong>复核提示：</strong>${question.reviewReason}`
    : "";
  setAnswerFeedback("is-info", `<strong>答案：</strong>${answerText}${reviewText}`);
}

function buildResultMessage(question, isCorrect) {
  const selectedAnswer = getSelectedAnswerLabel() || "未作答";
  const correctAnswer = getCorrectAnswerText(question);
  const reviewText = question.reviewReason
    ? `<br /><strong>复核提示：</strong>${question.reviewReason}`
    : "";

  if (isCorrect) {
    return {
      type: "is-correct",
      message: `<strong>回答正确。</strong><br />你的选择：${selectedAnswer}${reviewText}`,
    };
  }

  return {
    type: "is-incorrect",
    message: `<strong>回答错误。</strong><br />你的选择：${selectedAnswer}<br /><strong>正确答案：</strong>${correctAnswer}${reviewText}`,
  };
}

function queueAutoNext() {
  clearAutoNextTimer();
  if (state.currentIndex >= state.filteredQuestions.length - 1) {
    return;
  }
  state.autoNextTimer = window.setTimeout(() => {
    state.autoNextTimer = null;
    goToQuestion(state.currentIndex + 1);
  }, AUTO_NEXT_DELAY_MS);
}

function submitCurrentAnswer() {
  const question = state.filteredQuestions[state.currentIndex];
  if (!question || !isSelectableQuestion(question) || state.answerFeedback) {
    return;
  }

  const expectedLabels = normalizeAnswerLabels(question.answer).sort().join("");
  const actualLabels = getSelectedAnswerLabel();
  const isCorrect = expectedLabels && expectedLabels === actualLabels;
  if (!isCorrect) {
    state.wrongSet.add(question.id);
    persistState();
  }
  state.answerFeedback = buildResultMessage(question, isCorrect);
  state.showAnswer = true;
  updateWrongReviewControls();
  renderQuestion();
  queueAutoNext();
}

function handleOptionSelection(label) {
  const question = state.filteredQuestions[state.currentIndex];
  if (!question || !isSelectableQuestion(question) || state.answerFeedback) {
    return;
  }

  if (isMultiSelectQuestion(question)) {
    if (state.selectedOptions.includes(label)) {
      state.selectedOptions = state.selectedOptions.filter((item) => item !== label);
    } else {
      state.selectedOptions = [...state.selectedOptions, label].sort();
    }
    renderQuestion();
    const expectedCount = normalizeAnswerLabels(question.answer).length;
    if (expectedCount > 1 && state.selectedOptions.length >= expectedCount) {
      submitCurrentAnswer();
    }
    return;
  }

  state.selectedOptions = [label];
  submitCurrentAnswer();
}

function markCurrentVisited() {
  const question = state.filteredQuestions[state.currentIndex];
  if (!question) {
    return;
  }
  state.progress[question.id] = (state.progress[question.id] || 0) + 1;
  persistState();
}

function goToQuestion(nextIndex) {
  if (!state.filteredQuestions.length) {
    return;
  }
  state.currentIndex = Math.max(0, Math.min(nextIndex, state.filteredQuestions.length - 1));
  resetInteractionState();
  markCurrentVisited();
  renderQuestion();
  updateJumpStatus();
  persistState();
}

function jumpToQuestion() {
  const rawValue = elements.jumpInput.value.trim();
  if (!rawValue) {
    setJumpStatus("请输入当前结果序号，或输入题目 ID 再跳转。", true);
    return;
  }

  const normalizedId = rawValue.toUpperCase();
  if (/^Q\d+$/.test(normalizedId)) {
    const currentMatchIndex = state.filteredQuestions.findIndex((question) => question.id === normalizedId);
    if (currentMatchIndex >= 0) {
      goToQuestion(currentMatchIndex);
      setJumpStatus(`已跳转到 ${normalizedId}。`);
      return;
    }

    const existsInBank = state.payload?.questions?.some((question) => question.id === normalizedId);
    if (!existsInBank) {
      setJumpStatus(`没有找到题目 ${normalizedId}。`, true);
      return;
    }

    state.reviewWrongOnly = false;
    state.incrementalOnly = false;
    elements.typeFilter.value = "全部";
    elements.searchInput.value = "";
    state.currentIndex = 0;
    state.restoredQuestionId = normalizedId;
    applyFilters({ preserveQuestionId: true });
    setJumpStatus(`已跳转到 ${normalizedId}，并自动切换到全题库视图。`);
    return;
  }

  const targetIndex = Number(rawValue);
  if (!Number.isInteger(targetIndex) || targetIndex < 1) {
    setJumpStatus("请输入正整数序号，或像 Q00025 这样的题目 ID。", true);
    return;
  }

  if (!state.filteredQuestions.length) {
    setJumpStatus("当前结果为空，无法按序号跳转。", true);
    return;
  }

  if (targetIndex > state.filteredQuestions.length) {
    setJumpStatus(`当前结果只有 ${state.filteredQuestions.length} 题，无法跳到第 ${targetIndex} 题。`, true);
    return;
  }

  goToQuestion(targetIndex - 1);
  setJumpStatus(`已跳转到当前结果中的第 ${targetIndex} 题。`);
}

function attachEvents() {
  elements.typeFilter.addEventListener("change", () => {
    state.currentIndex = 0;
    applyFilters();
  });

  elements.searchInput.addEventListener("input", () => {
    state.currentIndex = 0;
    applyFilters();
  });

  elements.jumpButton.addEventListener("click", () => {
    jumpToQuestion();
  });

  elements.jumpInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    jumpToQuestion();
  });

  elements.sequentialButton.addEventListener("click", () => {
    state.randomMode = false;
    state.currentIndex = 0;
    applyFilters();
  });

  elements.randomButton.addEventListener("click", () => {
    state.randomMode = true;
    state.currentIndex = 0;
    applyFilters();
  });

  elements.incrementalButton.addEventListener("click", () => {
    if (!getIncrementalQuestionCount()) {
      return;
    }
    state.incrementalOnly = !state.incrementalOnly;
    state.currentIndex = 0;
    applyFilters();
  });

  elements.prevButton.addEventListener("click", () => goToQuestion(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => goToQuestion(state.currentIndex + 1));

  elements.answerButton.addEventListener("click", () => {
    state.showAnswer = !state.showAnswer;
    if (!state.showAnswer && !state.answerFeedback) {
      clearAnswerFeedback();
    }
    renderQuestion();
  });

  elements.wrongButton.addEventListener("click", () => {
    toggleCurrentWrongQuestion();
  });

  elements.fillWrongButton.addEventListener("click", () => {
    toggleCurrentWrongQuestion();
  });

  elements.reviewWrongButton.addEventListener("click", () => {
    state.reviewWrongOnly = !state.reviewWrongOnly;
    state.currentIndex = 0;
    applyFilters();
  });

  elements.clearWrongButton.addEventListener("click", () => {
    if (!state.wrongSet.size) {
      return;
    }
    const shouldClear = window.confirm("确认清空错题集吗？");
    if (!shouldClear) {
      return;
    }
    state.wrongSet.clear();
    if (state.reviewWrongOnly) {
      state.currentIndex = 0;
      applyFilters();
      return;
    }
    persistState();
    updateWrongReviewControls();
    renderQuestion();
  });

  elements.exportRecord.addEventListener("click", () => {
    const snapshot = buildPersistedSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dangke-study-record.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  elements.importRecordTrigger.addEventListener("click", () => {
    elements.importRecord.click();
  });

  elements.importRecord.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    const text = await file.text();
    const saved = JSON.parse(text);
    state.progress = saved.progress || {};
    state.wrongSet = new Set(saved.wrongIds || []);
    state.randomMode = Boolean(saved.randomMode);
    state.reviewWrongOnly = Boolean(saved.reviewWrongOnly);
    state.incrementalOnly = Boolean(saved.incrementalOnly);
    state.restoredQuestionId = saved.currentQuestionId || null;
    state.restoredTypeFilter = saved.typeFilter || "全部";
    state.restoredSearchKeyword = saved.searchKeyword || "";
    initWithPayload(state.payload);
    elements.importRecord.value = "";
  });

  elements.optionList.addEventListener("click", (event) => {
    const optionButton = event.target.closest("[data-option-label]");
    if (!optionButton) {
      return;
    }
    handleOptionSelection(optionButton.dataset.optionLabel);
  });

  elements.submitAnswer.addEventListener("click", () => {
    submitCurrentAnswer();
  });

  elements.resetSelection.addEventListener("click", () => {
    if (state.answerFeedback) {
      return;
    }
    state.selectedOptions = [];
    renderQuestion();
  });

  elements.upload.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    const text = await file.text();
    const payload = JSON.parse(text);
    initWithPayload(payload);
  });
}

async function loadPayload() {
  if (window.QUESTION_BANK_DATA) {
    return window.QUESTION_BANK_DATA;
  }
  const response = await fetch("./questions.json");
  if (!response.ok) {
    throw new Error("无法加载 questions.json");
  }
  return response.json();
}

function initWithPayload(payload) {
  state.payload = payload;
  state.currentIndex = 0;
  resetInteractionState();
  buildHeroStats(payload.meta || {});
  populateTypeFilter(payload.questions || []);
  elements.typeFilter.value = [...elements.typeFilter.options].some(
    (option) => option.value === state.restoredTypeFilter,
  )
    ? state.restoredTypeFilter
    : "全部";
  elements.searchInput.value = state.restoredSearchKeyword;
  updateWrongReviewControls();
  updateIncrementalControls();
  applyFilters({ preserveQuestionId: true });
}

async function bootstrap() {
  loadPersistedState();
  attachEvents();

  try {
    const payload = await loadPayload();
    initWithPayload(payload);
  } catch (error) {
    elements.resultCount.textContent = "自动加载失败";
    elements.questionStem.textContent = "请通过左侧“数据加载”手动选择 web/questions.json";
    elements.optionList.innerHTML = "";
    elements.answerBox.classList.add("hidden");
    elements.noteBox.classList.add("hidden");
  }
}

bootstrap();
