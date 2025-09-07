import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';
import { QUESTIONS } from './questions.js';
import { computeScoresFromRoom } from './scoring.js';
import { computePlannedRounds, generateMatchupSchedule, uniquePairKey } from './helpers/schedule.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	// Tighten in production as needed
	cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve static client
app.use(express.static('client'));

// 6-digit numeric room codes
const generateRoomCode = customAlphabet('0123456789', 6);

// In-memory store (replace with DB/redis later)
const rooms = new Map(); // code -> { code, createdAt, players: Map<socketId, {id,name}>, hostId, draft }

function createRoom() {
	let code;
	for (let i = 0; i < 5; i += 1) {
		code = generateRoomCode();
		if (!rooms.has(code)) break;
	}
	if (!code || rooms.has(code)) {
		throw new Error('Failed to allocate unique room code');
	}
	rooms.set(code, {
		code,
		createdAt: Date.now(),
		players: new Map(),
		hostId: null,
		game: { mode: 'standard' },
		schedule: null,
		draft: {
			phase: 'idle',
			picksByPlayer: new Map(),
			voting: null
		}
	});
	return rooms.get(code);
}

function getDraftPublicState(room) {
	const picks = {};
	if (room.draft && room.draft.picksByPlayer) {
		for (const [playerId, pick] of room.draft.picksByPlayer.entries()) {
			picks[playerId] = {
				teammates: Array.isArray(pick.teammates) ? pick.teammates.slice(0, 2) : [],
				secondInCommand: pick.secondInCommand || null
			};
		}
	}

	let voting = null;
	if (room.draft?.voting) {
		const vState = room.draft.voting;
		const round = typeof vState.currentRound === 'number' ? vState.currentRound : 0;
		const entry = Array.isArray(room.schedule) ? room.schedule[round] : null;
		const current = entry ? [entry.playerA, entry.playerB] : null;
		let votesTotal = room.players.size;
		let votesReceived = 0;
		let tally = null;
		let prompt = null;
		if (current) {
			tally = { [current[0]]: 0, [current[1]]: 0 };
			const voteMap = vState.votes?.[round] || {};
			for (const voterId of Object.keys(voteMap)) {
				const pick = voteMap[voterId];
				votesReceived += 1;
				if (pick === current[0] || pick === current[1]) tally[pick] += 1;
			}
			const template = entry?.promptTemplate || '{A} vs {B}';
			const nameA = room.players.get(current[0])?.name || String(current[0]);
			const nameB = room.players.get(current[1])?.name || String(current[1]);
			prompt = template.replace(/\{A\}/g, nameA).replace(/\{B\}/g, nameB);
		}
		voting = {
			index: round,
			total: Array.isArray(room.schedule) ? room.schedule.length : 0,
			current,
			prompt,
			votesReceived,
			votesTotal,
			tally,
			voters: Object.keys(vState.votes?.[round] || {})
		};
	}

	let meta = null;
	if (room.draft?.voting) {
		const matchups = Array.isArray(room.schedule) ? room.schedule : [];
		const counts = {};
		for (const pid of room.players.keys()) counts[pid] = 0;
		const uniquePairs = new Set();
		for (const m of matchups) {
			if (!m) continue;
			const { playerA, playerB } = m;
			if (playerA != null) counts[playerA] = (counts[playerA] || 0) + 1;
			if (playerB != null) counts[playerB] = (counts[playerB] || 0) + 1;
			uniquePairs.add(uniquePairKey(playerA, playerB));
		}
		meta = {
			candidateCounts: counts,
			usedRepeats: uniquePairs.size < matchups.length,
			totalRounds: matchups.length,
			mode: room.game?.mode || 'standard'
		};
	}

	return {
		phase: room.draft?.phase || 'idle',
		picks,
		voting,
		meta
	};
}

function getPublicRoomState(room) {
	return {
		code: room.code,
		hostId: room.hostId,
		hostName: room.hostId ? room.players.get(room.hostId)?.name || null : null,
		players: Array.from(room.players.values()),
		game: {
			mode: room.game?.mode || 'standard',
			rounds: computePlannedRounds(room.game?.mode || 'standard', room.players.size)
		},
		draft: getDraftPublicState(room),
		results: room.results || null
	};
}

io.on('connection', (socket) => {
	let joinedRoomCode = null;

	// Create a new room
	socket.on('room:create', (callback) => {
		try {
			const room = createRoom();
			callback?.({ ok: true, code: room.code });
		} catch (err) {
			callback?.({ ok: false, error: 'ROOM_CREATE_FAILED' });
		}
	});

	// Join an existing room
	socket.on('room:join', ({ code, name }, callback) => {
		const normalized = String(code || '').trim();
		const room = rooms.get(normalized);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (!name || String(name).trim().length === 0) return callback?.({ ok: false, error: 'NAME_REQUIRED' });

		// Join socket.io room
		socket.join(normalized);
		joinedRoomCode = normalized;

		const player = { id: socket.id, name: String(name).trim() };
		room.players.set(socket.id, player);

		// Assign host if none
		if (!room.hostId) {
			room.hostId = socket.id;
		}

		io.to(normalized).emit('room:state', getPublicRoomState(room));
		callback?.({ ok: true, room: getPublicRoomState(room), selfId: socket.id });
	});

	// Leave room voluntarily
	socket.on('room:leave', (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: true });
		const room = rooms.get(joinedRoomCode);
		if (room) {
			room.players.delete(socket.id);
			if (room.draft && room.draft.picksByPlayer) {
				room.draft.picksByPlayer.delete(socket.id);
			}
			if (room.hostId === socket.id) {
				const next = room.players.keys().next();
				room.hostId = next && !next.done ? next.value : null;
			}
			io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		}
		socket.leave(joinedRoomCode);
		joinedRoomCode = null;
		callback?.({ ok: true });
	});

	// Host sets the game mode while in lobby
	socket.on('room:setGameMode', ({ mode }, callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (room.draft?.phase && room.draft.phase !== 'idle') return callback?.({ ok: false, error: 'NOT_IN_LOBBY' });

		const allowed = new Set(['standard', 'extended', 'round_robin']);
		const next = String(mode || '').toLowerCase();
		if (!allowed.has(next)) return callback?.({ ok: false, error: 'INVALID_MODE' });

		room.game = room.game || { mode: 'standard' };
		room.game.mode = next;

		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		callback?.({ ok: true });
	});

	// Handle disconnects
	socket.on('disconnect', () => {
		if (!joinedRoomCode) return;
		const room = rooms.get(joinedRoomCode);
		if (!room) return;
		room.players.delete(socket.id);
		if (room.draft && room.draft.picksByPlayer) {
			room.draft.picksByPlayer.delete(socket.id);
		}
		if (room.hostId === socket.id) {
			const next = room.players.keys().next();
			room.hostId = next && !next.done ? next.value : null;
		}
		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		if (room.players.size === 0) {
			if (room.draft && room.draft.timer) {
				clearInterval(room.draft.timer);
			}
			rooms.delete(joinedRoomCode);
		}
	});

	// Start the draft (host only)
	socket.on('draft:start', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });

		room.draft.phase = 'draft';
		room.draft.picksByPlayer = new Map();
		room.draft.voting = null;

		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// Submit or update picks during draft
	socket.on('draft:pick', ({ teammates, secondInCommand }, callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.draft.phase !== 'draft') return callback?.({ ok: false, error: 'NOT_IN_DRAFT' });

		const selfId = socket.id;
		const validPlayerIds = new Set(Array.from(room.players.keys()));
		const cleanedTeammates = Array.isArray(teammates) ? teammates.filter((p) => p && p !== selfId && validPlayerIds.has(p)) : [];
		const uniqueTeammates = Array.from(new Set(cleanedTeammates)).slice(0, 2);
		let sic = secondInCommand && secondInCommand !== selfId && validPlayerIds.has(secondInCommand) ? secondInCommand : null;
		if (sic && uniqueTeammates.includes(sic)) {
			const filtered = uniqueTeammates.filter((id) => id !== sic);
			while (filtered.length > 2) filtered.pop();
			room.draft.picksByPlayer.set(selfId, { teammates: filtered, secondInCommand: sic });
		} else {
			room.draft.picksByPlayer.set(selfId, { teammates: uniqueTeammates, secondInCommand: sic });
		}

		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// End draft and move to reveal screen (host only)
	socket.on('draft:end', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (room.draft.phase !== 'draft') return callback?.({ ok: false, error: 'NOT_IN_DRAFT' });

		const playerIds = Array.from(room.players.keys());
		let schedule = generateMatchupSchedule(room.game?.mode || 'standard', playerIds);
		schedule = schedule.map((m) => {
			const template = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)] || '{A} vs {B}';
			return { ...m, promptTemplate: template };
		});
		room.schedule = schedule;
		room.draft.voting = null;
		room.draft.phase = 'reveal';

		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// From reveal to voting (host only)
	socket.on('reveal:continue', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (room.draft.phase !== 'reveal') return callback?.({ ok: false, error: 'NOT_IN_REVEAL' });

		room.draft.voting = { currentRound: 0, votes: {}, voteComments: {} };
		room.draft.phase = 'voting';

		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// Proceed to next voting round (host only)
	socket.on('voting:next', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (room.draft.phase !== 'voting' || !room.draft.voting) return callback?.({ ok: false, error: 'NOT_IN_VOTING' });

		const v = room.draft.voting;
		if (typeof v.currentRound !== 'number') v.currentRound = 0;
		const total = Array.isArray(room.schedule) ? room.schedule.length : 0;
		if (v.currentRound < total - 1) {
			v.currentRound += 1;
		} else {
			// Final round completed → compute and store results, move to results phase
			try {
				const { personalTotals, teamTotals } = computeScoresFromRoom(room);
				room.results = { personalTotals, teamTotals };
			} catch (e) {
				room.results = { personalTotals: {}, teamTotals: {} };
			}
			room.draft.phase = 'results';
			io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		}

		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// Legacy voting API
	socket.on('voting:vote', async ({ pick, because }, callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.draft.phase !== 'voting' || !room.draft.voting) return callback?.({ ok: false, error: 'NOT_IN_VOTING' });

		const vState = room.draft.voting;
		const round = typeof vState.currentRound === 'number' ? vState.currentRound : 0;
		const entry = Array.isArray(room.schedule) ? room.schedule[round] : null;
		if (!entry) return callback?.({ ok: false, error: 'NO_MATCHUP' });
		const a = entry.playerA;
		const b = entry.playerB;
		if (pick !== a && pick !== b) return callback?.({ ok: false, error: 'INVALID_PICK' });
		if (socket.id === a || socket.id === b) return callback?.({ ok: false, error: 'CANNOT_VOTE_SELF_MATCHUP' });

		vState.votes = vState.votes || {};
		vState.voteComments = vState.voteComments || {};
		vState.votes[round] = vState.votes[round] || {};
		vState.voteComments[round] = vState.voteComments[round] || {};
		if (vState.votes[round][socket.id]) {
			return callback?.({ ok: false, error: 'ALREADY_VOTED' });
		}
		vState.votes[round][socket.id] = pick;
		if (typeof because === 'string' && because.trim()) {
			vState.voteComments[round][socket.id] = because.slice(0, 280);
		}

		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true, yourVote: pick });
	});

	// New voting API
	socket.on('vote:cast', async ({ round, choice, comment }, callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.draft.phase !== 'voting' || !room.draft.voting) return callback?.({ ok: false, error: 'NOT_IN_VOTING' });
		const vState = room.draft.voting;
		const r = typeof round === 'number' ? round : vState.currentRound || 0;
		const entry = Array.isArray(room.schedule) ? room.schedule[r] : null;
		if (!entry) return callback?.({ ok: false, error: 'NO_MATCHUP' });
		const a = entry.playerA;
		const b = entry.playerB;
		if (choice !== a && choice !== b) return callback?.({ ok: false, error: 'INVALID_CHOICE' });
		if (socket.id === a || socket.id === b) return callback?.({ ok: false, error: 'CANNOT_VOTE_SELF_MATCHUP' });

		vState.votes = vState.votes || {};
		vState.voteComments = vState.voteComments || {};
		vState.votes[r] = vState.votes[r] || {};
		vState.voteComments[r] = vState.voteComments[r] || {};
		if (vState.votes[r][socket.id]) {
			return callback?.({ ok: false, error: 'ALREADY_VOTED' });
		}
		vState.votes[r][socket.id] = choice;
		if (typeof comment === 'string' && comment.trim()) {
			vState.voteComments[r][socket.id] = comment.slice(0, 280);
		}

		const draftState = getDraftPublicState(room);
		io.to(joinedRoomCode).emit('draft:state', draftState);
		callback?.({ ok: true });
	});

	// Show tally for current round (host only)
	socket.on('vote:results', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (room.draft.phase !== 'voting' || !room.draft.voting) return callback?.({ ok: false, error: 'NOT_IN_VOTING' });
		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});

	// Complete voting and move to results (host only)
	socket.on('voting:complete', async (callback) => {
		if (!joinedRoomCode) return callback?.({ ok: false, error: 'NOT_IN_ROOM' });
		const room = rooms.get(joinedRoomCode);
		if (!room) return callback?.({ ok: false, error: 'ROOM_NOT_FOUND' });
		if (room.hostId !== socket.id) return callback?.({ ok: false, error: 'NOT_HOST' });
		if (!room.draft?.voting) return callback?.({ ok: false, error: 'NOT_IN_VOTING' });
		try {
			const { personalTotals, teamTotals } = computeScoresFromRoom(room);
			room.results = { personalTotals, teamTotals };
		} catch (e) {
			room.results = { personalTotals: {}, teamTotals: {} };
		}
		room.draft.phase = 'results';
		io.to(joinedRoomCode).emit('room:state', getPublicRoomState(room));
		io.to(joinedRoomCode).emit('draft:state', getDraftPublicState(room));
		callback?.({ ok: true });
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Gang Up server listening on http://localhost:${PORT}`);
});


