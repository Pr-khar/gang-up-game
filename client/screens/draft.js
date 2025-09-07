export function renderDraft({ state, elements, socket, selfId, myTeammates, mySic, setMyTeammates, setMySic, showScreen, playerNameById }) {
  const room = state.room;
  const draft = state.room?.draft;

  // Sync local picks from server on reconnect/refresh
  if (draft?.picks?.[selfId]) {
    setMyTeammates(Array.from(draft.picks[selfId].teammates || []).slice(0, 2));
    setMySic(draft.picks[selfId].secondInCommand || null);
    myTeammates = Array.from(draft.picks[selfId].teammates || []).slice(0, 2);
    mySic = draft.picks[selfId].secondInCommand || null;
  }

  // Host controls
  if (room.hostId === selfId) {
    elements.draftHostControls.classList.remove('hidden');
  } else {
    elements.draftHostControls.classList.add('hidden');
  }

  const hostName = room.hostName || (room.players.find(p => p.id === room.hostId)?.name) || 'Host';
  const mode = state.room?.game?.mode || 'standard';
  const rounds = state.room?.game?.rounds ?? 0;
  const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
  elements.waitingMsg.textContent = `Mode: ${modeLabel} — Rounds: ${rounds}. Waiting for ${hostName} to continue…`;

  function updateMyPicksUI() {
    const teamNames = myTeammates.map(playerNameById);
    const sicName = mySic ? playerNameById(mySic) : '-';
    elements.myPicksEl.textContent = `My Team: ${teamNames.join(', ') || '-'} | My 2IC: ${sicName}`;
  }

  function submitPicks() {
    socket.emit('draft:pick', { teammates: myTeammates, secondInCommand: mySic });
    updateMyPicksUI();
  }

  function attachCardInteractions(cardEl, playerId) {
    if (playerId === selfId) return;
    let pressTimer = null;
    let longPressTriggered = false;
    const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    const toggleTeammate = () => {
      longPressTriggered = false;
      const idx = myTeammates.indexOf(playerId);
      if (idx >= 0) {
        myTeammates.splice(idx, 1);
      } else {
        if (myTeammates.length >= 2) return;
        if (mySic === playerId) { mySic = null; }
        myTeammates.push(playerId);
      }
      submitPicks();
    };
    const toggleSIC = () => {
      longPressTriggered = true;
      if (mySic === playerId) {
        mySic = null;
      } else {
        const idx = myTeammates.indexOf(playerId);
        if (idx >= 0) myTeammates.splice(idx, 1);
        mySic = playerId;
      }
      submitPicks();
    };
    cardEl.addEventListener('click', () => {
      if (longPressTriggered) { longPressTriggered = false; return; }
      toggleTeammate();
    });
    cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleSIC(); });
    cardEl.addEventListener('touchstart', () => {
      clearPress();
      pressTimer = setTimeout(() => { toggleSIC(); }, 500);
    }, { passive: true });
    cardEl.addEventListener('touchend', clearPress);
    cardEl.addEventListener('touchmove', clearPress);
    cardEl.addEventListener('mouseleave', clearPress);
    cardEl.addEventListener('mouseup', clearPress);
  }

  function renderProgress(room, draft) {
    elements.progressEl.innerHTML = '';
    room.players.forEach((p) => {
      const li = document.createElement('li');
      const picks = draft?.picks?.[p.id] || { teammates: [], secondInCommand: null };
      const teamNames = (picks.teammates || []).map(playerNameById);
      const sicName = picks.secondInCommand ? playerNameById(picks.secondInCommand) : '-';
      const count = (picks.teammates?.length || 0) + (picks.secondInCommand ? 1 : 0);
      const ready = count === 3 ? '✓ Ready' : '• Picking…';
      li.textContent = `${p.name}${p.id === selfId ? ' (you)' : ''} — Team: ${teamNames.join(', ') || '-'} | 2IC: ${sicName} | ${count}/3 ${ready}`;
      elements.progressEl.appendChild(li);
    });
  }

  // Player grid
  elements.playerGridEl.innerHTML = '';
  room.players.forEach((p) => {
    const btn = document.createElement('div');
    btn.className = 'player-card';
    if (p.id === selfId) btn.classList.add('me');
    if (myTeammates.includes(p.id)) btn.classList.add('teammate');
    if (mySic === p.id) btn.classList.add('sic');
    btn.textContent = p.name + (p.id === selfId ? ' (you)' : '');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', `Select ${p.name}`);
    btn.dataset.playerId = p.id;
    elements.playerGridEl.appendChild(btn);
    attachCardInteractions(btn, p.id);
  });

  updateMyPicksUI();
  renderProgress(room, draft);
  showScreen('draft');
}


