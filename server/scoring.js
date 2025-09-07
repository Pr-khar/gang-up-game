/**
 * Scoring engine
 *
 * Implements the PRD rules as a pure function operating on final team data, the
 * matchup schedule, and the collected votes. It does not mutate inputs.
 *
 * Scoring rules
 * - Pre-round points:
 *   - +1 for each time a player is chosen as a Team Member by any leader
 *   - +2 for each time a player is chosen as 2IC by any leader
 * - Per-round points (for each matchup):
 *   - +1 per vote received by a candidate
 *   - +0.5 to each voter who picked the winning candidate(s). If there is a tie,
 *     voters for either side get the +0.5
 *   - +1 team-member win bonus to each leader for whom the winning candidate is on
 *     their team. If both candidates are on the leader's team, or none are, this
 *     bonus is 0 for that leader in that round
 * - Team totals:
 *   - For each leader: sum the personal totals of their teammates, with the 2IC
 *     personal total multiplied by 1.5x. Leader's own personal is NOT included
 *     in the team total (assumption documented here)
 *
 * Input shapes
 * - teams: Map<string, { teammates: string[], secondInCommand: string|null }>
 *          or a plain object keyed by leaderId with the same values
 * - schedule: Array<{ playerA: string, playerB: string }>
 * - votes: { [roundIndex: number]: { [voterId: string]: string } } // value is candidateId
 *
 * Returns
 * {
 *   personalTotals: { [playerId: string]: number },
 *   teamTotals: { [leaderId: string]: number }
 * }
 */
export function calculateScores(teams, schedule, votes) {
	const normalizedTeams = normalizeTeams(teams);
	const normalizedSchedule = Array.isArray(schedule) ? schedule.slice() : [];
	const normalizedVotes = votes && typeof votes === 'object' ? votes : {};

	const personalTotals = {};
	const allPlayerIds = new Set();

	// Seed players from teams
	for (const [leaderId, t] of normalizedTeams.entries()) {
		allPlayerIds.add(leaderId);
		(t.teammates || []).forEach((pid) => allPlayerIds.add(pid));
		if (t.secondInCommand) allPlayerIds.add(t.secondInCommand);
	}

	// Seed players from schedule and votes
	for (const entry of normalizedSchedule) {
		if (!entry) continue;
		if (entry.playerA != null) allPlayerIds.add(entry.playerA);
		if (entry.playerB != null) allPlayerIds.add(entry.playerB);
	}
	for (const voteMap of Object.values(normalizedVotes)) {
		for (const [voterId, choiceId] of Object.entries(voteMap || {})) {
			allPlayerIds.add(voterId);
			allPlayerIds.add(choiceId);
		}
	}

	// Initialize totals
	for (const pid of allPlayerIds) personalTotals[pid] = 0;

	// Pre-round points
	for (const [, t] of normalizedTeams.entries()) {
		for (const teammateId of t.teammates || []) {
			personalTotals[teammateId] = (personalTotals[teammateId] || 0) + 1;
		}
		if (t.secondInCommand) {
			personalTotals[t.secondInCommand] = (personalTotals[t.secondInCommand] || 0) + 2;
		}
	}

	// Per-round points
	for (let r = 0; r < normalizedSchedule.length; r += 1) {
		const matchup = normalizedSchedule[r];
		if (!matchup) continue;
		const a = matchup.playerA;
		const b = matchup.playerB;
		if (a == null || b == null) continue;

		const voteMap = normalizedVotes[r] || {};
		let aCount = 0;
		let bCount = 0;
		for (const [voterId, picked] of Object.entries(voteMap)) {
			if (picked === a) aCount += 1;
			else if (picked === b) bCount += 1;
			else continue;
			// +1 to the candidate for each vote received
			personalTotals[picked] = (personalTotals[picked] || 0) + 1;
		}

		let winners;
		if (aCount > bCount) winners = new Set([a]);
		else if (bCount > aCount) winners = new Set([b]);
		else winners = new Set([a, b]);

		// +0.5 to each voter who picked any winning candidate
		for (const [voterId, picked] of Object.entries(voteMap)) {
			if (winners.has(picked)) {
				personalTotals[voterId] = (personalTotals[voterId] || 0) + 0.5;
			}
		}

		// +1 team-member win bonus for eligible leaders
		for (const [leaderId, t] of normalizedTeams.entries()) {
			const onTeamA = isOnTeam(t, a);
			const onTeamB = isOnTeam(t, b);
			if (onTeamA && onTeamB) continue; // both on team → 0
			if (!onTeamA && !onTeamB) continue; // none on team → 0
			const candidateOnTeam = onTeamA ? a : b;
			if (winners.has(candidateOnTeam)) {
				personalTotals[leaderId] = (personalTotals[leaderId] || 0) + 1;
			}
		}
	}

	// Team totals: teammates sum + 1.5x 2IC
	const teamTotals = {};
	for (const [leaderId, t] of normalizedTeams.entries()) {
		let sum = 0;
		for (const teammateId of t.teammates || []) {
			sum += personalTotals[teammateId] || 0;
		}
		if (t.secondInCommand) {
			sum += 1.5 * (personalTotals[t.secondInCommand] || 0);
		}
		teamTotals[leaderId] = sum;
	}

	return { personalTotals, teamTotals };
}

/**
 * Convenience wrapper for callers that have the full in-memory room object.
 * This function extracts the final teams, schedule, and votes from the room and
 * returns the same structure as calculateScores.
 */
export function computeScoresFromRoom(room) {
	if (!room || !room.draft) return { personalTotals: {}, teamTotals: {} };
	const teams = room.draft.picksByPlayer || new Map();
	const schedule = Array.isArray(room.schedule) ? room.schedule : [];
	const votes = room.draft.voting?.votes || {};
	return calculateScores(teams, schedule, votes);
}

// Backwards-compat export. Prefer calculateScores or computeScoresFromRoom.
export function computeScores(room) {
	return computeScoresFromRoom(room);
}

function normalizeTeams(teams) {
	if (!teams) return new Map();
	if (teams instanceof Map) return cloneTeamsMap(teams);
	if (typeof teams === 'object') return mapFromObjectTeams(teams);
	return new Map();
}

function cloneTeamsMap(teamsMap) {
	const out = new Map();
	for (const [leaderId, t] of teamsMap.entries()) {
		out.set(leaderId, {
			teammates: Array.isArray(t?.teammates) ? t.teammates.slice(0, 2) : [],
			secondInCommand: t?.secondInCommand || null
		});
	}
	return out;
}

function mapFromObjectTeams(obj) {
	const out = new Map();
	for (const [leaderId, t] of Object.entries(obj)) {
		out.set(leaderId, {
			teammates: Array.isArray(t?.teammates) ? t.teammates.slice(0, 2) : [],
			secondInCommand: t?.secondInCommand || null
		});
	}
	return out;
}

function isOnTeam(team, playerId) {
	if (!team || playerId == null) return false;
	if (team.secondInCommand && team.secondInCommand === playerId) return true;
	return Array.isArray(team.teammates) && team.teammates.includes(playerId);
}

// Sample smoke test (run with: SCORING_SAMPLE=1 node server/scoring.js)
if (process?.env?.SCORING_SAMPLE === '1') {
	// Example players: L1, L2 are leaders; P3, P4, P5 are others
	const teams = new Map([
		['L1', { teammates: ['P4'], secondInCommand: 'P3' }],
		['L2', { teammates: ['P5'], secondInCommand: null }]
	]);
	const schedule = [
		{ playerA: 'P3', playerB: 'P4' }, // round 0
		{ playerA: 'P5', playerB: 'P3' }  // round 1
	];
	const votes = {
		0: { L1: 'P3', L2: 'P4', P5: 'P3' }, // P3 wins 2-1 → L1 leader bonus
		1: { L1: 'P3', L2: 'P5', P4: 'P5' }  // P5 wins 2-1 → L2 leader bonus
	};

	const { personalTotals, teamTotals } = calculateScores(teams, schedule, votes);

	// Expected personal totals
	// P3: pre +2 (2IC) +2 (r0 votes) +1 (r1 votes) = 5
	// P4: pre +1 (teammate) +1 (r0 votes) +0.5 (r1 picked winner) = 2.5
	// P5: pre +1 (teammate) +0.5 (r0 picked winner) +2 (r1 votes) = 3.5
	// L1: +1 (r0 leader bonus) +0.5 (r0 picked winner) = 1.5
	// L2: +1 (r1 leader bonus) +0.5 (r1 picked winner) = 1.5
	console.assert(Math.abs((personalTotals['P3'] || 0) - 5) < 1e-9, 'Expected P3 = 5');
	console.assert(Math.abs((personalTotals['P4'] || 0) - 2.5) < 1e-9, 'Expected P4 = 2.5');
	console.assert(Math.abs((personalTotals['P5'] || 0) - 3.5) < 1e-9, 'Expected P5 = 3.5');
	console.assert(Math.abs((personalTotals['L1'] || 0) - 1.5) < 1e-9, 'Expected L1 = 1.5');
	console.assert(Math.abs((personalTotals['L2'] || 0) - 1.5) < 1e-9, 'Expected L2 = 1.5');

	// Expected team totals
	// L1: teammates [P4] + 1.5×2IC(P3) → 2.5 + 1.5*5 = 10.0
	// L2: teammates [P5] → 3.5
	console.assert(Math.abs((teamTotals['L1'] || 0) - 10) < 1e-9, 'Expected team L1 = 10');
	console.assert(Math.abs((teamTotals['L2'] || 0) - 3.5) < 1e-9, 'Expected team L2 = 3.5');

	console.log('[SCORING_SAMPLE] personalTotals:', personalTotals);
	console.log('[SCORING_SAMPLE] teamTotals:', teamTotals);
	console.log('[SCORING_SAMPLE] OK');
}

