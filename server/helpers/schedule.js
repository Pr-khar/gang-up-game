export function computePlannedRounds(mode, numPlayers) {
	const n = Math.max(0, Number(numPlayers) || 0);
	switch (mode) {
		case 'extended':
			return n * 2;
		case 'round_robin':
			return Math.floor((n * (n - 1)) / 2);
		case 'standard':
		default:
			return n;
	}
}

export function shuffleArray(array) {
	const arr = array.slice();
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function uniquePairKey(a, b) {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function generateRoundRobinPairs(ids) {
	const pairs = [];
	for (let i = 0; i < ids.length; i += 1) {
		for (let j = i + 1; j < ids.length; j += 1) {
			pairs.push({ playerA: ids[i], playerB: ids[j] });
		}
	}
	return pairs;
}

function generateCycleEdges(ids) {
	const n = ids.length;
	if (n < 2) return [];
	const perm = shuffleArray(ids);
	const edges = [];
	for (let i = 0; i < n; i += 1) {
		const a = perm[i];
		const b = perm[(i + 1) % n];
		edges.push({ playerA: a, playerB: b });
	}
	return edges;
}

function generateStandardSchedule(ids) {
	const n = ids.length;
	if (n < 2) return [];
	return shuffleArray(generateCycleEdges(ids));
}

function generateExtendedSchedule(ids) {
	const n = ids.length;
	if (n < 2) return [];
	const targetEdges = n * 2;
	const used = new Set();
	const degree = new Map(ids.map((id) => [id, 0]));
	const schedule = [];

	const tryAdd = (edge) => {
		const key = uniquePairKey(edge.playerA, edge.playerB);
		if (edge.playerA === edge.playerB) return false;
		if (used.has(key)) return false;
		used.add(key);
		schedule.push(edge);
		degree.set(edge.playerA, degree.get(edge.playerA) + 1);
		degree.set(edge.playerB, degree.get(edge.playerB) + 1);
		return true;
	};

	for (let attempts = 0; attempts < 6 && schedule.length < targetEdges; attempts += 1) {
		const edges = generateCycleEdges(ids);
		shuffleArray(edges).forEach((e) => {
			if (schedule.length < targetEdges) tryAdd(e);
		});
	}

	const pairTried = new Set();
	while (schedule.length < targetEdges) {
		const sorted = ids.slice().sort((a, b) => degree.get(a) - degree.get(b));
		let added = false;
		for (let i = 0; i < sorted.length && !added; i += 1) {
			for (let j = i + 1; j < sorted.length && !added; j += 1) {
				const a = sorted[i];
				const b = sorted[j];
				const key = uniquePairKey(a, b);
				if (pairTried.has(key)) continue;
				pairTried.add(key);
				if (!used.has(key)) {
					added = tryAdd({ playerA: a, playerB: b });
				}
			}
		}
		if (!added) break;
	}

	while (schedule.length < targetEdges) {
		const allPairs = [];
		for (let i = 0; i < ids.length; i += 1) {
			for (let j = i + 1; j < ids.length; j += 1) {
				const a = ids[i];
				const b = ids[j];
				allPairs.push({ a, b, score: degree.get(a) + degree.get(b) });
			}
		}
		allPairs.sort((p1, p2) => p1.score - p2.score);
		let placed = false;
		for (const p of allPairs) {
			schedule.push({ playerA: p.a, playerB: p.b });
			degree.set(p.a, degree.get(p.a) + 1);
			degree.set(p.b, degree.get(p.b) + 1);
			placed = true;
			break;
		}
		if (!placed) break;
	}

	return shuffleArray(schedule);
}

export function generateMatchupSchedule(mode, playerIds) {
	const ids = Array.from(playerIds || []);
	if (ids.length < 2) return [];
	const m = String(mode || 'standard').toLowerCase();
	if (m === 'round_robin') return shuffleArray(generateRoundRobinPairs(ids));
	if (m === 'extended') return generateExtendedSchedule(ids);
	return generateStandardSchedule(ids);
}


