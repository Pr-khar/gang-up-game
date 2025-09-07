export function renderGangReveal({ state, elements, socket, selfId, showScreen, playerNameById }) {
  const room = state.room;
  const draft = state.room?.draft;
  console.log('[REVEAL] renderGangReveal args', { selfId, players: room?.players, draft });

  // Host controls
  if (room.hostId === selfId) {
    if (elements.revealHostControls) elements.revealHostControls.classList.remove('hidden');
  } else {
    if (elements.revealHostControls) elements.revealHostControls.classList.add('hidden');
  }

  const hostName = room.hostName || (room.players.find(p => p.id === room.hostId)?.name) || 'Host';
  const mode = state.room?.game?.mode || 'standard';
  const rounds = state.room?.game?.rounds ?? 0;
  const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
  if (elements.waitingMsgReveal) {
    elements.waitingMsgReveal.textContent = `Mode: ${modeLabel} — Rounds: ${rounds}. Waiting for ${hostName} to continue…`;
  }

  // Your gang (you as leader)
  // Server emits picks via getDraftPublicState as: draft.picks[leaderId] = { teammates: [], secondInCommand }
  const myPick = draft && draft.picks && draft.picks[selfId] ? draft.picks[selfId] : { teammates: [], secondInCommand: null };
  const leaderName = playerNameById(selfId);
  const sicName = myPick.secondInCommand ? playerNameById(myPick.secondInCommand) : '-';
  const mates = (myPick.teammates || []).map(playerNameById);
  if (elements.myGangSummary) {
    elements.myGangSummary.textContent = `Leader: ${leaderName} (you) — 2IC: ${sicName} — Members: ${mates.join(', ') || '-'}`;
  }

  // Where you were picked by others (member or 2IC)
  if (elements.rolesList) {
    elements.rolesList.innerHTML = '';
    const picks = (draft && draft.picks) ? draft.picks : {};
    const entries = [];
    for (const [leaderId, p] of Object.entries(picks)) {
      if (!p) continue;
      const pickedAsSic = p.secondInCommand === selfId;
      const pickedAsMember = Array.isArray(p.teammates) && p.teammates.includes(selfId);
      if (pickedAsSic || pickedAsMember) {
        const leader = playerNameById(leaderId);
        const role = pickedAsSic ? '2IC' : 'Member';
        const emphasis = pickedAsSic ? `You are 2IC for ${leader}'s gang!` : '';
        entries.push({ leader, role, emphasis, pickedAsSic });
      }
    }
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'You were not picked by any other leader.';
      elements.rolesList.appendChild(li);
    } else {
      entries.sort((a, b) => a.leader.localeCompare(b.leader));
      entries.forEach(({ leader, role, emphasis, pickedAsSic }) => {
        const li = document.createElement('li');
        const base = `${leader} picked you as ${role}.`;
        li.textContent = emphasis ? `${base} ${emphasis}` : base;
        if (pickedAsSic) li.style.fontWeight = '700';
        elements.rolesList.appendChild(li);
      });
    }
  }

  // Attach continue button for host
  if (elements.startVoting) {
    if (!elements.startVoting.__bound) {
      elements.startVoting.addEventListener('click', () => {
        socket.emit('reveal:continue', (res) => {
          if (!res?.ok) alert(res?.error || 'Failed to start voting');
        });
      });
      elements.startVoting.__bound = true;
    }
  }

  showScreen('reveal');
}


