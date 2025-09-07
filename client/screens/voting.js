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
    // Reset selection visuals and enable by default
    elements.voteABtn.disabled = false;
    elements.voteBBtn.disabled = false;
    elements.becauseInput.disabled = false;
    if (elements.voteABtn && elements.voteBBtn) {
      elements.voteABtn.classList.remove('vote-selected');
      elements.voteBBtn.classList.remove('vote-selected');
    }

    // If the current user is featured in this matchup, disable voting/commenting and show message
    const isFeatured = selfId === a || selfId === b;
    if (isFeatured) {
      elements.voteABtn.disabled = true;
      elements.voteBBtn.disabled = true;
      elements.becauseInput.disabled = true;
      if (elements.voteStatusEl) {
        elements.voteStatusEl.textContent = "You&apos;re featured in this matchup. You can&apos;t vote.";
      }
    } else if (elements.voteStatusEl) {
      // Clear any prior status when not featured (e.g., moving to a new round)
      elements.voteStatusEl.textContent = '';
    }

    if (v.tally) {
      const aCount = v.tally[a] || 0;
      const bCount = v.tally[b] || 0;
      elements.voteTallyEl.textContent = `Tally: ${aName} ${aCount} — ${bName} ${bCount} (${v.votesReceived || 0}/${v.votesTotal || 0} votes)`;
    } else {
      elements.voteTallyEl.textContent = '';
    }

    // Restore selection UI if user already voted this round
    const roomCode = room?.code || 'room';
    const storageKey = `vote_${roomCode}_${v.index || 0}`;
    let priorPick = null;
    try { priorPick = localStorage.getItem(storageKey); } catch {}
    if (priorPick && (priorPick === String(a) || priorPick === String(b))) {
      if (String(priorPick) === String(a)) elements.voteABtn.classList.add('vote-selected');
      if (String(priorPick) === String(b)) elements.voteBBtn.classList.add('vote-selected');
      elements.voteABtn.disabled = true;
      elements.voteBBtn.disabled = true;
      elements.becauseInput.disabled = true;
      if (elements.voteStatusEl) {
        const pickedName = String(priorPick) === String(a) ? aName : bName;
        elements.voteStatusEl.textContent = `You voted for ${pickedName}.`;
      }
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


