import { renderLobby } from './screens/lobby.js';
import { renderDraft } from './screens/draft.js';
import { renderVoting } from './screens/voting.js';
import { renderResults } from './screens/results.js';
import { socket, onRoomState, onDraftState } from './socket.js';

// Socket connection via socket.js

// DOM helpers
const $ = (id) => document.getElementById(id);

// Elements
const elements = {
  auth: $('auth'),
  lobby: $('lobby'),
  nameInput: $('name'),
  codeInput: $('roomCode'),
  createBtn: $('create'),
  joinBtn: $('join'),
  codeEl: $('code'),
  playersEl: $('players'),
  leaveBtn: $('leave'),
  startDraftBtn: $('startDraft'),
  modeActiveEl: $('modeActive'),
  roundsActiveEl: $('roundsActive'),
  hostModeControls: $('hostModeControls'),
  gameModeSelect: $('gameModeSelect'),
  rrWarning: $('rrWarning'),
  // Draft
  draft: $('draft'),
  playerGridEl: $('playerGrid'),
  myPicksEl: $('myPicks'),
  progressEl: $('progress'),
  draftHostControls: $('draftHostControls'),
  endDraftBtn: $('endDraft'),
  backToLobbyBtn: $('backToLobby'),
  waitingMsg: $('waitingMsg'),
  // Voting
  voting: $('voting'),
  votingHostControls: $('votingHostControls'),
  nextMatchupBtn: $('nextMatchup'),
  backToLobbyVotingBtn: $('backToLobbyVoting'),
  matchupEl: $('matchup'),
  votingInfoEl: $('votingInfo'),
  waitingMsgVoting: $('waitingMsgVoting'),
  voteABtn: $('voteA'),
  voteBBtn: $('voteB'),
  becauseInput: $('because'),
  voteStatusEl: $('voteStatus'),
  voteTallyEl: $('voteTally'),
  // Results
  results: $('results'),
  resultsSummaryEl: $('resultsSummary')
};

// Local state
let selfId = null;
const state = {
  phase: 'lobby',
  room: null
};
let myTeammates = [];
let mySic = null;

// Helpers
function showScreen(screen) {
  elements.auth.classList.add('hidden');
  elements.lobby.classList.add('hidden');
  elements.draft.classList.add('hidden');
  elements.voting.classList.add('hidden');
  if (elements.results) elements.results.classList.add('hidden');
  if (screen === 'draft') elements.draft.classList.remove('hidden');
  else if (screen === 'voting') elements.voting.classList.remove('hidden');
  else if (screen === 'results' && elements.results) elements.results.classList.remove('hidden');
}

function computePhase(room) {
  const p = room?.draft?.phase;
  if (p === 'draft') return 'draft';
  if (p === 'voting') return 'voting';
  if (p === 'results') return 'results';
  return 'lobby';
}

function playerNameById(id) {
  if (!state?.room?.players) return id;
  const p = state.room.players.find((pl) => pl.id === id);
  return p ? p.name : id;
}

function render() {
  switch (state.phase) {
    case 'draft':
      return renderDraft({ state, elements, socket, selfId, myTeammates, mySic, setMyTeammates, setMySic, showScreen, playerNameById });
    case 'voting':
      return renderVoting({ state, elements, socket, selfId, showScreen, playerNameById });
    case 'results':
      return renderResults({ state, elements, showScreen, playerNameById });
    case 'lobby':
    default:
      return renderLobby({ state, elements, socket, selfId, showScreen });
  }
}

function setMyTeammates(next) {
  myTeammates = Array.from(next || []).slice(0, 2);
}

function setMySic(next) {
  mySic = next || null;
}

// UI Events
elements.createBtn.addEventListener('click', () => {
  const name = elements.nameInput.value.trim();
  if (!name) { alert('Enter your name'); return; }
  socket.emit('room:create', (res) => {
    if (!res?.ok) { alert('Failed to create room'); return; }
    const code = res.code;
    socket.emit('room:join', { code, name }, (joinRes) => {
      if (!joinRes?.ok) { alert(joinRes?.error || 'Join failed'); return; }
      selfId = joinRes.selfId;
      state.room = joinRes.room;
      state.phase = computePhase(joinRes.room);
      render();
    });
  });
});

elements.joinBtn.addEventListener('click', () => {
  const name = elements.nameInput.value.trim();
  const code = elements.codeInput.value.trim();
  if (!name) { alert('Enter your name'); return; }
  if (!code || code.length !== 6) { alert('Enter a 6-digit code'); return; }
  socket.emit('room:join', { code, name }, (joinRes) => {
    if (!joinRes?.ok) { alert(joinRes?.error || 'Join failed'); return; }
    selfId = joinRes.selfId;
    state.room = joinRes.room;
    state.phase = computePhase(joinRes.room);
    render();
  });
});

elements.leaveBtn.addEventListener('click', () => {
  socket.emit('room:leave', () => {
    state.phase = 'lobby';
    state.room = null;
    render();
  });
});

elements.startDraftBtn.addEventListener('click', () => {
  socket.emit('draft:start', (res) => {
    if (!res?.ok) { alert(res?.error || 'Failed to start draft'); }
  });
});

elements.endDraftBtn.addEventListener('click', () => {
  socket.emit('draft:end', (res) => {
    if (!res?.ok) alert(res?.error || 'Failed to end draft');
  });
});

elements.backToLobbyBtn.addEventListener('click', () => {
  socket.emit('admin:backToLobby', (res) => {
    if (!res?.ok) alert(res?.error || 'Failed to go back to lobby');
  });
});

elements.nextMatchupBtn.addEventListener('click', () => {
  socket.emit('voting:next', (res) => {
    if (!res?.ok) alert(res?.error || 'Failed to advance');
  });
});

elements.backToLobbyVotingBtn.addEventListener('click', () => {
  socket.emit('admin:backToLobby', (res) => {
    if (!res?.ok) alert(res?.error || 'Failed to go back to lobby');
  });
});

if (elements.gameModeSelect) {
  elements.gameModeSelect.addEventListener('change', () => {
    const mode = elements.gameModeSelect.value;
    socket.emit('room:setGameMode', { mode }, (res) => {
      if (!res?.ok) { alert(res?.error || 'Failed to set game mode'); }
    });
  });
}

function sendVote(pickId) {
  const because = elements.becauseInput.value.trim();
  socket.emit('voting:vote', { pick: pickId, because }, (res) => {
    if (!res?.ok) return;
    elements.voteStatusEl.textContent = `You voted for ${playerNameById(pickId)}`;
    elements.voteABtn.disabled = true;
    elements.voteBBtn.disabled = true;
    elements.becauseInput.disabled = true;
  });
}

elements.voteABtn.addEventListener('click', () => {
  const current = state?.room?.draft?.voting?.current;
  if (!current) return;
  sendVote(current[0]);
});

elements.voteBBtn.addEventListener('click', () => {
  const current = state?.room?.draft?.voting?.current;
  if (!current) return;
  sendVote(current[1]);
});

// Socket events
onRoomState((room) => {
  state.room = room;
  state.phase = computePhase(room);
  render();
});

onDraftState((dState) => {
  if (!state.room) return;
  state.room.draft = { ...state.room.draft, ...dState };
  state.phase = computePhase(state.room);
  render();
});

// Initial render
render();


