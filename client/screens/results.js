export function renderResults({ state, elements, showScreen, playerNameById }) {
  showScreen('results');
  const room = state.room;
  const meta = room?.draft?.meta;
  if (meta && meta.candidateCounts) {
    const lines = [];
    const mode = meta.mode || 'standard';
    const rounds = meta.totalRounds || 0;
    const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
    lines.push(`Mode: ${modeLabel} — Rounds: ${rounds}`);
    if (meta.usedRepeats && (mode === 'standard' || mode === 'extended')) {
      lines.push('Note: Not enough unique pairs — some pairs repeated.');
    }
    const parts = Object.entries(meta.candidateCounts).map(([pid, count]) => `${playerNameById(pid)}: ${count}×`);
    lines.push('Candidate appearances: ' + parts.join(', '));
    elements.resultsSummaryEl.textContent = lines.join('\n');
  } else {
    elements.resultsSummaryEl.textContent = 'Results will appear here.';
  }
}


