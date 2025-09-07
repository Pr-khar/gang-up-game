// Placeholder scoring module for future expansion
// Compute aggregate tallies or per-player scores from draft/voting state
export function computeScores(room) {
	const scores = new Map();
	if (!room?.draft?.voting || !Array.isArray(room.schedule)) return scores;
	const votes = room.draft.voting.votes || {};
	for (const [roundStr, voteMap] of Object.entries(votes)) {
		const round = Number(roundStr);
		const entry = room.schedule[round];
		if (!entry) continue;
		const a = entry.playerA;
		const b = entry.playerB;
		let aCount = 0;
		let bCount = 0;
		for (const choice of Object.values(voteMap || {})) {
			if (choice === a) aCount += 1;
			if (choice === b) bCount += 1;
		}
		scores.set(a, (scores.get(a) || 0) + aCount);
		scores.set(b, (scores.get(b) || 0) + bCount);
	}
	return scores;
}


