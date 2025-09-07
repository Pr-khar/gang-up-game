export function renderLobby({ state, elements, selfId, showScreen }) {
  showScreen('lobby');
  const room = state.room;
  const inRoom = !!room;
  if (!inRoom) {
    elements.auth.classList.remove('hidden');
    elements.lobby.classList.add('hidden');
    return;
  }
  elements.auth.classList.add('hidden');
  elements.lobby.classList.remove('hidden');
  elements.codeEl.textContent = room.code;
  const mode = room?.game?.mode || 'standard';
  const rounds = room?.game?.rounds ?? 0;
  const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
  elements.modeActiveEl.textContent = modeLabel;
  elements.roundsActiveEl.textContent = String(rounds);
  if (elements.rrWarning) {
    if (room.hostId === selfId && mode === 'round_robin' && rounds > 28) elements.rrWarning.classList.remove('hidden');
    else elements.rrWarning.classList.add('hidden');
  }
  elements.playersEl.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === selfId ? ' (you)' : '');
    elements.playersEl.appendChild(li);
  });
  if (room.hostId === selfId && room.draft?.phase === 'idle') {
    elements.hostModeControls.classList.remove('hidden');
    if (elements.gameModeSelect) { elements.gameModeSelect.value = mode; }
  } else {
    elements.hostModeControls.classList.add('hidden');
  }
  if (room.hostId === selfId && room.draft?.phase !== 'draft') {
    elements.startDraftBtn.classList.remove('hidden');
  } else {
    elements.startDraftBtn.classList.add('hidden');
  }
}


