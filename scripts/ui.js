(function () {
  const $ = sel => document.querySelector(sel);

  const UI = {
    screens: {
      title: $("#title-screen"),
      pause: $("#pause-screen"),
      gameover: $("#gameover-screen")
    },
    elements: {
      btnStart: $("#btn-start"),
      btnChallenge: $("#btn-challenge"),
      btnResume: $("#btn-resume"),
      btnQuit: $("#btn-quit"),
      btnRetry: $("#btn-retry"),
      btnMenu: $("#btn-menu"),
      finalScore: $("#final-score"),
      initialsWrap: $("#initials-entry"),
      initials: $("#initials"),
      btnSaveScore: $("#btn-save-score"),
      hiscores: $("#hiscore-list")
    },

    show(name) {
      for (const [k, el] of Object.entries(this.screens)) {
        el.classList.toggle("visible", k === name);
      }
    },

    hideAll() {
      for (const el of Object.values(this.screens)) el.classList.remove("visible");
    },

    setGameOver(score, allowInitials) {
      this.elements.finalScore.textContent = `Score: ${score}`;
      this.elements.initialsWrap.classList.toggle("hidden", !allowInitials);
      this.refreshScores();
    },

    refreshScores() {
      const list = this.elements.hiscores;
      list.innerHTML = "";
      const scores = UIStorage.getScores();
      scores.slice(0, 10).forEach(s => {
        const li = document.createElement("li");
        li.textContent = `${s.initials} — ${s.score}`;
        list.appendChild(li);
      });
    }
  };

  const UIStorage = {
    KEY: "usagi_hiscores_v1",
    getScores() {
      try { return JSON.parse(localStorage.getItem(this.KEY)) ?? []; }
      catch { return []; }
    },
    saveScore(initials, score) {
      const scores = this.getScores();
      scores.push({ initials: initials.toUpperCase().slice(0,3), score, ts: Date.now() });
      scores.sort((a,b)=> b.score - a.score || a.ts - b.ts);
      localStorage.setItem(this.KEY, JSON.stringify(scores.slice(0, 20)));
    }
  };

  window.UI = UI;
  window.UIStorage = UIStorage;
})();
