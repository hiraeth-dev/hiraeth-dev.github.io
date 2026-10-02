(function() {
  "use strict";

  // Fallback word list, used only if wordlists.js fails to load.
  var WORDS_FALLBACK = [
    "the","be","to","of","and","a","in","that","have","i","it","for","not","on","with","he","as","you","do","at",
    "this","but","his","by","from","they","we","say","her","she","or","an","will","my","one","all","would","there","their","what",
    "so","up","out","if","about","who","get","which","go","me","when","make","can","like","time","no","just","him","know","take",
    "people","into","year","your","good","some","could","them","see","other","than","then","now","look","only","come","its","over","think","also",
    "back","after","use","two","how","our","work","first","well","way","even","new","want","because","any","these","give","day","most","us",
    "great","between","need","large","often","hand","high","place","small","under","long","right","still","house","world","last","school","never","city","tree"
  ];

  var PUNCT_SET = [".", ",", ";", ":", "!", "?"];
  var APOSTROPHE_MAP = {
    "dont": "don't", "cant": "can't", "wont": "won't", "its": "it's",
    "im": "i'm", "youre": "you're", "theyre": "they're", "isnt": "isn't",
    "doesnt": "doesn't", "didnt": "didn't", "wasnt": "wasn't", "couldnt": "couldn't",
    "wouldnt": "wouldn't", "shouldnt": "shouldn't", "ive": "i've", "youve": "you've",
    "weve": "we've", "theyve": "they've", "theyll": "they'll", "youll": "you'll",
    "well": "we'll", "ill": "i'll", "hes": "he's", "shes": "she's",
    "thats": "that's", "whats": "what's", "whos": "who's", "heres": "here's",
    "theres": "there's", "lets": "let's", "oclock": "o'clock"
  };

  var SASSY_LINES = [
    { max: 30, text: "you type like my grandma... and she's dead." },
    { max: 50, text: "are you using just your index fingers?" },
    { max: 70, text: "not bad, but keep it off your resume." },
    { max: 90, text: "fast enough to look busy when the boss walks by." },
    { max: 120, text: "calm down turbo, leave some keys for the rest of us." },
    { max: Infinity, text: "what kind of gaming chair do you have?!" }
  ];

  var DOM = {};
  var idleTimer = null;

  var state = {
    mode: "time",              // "time" | "words"
    timerDuration: 30,         // 15, 30, 60, 120
    wordCount: 50,             // 10, 25, 50, 100
    punctEnabled: false,
    fontSize: "md",            // "sm", "md", "lg"

    words: [],                 // array of strings
    currentWordIdx: 0,
    currentCharIdx: 0,

    correctChars: 0,
    incorrectChars: 0,
    extraChars: 0,
    missedChars: 0,
    totalKeystrokes: 0,

    timerRunning: false,
    timerFinished: false,
    startTime: null,
    timerInterval: null,

    // Error tracking for review & graph
    errorWordIndices: new Set(),
    mistakesPerSecond: {},     // { second: count }
    samples: [],               // array of { sec, wpm, raw, errors }
    lastSampleSec: 0
  };

  function init() {
    DOM.wordsArea = document.getElementById("type-words");
    DOM.wordsViewport = document.getElementById("type-words-viewport");
    DOM.wordsInner = document.getElementById("type-words-inner");
    DOM.caret = document.getElementById("type-caret");
    DOM.mobileInput = document.getElementById("type-mobile-input");

    DOM.liveTimer = document.getElementById("live-timer");
    DOM.liveTimerLbl = document.getElementById("live-timer-lbl");
    DOM.liveBar = document.getElementById("type-live-bar");
    DOM.liveWpm = document.getElementById("live-wpm");
    DOM.liveAcc = document.getElementById("live-acc");

    DOM.results = document.getElementById("type-results");
    DOM.hints = document.getElementById("type-hints");
    DOM.resultWpm = document.getElementById("result-wpm");
    DOM.resultAcc = document.getElementById("result-acc");
    DOM.resultRaw = document.getElementById("result-raw");
    DOM.resultChars = document.getElementById("result-chars");
    DOM.resultMode = document.getElementById("result-mode");
    DOM.resultTime = document.getElementById("result-time");
    DOM.resultSassy = document.getElementById("result-sassy");
    DOM.graph = document.getElementById("type-graph");
    DOM.errorReview = document.getElementById("type-error-review");
    DOM.errorWords = document.getElementById("type-error-words");
    DOM.btnRestart = document.getElementById("btn-restart");

    DOM.timeGroup = document.getElementById("type-time-group");
    DOM.wordsGroup = document.getElementById("type-words-group");
    DOM.punctBtn = document.getElementById("type-punct-btn");

    // Load saved font size preference
    try {
      var savedSize = localStorage.getItem("typer_font_size");
      if (savedSize && ["sm", "md", "lg"].indexOf(savedSize) >= 0) {
        state.fontSize = savedSize;
      }
    } catch (e) {}
    applyFontSize(state.fontSize);

    // Setup toolbar listeners
    setupToolbar();

    // Keydown handling
    document.addEventListener("keydown", handleKeydown);

    // Click to focus
    DOM.wordsArea.addEventListener("click", function() {
      DOM.wordsArea.focus();
      if (DOM.mobileInput) DOM.mobileInput.focus();
    });
    DOM.wordsArea.addEventListener("focus", function() {
      DOM.wordsArea.classList.add("is-focused");
    });
    DOM.wordsArea.addEventListener("blur", function() {
      DOM.wordsArea.classList.remove("is-focused");
    });

    if (DOM.btnRestart) {
      DOM.btnRestart.addEventListener("click", function() {
        restart();
      });
    }

    window.addEventListener("resize", function() {
      updateCaret();
      checkViewportScroll();
    });

    resetTest();
  }

  function setupToolbar() {
    // Mode switch: time vs words
    document.querySelectorAll("#type-mode-group .type-tb-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (state.timerRunning || state.timerFinished) return;
        var mode = btn.getAttribute("data-mode");
        if (mode === state.mode) return;
        state.mode = mode;
        document.querySelectorAll("#type-mode-group .type-tb-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");

        if (mode === "time") {
          DOM.timeGroup.style.display = "flex";
          DOM.wordsGroup.style.display = "none";
        } else {
          DOM.timeGroup.style.display = "none";
          DOM.wordsGroup.style.display = "flex";
        }
        resetTest();
      });
    });

    // Time durations (15, 30, 60, 120)
    document.querySelectorAll("#type-time-group .type-tb-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (state.timerRunning || state.timerFinished) return;
        document.querySelectorAll("#type-time-group .type-tb-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.timerDuration = parseInt(btn.getAttribute("data-dur"), 10);
        resetTest();
      });
    });

    // Word counts (10, 25, 50, 100)
    document.querySelectorAll("#type-words-group .type-tb-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (state.timerRunning || state.timerFinished) return;
        document.querySelectorAll("#type-words-group .type-tb-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.wordCount = parseInt(btn.getAttribute("data-count"), 10);
        resetTest();
      });
    });

    // Punctuation toggle
    if (DOM.punctBtn) {
      DOM.punctBtn.addEventListener("click", function() {
        if (state.timerRunning || state.timerFinished) return;
        state.punctEnabled = !state.punctEnabled;
        DOM.punctBtn.classList.toggle("active", state.punctEnabled);
        DOM.punctBtn.setAttribute("aria-pressed", state.punctEnabled ? "true" : "false");
        // the button doubles as the state readout
        DOM.punctBtn.textContent = state.punctEnabled ? "on" : "off";
        resetTest();
      });
    }

    // Font size buttons (S, M, L)
    document.querySelectorAll("#type-size-group .type-tb-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var size = btn.getAttribute("data-size");
        applyFontSize(size);
        try { localStorage.setItem("typer_font_size", size); } catch(e) {}
      });
    });
  }

  function applyFontSize(size) {
    state.fontSize = size;
    DOM.wordsArea.classList.remove("font-size-sm", "font-size-md", "font-size-lg");
    DOM.wordsArea.classList.add("font-size-" + size);

    document.querySelectorAll("#type-size-group .type-tb-btn").forEach(function(b) {
      b.classList.toggle("active", b.getAttribute("data-size") === size);
    });

    // Recalculate caret metrics & scroll
    requestAnimationFrame(function() {
      updateCaret();
      checkViewportScroll();
    });
  }

  function getWordPool() {
    if (window.TYPING_WORDLISTS && window.TYPING_WORDLISTS.EASY && window.TYPING_WORDLISTS.EASY.length) {
      return window.TYPING_WORDLISTS.EASY;
    }
    if (window.TYPING_WORDLISTS && window.TYPING_WORDLISTS.HARD && window.TYPING_WORDLISTS.HARD.length) {
      return window.TYPING_WORDLISTS.HARD;
    }
    return WORDS_FALLBACK;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function generateWords() {
    var pool = getWordPool();
    var count = state.mode === "words" ? state.wordCount : Math.max(220, Math.ceil(state.timerDuration * 3.5));
    var shuffled = shuffle(pool);
    var result = [];

    for (var i = 0; i < count; i++) {
      var w = shuffled[i % shuffled.length].toLowerCase();

      if (state.punctEnabled) {
        // Apostrophe contraction chance
        if (APOSTROPHE_MAP[w] && Math.random() < 0.25) {
          w = APOSTROPHE_MAP[w];
        }
        // Capitalize 1 in 5 words (start of sentences)
        if (i === 0 || Math.random() < 0.2) {
          w = w.charAt(0).toUpperCase() + w.slice(1);
        }
        // Append punctuation 1 in 5 words
        if (Math.random() < 0.22) {
          var p = PUNCT_SET[Math.floor(Math.random() * PUNCT_SET.length)];
          w += p;
        }
      }

      result.push(w);
    }
    return result;
  }

  function renderWords() {
    state.words = generateWords();
    state.currentWordIdx = 0;
    state.currentCharIdx = 0;
    state.correctChars = 0;
    state.incorrectChars = 0;
    state.extraChars = 0;
    state.missedChars = 0;
    state.totalKeystrokes = 0;
    state.errorWordIndices = new Set();
    state.mistakesPerSecond = {};
    state.samples = [];
    state.lastSampleSec = 0;

    var html = "";
    for (var wi = 0; wi < state.words.length; wi++) {
      var wordStr = state.words[wi];
      html += '<div class="type-word' + (wi === 0 ? ' active-word' : '') + '" data-w="' + wi + '">';
      for (var ci = 0; ci < wordStr.length; ci++) {
        html += '<span class="tc" data-c="' + ci + '">' + escapeHtml(wordStr[ci]) + '</span>';
      }
      html += '</div>';
    }

    DOM.wordsInner.innerHTML = html;
    DOM.wordsViewport.scrollTop = 0;

    // Reset caret
    updateCaret();
    markCaretActive();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function updateCaret() {
    if (!DOM.caret || !DOM.wordsInner) return;
    var wordEls = DOM.wordsInner.children;
    if (!wordEls.length || state.currentWordIdx >= wordEls.length) return;

    var curWordEl = wordEls[state.currentWordIdx];
    var letterEls = curWordEl.children;

    var caretLeft, caretTop, caretHeight;

    if (state.currentCharIdx < letterEls.length) {
      // In front of the letter
      var targetLetter = letterEls[state.currentCharIdx];
      caretLeft = curWordEl.offsetLeft + targetLetter.offsetLeft;
      caretTop = curWordEl.offsetTop + targetLetter.offsetTop;
      caretHeight = targetLetter.offsetHeight || 28;
    } else {
      // At the end of the word
      var lastLetter = letterEls[letterEls.length - 1];
      caretLeft = curWordEl.offsetLeft + lastLetter.offsetLeft + lastLetter.offsetWidth + 1;
      caretTop = curWordEl.offsetTop + lastLetter.offsetTop;
      caretHeight = lastLetter.offsetHeight || 28;
    }

    DOM.caret.style.left = caretLeft + "px";
    DOM.caret.style.top = caretTop + "px";
    DOM.caret.style.height = caretHeight + "px";
  }

  function markCaretActive() {
    if (!DOM.caret) return;
    DOM.caret.classList.remove("blink");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      DOM.caret.classList.add("blink");
    }, 500);
  }

  function checkViewportScroll() {
    var wordEls = DOM.wordsInner.children;
    if (!wordEls.length || state.currentWordIdx >= wordEls.length) return;

    var curWordEl = wordEls[state.currentWordIdx];
    var firstWordEl = wordEls[0];
    if (!curWordEl || !firstWordEl) return;

    var lineHeight = firstWordEl.offsetHeight || 38;
    var currentWordTop = curWordEl.offsetTop;
    var firstWordTop = firstWordEl.offsetTop;

    var lineDiff = Math.round((currentWordTop - firstWordTop) / lineHeight);

    // If on line 2 or later, scroll viewport so current line stays centered/top
    if (lineDiff >= 1) {
      DOM.wordsViewport.scrollTop = (lineDiff - 1) * lineHeight;
    } else {
      DOM.wordsViewport.scrollTop = 0;
    }
  }

  function startTimer() {
    if (state.timerRunning) return;
    state.timerRunning = true;
    state.startTime = Date.now();
    state.timerInterval = setInterval(tick, 100);
  }

  function tick() {
    if (!state.timerRunning) return;
    var elapsed = (Date.now() - state.startTime) / 1000;

    updateTimerDisplay(elapsed);
    updateLiveStats(elapsed);
    sampleMetrics(elapsed);

    if (state.mode === "time" && state.timerDuration - elapsed <= 0) {
      endTest();
    }
  }

  function updateTimerDisplay(elapsed) {
    if (state.mode === "time") {
      var remaining = Math.max(0, Math.ceil(state.timerDuration - elapsed));
      DOM.liveTimer.textContent = remaining;
      DOM.liveTimer.classList.toggle("urgent", remaining <= 5 && remaining > 0);
      // the label has to describe whichever figure is showing
      if (DOM.liveTimerLbl) DOM.liveTimerLbl.textContent = "seconds left";
    } else {
      DOM.liveTimer.textContent = Math.min(state.currentWordIdx + 1, state.words.length) + "/" + state.wordCount;
      DOM.liveTimer.classList.remove("urgent");
      if (DOM.liveTimerLbl) DOM.liveTimerLbl.textContent = "words done";
    }
  }

  function sampleMetrics(elapsed) {
    var sec = Math.floor(elapsed);
    if (sec > state.lastSampleSec) {
      state.lastSampleSec = sec;
      var minutes = elapsed / 60;
      var wpm = minutes > 0 ? Math.round((state.correctChars / 5) / minutes) : 0;
      var raw = minutes > 0 ? Math.round((state.totalKeystrokes / 5) / minutes) : 0;
      var errors = state.mistakesPerSecond[sec] || 0;
      state.samples.push({
        sec: sec,
        wpm: Math.max(0, wpm),
        raw: Math.max(0, raw),
        errors: errors
      });
    }
  }

  function updateLiveStats(elapsed) {
    if (elapsed < 0.4) return;
    var minutes = elapsed / 60;
    var wpm = Math.round((state.correctChars / 5) / minutes) || 0;
    var totalCharsTyped = state.correctChars + state.incorrectChars;
    var acc = totalCharsTyped > 0 ? Math.round((state.correctChars / totalCharsTyped) * 100) : 100;

    DOM.liveWpm.textContent = Math.max(0, wpm);
    DOM.liveAcc.textContent = Math.min(100, Math.max(0, acc));
  }

  function handleKeydown(e) {
    // If finished: Tab restarts, Esc returns home
    if (state.timerFinished) {
      if (e.key === "Tab") { e.preventDefault(); restart(); }
      if (e.key === "Escape") { window.location.href = "/"; }
      return;
    }

    if (e.key === "Escape") {
      if (!state.timerRunning) { window.location.href = "/"; }
      else { restart(); }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      restart();
      return;
    }

    // Ignore standalone modifier keys
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].indexOf(e.key) >= 0) return;

    // Start timer on first keystroke
    if (!state.timerRunning && !state.timerFinished) {
      if (e.key.length === 1 || e.key === "Backspace") {
        startTimer();
      }
    }

    // Ctrl+Backspace / Alt+Backspace: delete entire word
    if (e.key === "Backspace" && (e.ctrlKey || e.altKey || e.metaKey)) {
      e.preventDefault();
      handleWordBackspace();
      return;
    }

    // Normal Backspace
    if (e.key === "Backspace") {
      e.preventDefault();
      handleCharBackspace();
      return;
    }

    // Spacebar: advance word
    if (e.key === " ") {
      e.preventDefault();
      handleSpace();
      return;
    }

    // Regular typing character
    if (e.key.length === 1) {
      handleChar(e.key);
    }
  }

  function handleChar(ch) {
    var wordEls = DOM.wordsInner.children;
    if (state.currentWordIdx >= wordEls.length) return;

    state.totalKeystrokes++;
    var curWordEl = wordEls[state.currentWordIdx];
    var targetWordStr = state.words[state.currentWordIdx];
    var letterEls = curWordEl.children;

    if (state.currentCharIdx < targetWordStr.length) {
      // Typing within the word boundary
      var expectedChar = targetWordStr[state.currentCharIdx];
      var letterSpan = letterEls[state.currentCharIdx];

      if (ch === expectedChar) {
        letterSpan.classList.add("correct");
        letterSpan.classList.remove("incorrect", "missed");
        state.correctChars++;
      } else {
        letterSpan.classList.add("incorrect");
        letterSpan.classList.remove("correct", "missed");
        state.incorrectChars++;
        recordMistake();
      }
      state.currentCharIdx++;
    } else {
      // Extra characters beyond target word
      if (state.currentCharIdx - targetWordStr.length < 10) {
        var extraSpan = document.createElement("span");
        extraSpan.className = "tc extra";
        extraSpan.textContent = ch;
        curWordEl.appendChild(extraSpan);
        state.extraChars++;
        state.incorrectChars++;
        recordMistake();
        state.currentCharIdx++;
      }
    }

    updateCaret();
    markCaretActive();
    checkViewportScroll();

    var elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
    updateLiveStats(elapsed);
  }

  function handleSpace() {
    // Prevent starting with multiple spaces
    if (state.currentWordIdx === 0 && state.currentCharIdx === 0 && !state.timerRunning) return;

    var wordEls = DOM.wordsInner.children;
    if (state.currentWordIdx >= wordEls.length) return;

    var curWordEl = wordEls[state.currentWordIdx];
    var targetWordStr = state.words[state.currentWordIdx];
    var letterEls = curWordEl.children;

    // If word was only partially typed, mark remainder as missed
    if (state.currentCharIdx < targetWordStr.length) {
      for (var i = state.currentCharIdx; i < targetWordStr.length; i++) {
        var span = letterEls[i];
        if (!span.classList.contains("correct") && !span.classList.contains("incorrect")) {
          span.classList.add("missed");
          state.missedChars++;
          state.incorrectChars++;
        }
      }
      recordMistake();
    }

    // Check if current word had errors
    var hasErr = curWordEl.querySelector(".incorrect, .extra, .missed");
    if (hasErr) {
      curWordEl.classList.add("has-error");
      state.errorWordIndices.add(state.currentWordIdx);
    }

    curWordEl.classList.remove("active-word");
    state.currentWordIdx++;
    state.currentCharIdx = 0;

    // Check test completion for words mode
    if (state.mode === "words" && state.currentWordIdx >= state.words.length) {
      endTest();
      return;
    }

    // Activate next word
    if (state.currentWordIdx < wordEls.length) {
      wordEls[state.currentWordIdx].classList.add("active-word");
    }

    updateCaret();
    markCaretActive();
    checkViewportScroll();

    var elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
    updateLiveStats(elapsed);
  }

  function handleCharBackspace() {
    var wordEls = DOM.wordsInner.children;
    if (state.currentWordIdx >= wordEls.length) return;

    var curWordEl = wordEls[state.currentWordIdx];
    var targetWordStr = state.words[state.currentWordIdx];

    if (state.currentCharIdx > 0) {
      state.currentCharIdx--;
      var letterEls = curWordEl.children;

      if (state.currentCharIdx >= targetWordStr.length) {
        // Removing an extra char
        var extraSpan = letterEls[state.currentCharIdx];
        if (extraSpan && extraSpan.classList.contains("extra")) {
          curWordEl.removeChild(extraSpan);
          state.extraChars--;
          state.incorrectChars--;
        }
      } else {
        // Un-typing a regular letter
        var span = letterEls[state.currentCharIdx];
        if (span) {
          if (span.classList.contains("correct")) state.correctChars--;
          if (span.classList.contains("incorrect")) state.incorrectChars--;
          if (span.classList.contains("missed")) { state.missedChars--; state.incorrectChars--; }
          span.classList.remove("correct", "incorrect", "missed");
        }
      }

      updateCaret();
      markCaretActive();
      checkViewportScroll();
    } else if (state.currentCharIdx === 0 && state.currentWordIdx > 0) {
      // Backspace into previous word ONLY if previous word had errors
      var prevWordIdx = state.currentWordIdx - 1;
      if (state.errorWordIndices.has(prevWordIdx)) {
        curWordEl.classList.remove("active-word");
        var prevWordEl = wordEls[prevWordIdx];
        prevWordEl.classList.add("active-word");
        prevWordEl.classList.remove("has-error");

        state.currentWordIdx = prevWordIdx;
        state.currentCharIdx = prevWordEl.children.length;

        updateCaret();
        markCaretActive();
        checkViewportScroll();
      }
    }

    var elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
    updateLiveStats(elapsed);
  }

  function handleWordBackspace() {
    var wordEls = DOM.wordsInner.children;
    if (state.currentWordIdx >= wordEls.length) return;

    var curWordEl = wordEls[state.currentWordIdx];

    if (state.currentCharIdx > 0) {
      // Remove all extra characters
      var extras = curWordEl.querySelectorAll(".extra");
      extras.forEach(function(el) {
        curWordEl.removeChild(el);
        state.extraChars--;
        state.incorrectChars--;
      });

      // Clear all regular letters
      var letterEls = curWordEl.children;
      for (var i = 0; i < letterEls.length; i++) {
        var span = letterEls[i];
        if (span.classList.contains("correct")) state.correctChars--;
        if (span.classList.contains("incorrect")) state.incorrectChars--;
        if (span.classList.contains("missed")) { state.missedChars--; state.incorrectChars--; }
        span.classList.remove("correct", "incorrect", "missed");
      }
      state.currentCharIdx = 0;
      updateCaret();
      markCaretActive();
      checkViewportScroll();
    } else if (state.currentCharIdx === 0 && state.currentWordIdx > 0) {
      // Jump back to previous word if it had errors
      handleCharBackspace();
    }
  }

  function recordMistake() {
    state.errorWordIndices.add(state.currentWordIdx);
    var curSec = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    state.mistakesPerSecond[curSec] = (state.mistakesPerSecond[curSec] || 0) + 1;
  }

  function animateCount(el, target, duration) {
    if (!el) return;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function getSassyLine(wpm) {
    for (var i = 0; i < SASSY_LINES.length; i++) {
      if (wpm < SASSY_LINES[i].max) return SASSY_LINES[i].text;
    }
    return "";
  }

  function renderGraph(finalWpm, elapsedSecs) {
    if (!DOM.graph) return;
    var samples = state.samples.slice();

    // Ensure we have endpoints
    if (samples.length === 0 || samples[0].sec > 1) {
      samples.unshift({ sec: 0, wpm: 0, raw: 0, errors: 0 });
    }
    var lastSec = Math.max(1, Math.round(elapsedSecs));
    if (samples[samples.length - 1].sec < lastSec) {
      samples.push({ sec: lastSec, wpm: finalWpm, raw: finalWpm, errors: 0 });
    }

    var W = 720;
    var H = 165;
    var padL = 48;
    var padR = 24;
    var padT = 18;
    var padB = 26;

    var chartW = W - padL - padR;
    var chartH = H - padT - padB;

    // Find max WPM
    var maxVal = 10;
    for (var i = 0; i < samples.length; i++) {
      if (samples[i].wpm > maxVal) maxVal = samples[i].wpm;
      if (samples[i].raw > maxVal) maxVal = samples[i].raw;
    }
    maxVal = Math.ceil((maxVal * 1.15) / 10) * 10;
    if (maxVal < 40) maxVal = 40;

    var maxTime = Math.max(lastSec, 1);

    function getX(sec) {
      return padL + (sec / maxTime) * chartW;
    }
    function getY(val) {
      return padT + chartH - (val / maxVal) * chartH;
    }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="type-graph-svg">';

    // Defs for gradient
    svg += '<defs>';
    svg += '<linearGradient id="typeWpmGrad" x1="0" y1="0" x2="0" y2="1">';
    svg += '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/>';
    svg += '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>';
    svg += '</linearGradient>';
    svg += '</defs>';

    // Horizontal grid lines & Y labels (4 divisions)
    var yDivs = 4;
    for (var d = 0; d <= yDivs; d++) {
      var v = Math.round((maxVal / yDivs) * d);
      var gy = getY(v);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" class="graph-grid-line"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (gy + 3) + '" class="graph-axis-text graph-y-text">' + v + '</text>';
    }

    // Time X-axis labels
    var xInterval = maxTime <= 15 ? 3 : (maxTime <= 30 ? 5 : (maxTime <= 60 ? 10 : 20));
    for (var t = 0; t <= maxTime; t += xInterval) {
      var gx = getX(t);
      svg += '<text x="' + gx + '" y="' + (H - 6) + '" class="graph-axis-text graph-x-text">' + t + 's</text>';
    }

    // Area fill path
    var areaD = 'M ' + getX(samples[0].sec) + ' ' + (padT + chartH);
    for (var p = 0; p < samples.length; p++) {
      areaD += ' L ' + getX(samples[p].sec).toFixed(1) + ' ' + getY(samples[p].wpm).toFixed(1);
    }
    areaD += ' L ' + getX(samples[samples.length - 1].sec).toFixed(1) + ' ' + (padT + chartH) + ' Z';
    svg += '<path d="' + areaD + '" fill="url(#typeWpmGrad)"/>';

    // Average WPM horizontal line
    var sumWpm = 0;
    for (var s = 0; s < samples.length; s++) sumWpm += samples[s].wpm;
    var avgWpm = Math.round(sumWpm / samples.length);
    if (avgWpm > 0) {
      var avgY = getY(avgWpm);
      svg += '<line x1="' + padL + '" y1="' + avgY + '" x2="' + (W - padR) + '" y2="' + avgY + '" class="graph-avg-line"/>';
    }

    // WPM curve
    var lineD = 'M ' + getX(samples[0].sec).toFixed(1) + ' ' + getY(samples[0].wpm).toFixed(1);
    for (var l = 1; l < samples.length; l++) {
      lineD += ' L ' + getX(samples[l].sec).toFixed(1) + ' ' + getY(samples[l].wpm).toFixed(1);
    }
    svg += '<path d="' + lineD + '" class="graph-wpm-line"/>';

    // Error points (coral-red dots where errors occurred)
    for (var e = 0; e < samples.length; e++) {
      if (samples[e].errors > 0) {
        var ex = getX(samples[e].sec);
        var ey = getY(samples[e].wpm);
        svg += '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4" class="graph-err-dot"/>';
      }
    }

    svg += '</svg>';
    DOM.graph.innerHTML = svg;
  }

  function renderErrorReview() {
    if (!DOM.errorReview || !DOM.errorWords) return;
    if (state.errorWordIndices.size === 0) {
      DOM.errorReview.style.display = "none";
      DOM.errorWords.innerHTML = "";
      return;
    }

    var html = "";
    var indices = Array.from(state.errorWordIndices);
    indices.sort(function(a, b) { return a - b; });

    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (idx < state.words.length) {
        html += '<span class="error-word-pill">' + escapeHtml(state.words[idx]) + '</span>';
      }
    }

    DOM.errorWords.innerHTML = html;
    DOM.errorReview.style.display = "block";
  }

  function endTest() {
    state.timerFinished = true;
    state.timerRunning = false;
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    clearTimeout(idleTimer);
    if (DOM.caret) DOM.caret.classList.remove("blink");

    var elapsed = Math.max(0.8, (Date.now() - state.startTime) / 1000);
    var minutes = elapsed / 60;
    var finalWpm = Math.round((state.correctChars / 5) / minutes) || 0;
    var finalRaw = Math.round((state.totalKeystrokes / 5) / minutes) || 0;
    var totalTyped = state.correctChars + state.incorrectChars;
    var finalAcc = totalTyped > 0 ? Math.round((state.correctChars / totalTyped) * 100) : 100;

    // Display animated hero numbers
    animateCount(DOM.resultWpm, finalWpm, 550);
    DOM.resultAcc.textContent = finalAcc + "%";

    DOM.resultRaw.textContent = finalRaw;
    DOM.resultChars.textContent = state.correctChars + "/" + state.incorrectChars + "/" + state.extraChars;

    if (state.mode === "time") {
      DOM.resultMode.textContent = "time " + state.timerDuration + "s";
    } else {
      DOM.resultMode.textContent = "words " + state.wordCount;
    }
    DOM.resultTime.textContent = Math.round(elapsed) + "s";

    // Sassy evaluation
    DOM.resultSassy.textContent = '"' + getSassyLine(finalWpm) + '"';

    // Render interactive SVG chart
    renderGraph(finalWpm, elapsed);

    // Render words to practice
    renderErrorReview();

    DOM.wordsArea.classList.add("test-done");
    DOM.results.style.display = "block";
    DOM.hints.style.display = "none";
    // the live strip would sit above the results showing frozen numbers
    if (DOM.liveBar) DOM.liveBar.style.display = "none";
  }

  function resetTest() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    clearTimeout(idleTimer);

    state.timerRunning = false;
    state.timerFinished = false;
    state.startTime = null;

    DOM.liveWpm.textContent = "0";
    DOM.liveAcc.textContent = "100";

    DOM.results.style.display = "none";
    DOM.hints.style.display = "flex";
    if (DOM.liveBar) DOM.liveBar.style.display = "";
    if (DOM.graph) DOM.graph.innerHTML = "";
    DOM.wordsArea.classList.remove("test-done");

    renderWords();
    updateTimerDisplay(0);
    DOM.wordsArea.focus();
    markCaretActive();
  }

  function restart() {
    resetTest();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

