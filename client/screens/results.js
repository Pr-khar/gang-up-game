export function renderResults({ state, elements, socket, selfId, showScreen, playerNameById }) {
  showScreen('results');
  const room = state.room;
  const results = room?.results || null;
  const picks = room?.draft?.picks || {};
  const meta = room?.draft?.meta;

  // Build personal leaderboard
  const personalEntries = Object.entries(results?.personalTotals || {}).map(([pid, score]) => ({
    id: pid,
    name: playerNameById(pid),
    score: Number(score) || 0
  }));
  personalEntries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const topPersonalScore = personalEntries.length ? personalEntries[0].score : null;

  // Build team leaderboard and annotate 2IC
  const teamEntries = Object.entries(results?.teamTotals || {}).map(([leaderId, teamScore]) => {
    const pick = picks[leaderId] || { teammates: [], secondInCommand: null };
    const sic = pick.secondInCommand || null;
    return {
      leaderId,
      leaderName: playerNameById(leaderId),
      teamScore: Number(teamScore) || 0,
      teammates: Array.isArray(pick.teammates) ? pick.teammates : [],
      secondInCommand: sic
    };
  });
  teamEntries.sort((a, b) => b.teamScore - a.teamScore || a.leaderName.localeCompare(b.leaderName));
  const topTeamScore = teamEntries.length ? teamEntries[0].teamScore : null;
  // Helpers
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const container = elements.resultsSummaryEl;
  if (!container) return;
  container.innerHTML = '';

  const frag = document.createDocumentFragment();

  // Header/meta
  if (meta) {
    const mode = meta.mode || 'standard';
    const rounds = meta.totalRounds || 0;
    const modeLabel = mode === 'extended' ? 'Extended' : (mode === 'round_robin' ? 'Full Round Robin' : 'Standard');
    const metaLine = document.createElement('div');
    metaLine.className = 'muted';
    metaLine.textContent = `Mode: ${modeLabel} — Rounds: ${rounds}`;
    frag.appendChild(metaLine);

    const counts = meta.candidateCounts || {};
    const values = Object.values(counts);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const uneven = max - min > 0;
    if (meta.usedRepeats || uneven) {
      const note = document.createElement('div');
      note.className = 'muted';
      const notes = [];
      if (meta.usedRepeats) notes.push('some pairs repeated');
      if (uneven) notes.push('uneven candidate appearances');
      note.textContent = `Note: ${notes.join(' and ')} — distribution transparency.`;
      frag.appendChild(note);
    }
  }

  // Team leaderboard
  if (teamEntries.length) {
    const section = document.createElement('div');
    section.className = 'section';
    const h2 = document.createElement('h2');
    h2.textContent = '🏆 Team Leaderboard';
    section.appendChild(h2);

    const table = document.createElement('table');
    table.className = 'leaderboard team-leaderboard';
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    ['Rank', 'Leader', 'Team Members', '2IC ×1.5', 'Total'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    teamEntries.forEach((t, idx) => {
      const tr = document.createElement('tr');
      const isWinner = t.teamScore === topTeamScore;
      if (isWinner) tr.classList.add('winner');

      const rankTd = document.createElement('td');
      rankTd.className = 'rank';
      rankTd.textContent = isWinner ? `${ordinal(idx + 1)} 👑` : ordinal(idx + 1);
      tr.appendChild(rankTd);

      const leaderTd = document.createElement('td');
      leaderTd.className = 'leader';
      leaderTd.textContent = t.leaderName;
      if (isWinner) leaderTd.style.fontWeight = '700';
      tr.appendChild(leaderTd);

      const membersTd = document.createElement('td');
      const mateNames = (t.teammates || []).map(playerNameById).join(', ') || '-';
      membersTd.textContent = mateNames;
      tr.appendChild(membersTd);

      const sicTd = document.createElement('td');
      const sicName = t.secondInCommand ? playerNameById(t.secondInCommand) : '-';
      const sicScore = t.secondInCommand != null ? results.personalTotals[t.secondInCommand] || 0 : 0;
      sicTd.textContent = t.secondInCommand ? `${sicName} (×1.5 = ${(1.5 * sicScore).toFixed(1)})` : '-';
      tr.appendChild(sicTd);

      const totalTd = document.createElement('td');
      totalTd.className = 'total';
      totalTd.textContent = t.teamScore.toFixed(1);
      tr.appendChild(totalTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    frag.appendChild(section);
  }

  // Personal leaderboard
  if (personalEntries.length) {
    const section = document.createElement('div');
    section.className = 'section';
    const h2 = document.createElement('h2');
    h2.textContent = '⭐ Personal Leaderboard';
    section.appendChild(h2);

    const table = document.createElement('table');
    table.className = 'leaderboard personal-leaderboard';
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    ['Rank', 'Player', 'Points'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    personalEntries.forEach((p, idx) => {
      const tr = document.createElement('tr');
      const isWinner = p.score === topPersonalScore;
      if (isWinner) tr.classList.add('winner');

      const rankTd = document.createElement('td');
      rankTd.className = 'rank';
      rankTd.textContent = isWinner ? `${ordinal(idx + 1)} 👑` : ordinal(idx + 1);
      tr.appendChild(rankTd);

      const nameTd = document.createElement('td');
      nameTd.textContent = p.name;
      if (isWinner) nameTd.style.fontWeight = '700';
      tr.appendChild(nameTd);

      const pointsTd = document.createElement('td');
      pointsTd.className = 'total';
      pointsTd.textContent = p.score.toFixed(1);
      tr.appendChild(pointsTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    frag.appendChild(section);
  }

  if (!teamEntries.length && !personalEntries.length) {
    container.textContent = 'Results will appear here.';
  } else {
    container.appendChild(frag);
  }

  // Simple confetti/celebration effect: animate crown on top team and allow host to restart
  // Add a small visual emphasis by temporarily changing background on results card
  try {
    const card = document.querySelector('.card');
    if (card) {
      card.animate([
        { boxShadow: '0 0 0px rgba(250, 204, 21, 0)' },
        { boxShadow: '0 0 24px rgba(250, 204, 21, 0.8)' },
        { boxShadow: '0 0 0px rgba(250, 204, 21, 0)' }
      ], { duration: 1200, iterations: 1 });
    }
  } catch {}

  // Host control: Play Again / Back to Lobby button
  const isHost = room?.hostId && selfId && room.hostId === selfId;
  if (isHost) {
    // Reuse existing host control area pattern: show a "Back to Lobby" in results
    const btn = document.createElement('button');
    btn.textContent = 'Back to Lobby';
    btn.className = 'secondary';
    btn.addEventListener('click', () => {
      socket.emit('admin:backToLobby', (res) => {
        if (!res?.ok) alert(res?.error || 'Failed to go back to lobby');
      });
    });
    // Insert after the results summary element
    if (elements.resultsSummaryEl && elements.resultsSummaryEl.parentElement) {
      // Avoid duplicating button on re-render
      const existing = elements.resultsSummaryEl.parentElement.querySelector('#playAgainBtn');
      if (!existing) {
        btn.id = 'playAgainBtn';
        elements.resultsSummaryEl.parentElement.appendChild(btn);
      }
    }
  }
}


