export function renderVoting({ state, elements, socket, selfId, showScreen, playerNameById }) {
  const room = state.room;
  const draft = state.room?.draft;

  if (room.hostId === selfId) {
    elements.votingHostControls.classList.remove('hidden');
  } else {
    elements.votingHostControls.classList.add('hidden');
  }

  const hostName = room.hostName || (room.players.find(p => p.id === room.hostId)?.name) || 'Host';
  const mode = state.room?.game?.mode || 'standard';
  const rounds = state.room?.game?.rounds ?? 0;
  const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
  elements.waitingMsgVoting.textContent = `Mode: ${modeLabel} — Rounds: ${rounds}. Waiting for ${hostName} to continue…`;

  const v = draft?.voting || { index: 0, total: 0, current: null };
  elements.votingInfoEl.textContent = v.total > 0 ? `Match ${v.index + 1} of ${v.total}` : 'No matchups';
  if (v.current) {
    const [a, b] = v.current;
    const aName = playerNameById(a);
    const bName = playerNameById(b);
    const promptText = v.prompt || `${aName} vs ${bName}`;
    elements.matchupEl.textContent = promptText;

    elements.voteABtn.textContent = `Vote ${aName}`;
    elements.voteBBtn.textContent = `Vote ${bName}`;
    elements.voteABtn.disabled = false;
    elements.voteBBtn.disabled = false;
    elements.becauseInput.disabled = false;

    if (v.tally) {
      const aCount = v.tally[a] || 0;
      const bCount = v.tally[b] || 0;
      elements.voteTallyEl.textContent = `Tally: ${aName} ${aCount} — ${bName} ${bCount} (${v.votesReceived || 0}/${v.votesTotal || 0} votes)`;
    } else {
      elements.voteTallyEl.textContent = '';
    }
  } else {
    elements.matchupEl.textContent = 'No matchup available';
    elements.voteABtn.textContent = 'Vote A';
    elements.voteBBtn.textContent = 'Vote B';
    elements.voteABtn.disabled = true;
    elements.voteBBtn.disabled = true;
    elements.becauseInput.disabled = true;
    elements.voteTallyEl.textContent = '';
  }

  showScreen('voting');
}


