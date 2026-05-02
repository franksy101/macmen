// Highscore-Tabelle via localStorage
const Highscore = (() => {
  const KEY = 'macmen_highscores_v1';
  const MAX = 10;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function add(name, score, character) {
    const list = load();
    list.push({
      name: (name || 'Anon').slice(0, 12).toUpperCase(),
      score: score | 0,
      character: character || '',
      date: new Date().toISOString().slice(0, 10),
    });
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, MAX);
    save(trimmed);
    return trimmed;
  }

  function top() {
    return load().sort((a, b) => b.score - a.score).slice(0, MAX);
  }

  function isHighscore(score) {
    const list = top();
    if (list.length < MAX) return true;
    return score > list[list.length - 1].score;
  }

  function bestScore() {
    const list = top();
    return list.length ? list[0].score : 0;
  }

  return { add, top, isHighscore, bestScore };
})();
