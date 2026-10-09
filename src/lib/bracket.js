// Single-elimination bracket construction utilities shared across the
// tournament management UI. Pure functions, no IO.

function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length;
    const next = [];
    for (const x of order) {
      next.push(x);
      next.push(2 * m + 1 - x);
    }
    order = next;
  }
  return order;
}

// Build a single-elimination bracket for the given team names.
// Returns a 2D grid: outer array per round (1..log2(size)), inner array of
// match objects { round, index, team_a, team_b, winner, status }.
// Byes (when teams < bracket size) auto-advance the seeded team.
export function buildBracket(teams) {
  const n = teams.length;
  if (n < 1) return [];
  const size = Math.max(2, Math.pow(2, Math.ceil(Math.log2(n))));
  const positions = seedOrder(size);
  const slots = positions.map((p) => (p <= n ? teams[p - 1] : null));
  const rounds = Math.round(Math.log2(size));

  const grid = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / Math.pow(2, r);
    const row = [];
    for (let i = 0; i < count; i++) {
      row.push({
        round: r,
        index: i,
        team_a: null,
        team_b: null,
        score_a: null,
        score_b: null,
        winner: null,
        status: "pending",
      });
    }
    grid.push(row);
  }

  // Fill round 1.
  for (let i = 0; i < size / 2; i++) {
    const m = grid[0][i];
    m.team_a = slots[2 * i];
    m.team_b = slots[2 * i + 1];
    if (m.team_a && !m.team_b) {
      m.winner = "A";
      m.status = "completed";
    } else if (!m.team_a && m.team_b) {
      m.winner = "B";
      m.status = "completed";
    } else if (m.team_a && m.team_b) {
      m.status = "ready";
    }
  }

  // Propagate byes forward (decided matches seed the next round).
  for (let g = 0; g < rounds - 1; g++) {
    for (let i = 0; i < grid[g + 1].length; i++) {
      const a = grid[g][2 * i];
      const b = grid[g][2 * i + 1];
      const aName = a?.winner ? (a.winner === "A" ? a.team_a : a.team_b) : null;
      const bName = b?.winner ? (b.winner === "A" ? b.team_a : b.team_b) : null;
      grid[g + 1][i].team_a = aName;
      grid[g + 1][i].team_b = bName;
      if (aName && bName) grid[g + 1][i].status = "ready";
    }
  }

  return grid;
}

// Build a round-robin schedule: every team plays every other team exactly once.
// No single-elimination byes are created. For odd team counts the scheduling
// algorithm rotates a dummy slot internally but never emits a bye match —
// every emitted match has two real teams, and all C(n,2) pairings are produced.
// Returns a 2D grid (outer array per round, inner array of matches) with the
// same match object shape as buildBracket.
// Build a round-robin schedule: every team plays every other team exactly once
// (pool play), followed by placeholder semifinal and final rounds. The pool
// matches carry real teams; the semifinals/finals start empty and are seeded
// from the pool standings as scores are posted (see computeStandings).
// Returns a 2D grid (outer array per round, inner array of matches) with the
// same match object shape as buildBracket, plus a `stage` field.
export function buildRoundRobin(teams) {
  const list = teams.filter(Boolean);
  const n = list.length;
  if (n < 2) return [];

  const odd = n % 2 === 1;
  const arr = odd ? [...list, null] : [...list]; // null = dummy bye slot
  const size = arr.length;
  const poolRounds = size - 1;
  const half = size / 2;

  const grid = [];
  // Pool play: round robin, every team plays every other team.
  for (let r = 0; r < poolRounds; r++) {
    const row = [];
    let idx = 0;
    for (let i = 0; i < half; i++) {
      let home = arr[i];
      let away = arr[size - 1 - i];
      // Alternate home/away each round for fairness.
      if (r % 2 === 1) [home, away] = [away, home];
      if (!home || !away) continue; // dummy slot -> skip, no bye match created
      row.push({
        round: r + 1,
        index: idx++,
        stage: "pool",
        team_a: home,
        team_b: away,
        score_a: null,
        score_b: null,
        winner: null,
        status: "ready",
      });
    }
    if (row.length) grid.push(row);
    // Rotate: keep slot 0 fixed, move last element to position 1.
    arr.splice(1, 0, arr.pop());
  }

  // Semifinals: 2 placeholder matches, seeded from the top 4 pool finishers
  // (1 v 4 and 2 v 3) once all pool matches are decided.
  const sfRound = poolRounds + 1;
  grid.push([
    { round: sfRound, index: 0, stage: "semifinal", team_a: null, team_b: null, score_a: null, score_b: null, winner: null, status: "pending" },
    { round: sfRound, index: 1, stage: "semifinal", team_a: null, team_b: null, score_a: null, score_b: null, winner: null, status: "pending" },
  ]);

  // Final: 1 placeholder match, filled by the two semifinal winners.
  grid.push([
    { round: sfRound + 1, index: 0, stage: "final", team_a: null, team_b: null, score_a: null, score_b: null, winner: null, status: "pending" },
  ]);

  return grid;
}

// Rank pool teams by wins, then point differential, then name. Used to seed the
// top 4 into the semifinals once pool play is complete.
export function computeStandings(poolMatches) {
  const stats = {};
  const ensure = (name) => {
    if (!name) return null;
    if (!stats[name]) stats[name] = { name, wins: 0, pf: 0, pa: 0 };
    return stats[name];
  };
  for (const m of poolMatches) {
    if (m.status !== "completed" || !m.winner) continue;
    const a = ensure(m.team_a);
    const b = ensure(m.team_b);
    if (!a || !b) continue;
    a.pf += m.score_a ?? 0;
    a.pa += m.score_b ?? 0;
    b.pf += m.score_b ?? 0;
    b.pa += m.score_a ?? 0;
    if (m.winner === "A") a.wins += 1;
    else b.wins += 1;
  }
  return Object.values(stats).sort(
    (x, y) => y.wins - x.wins || (y.pf - y.pa) - (x.pf - x.pa) || x.name.localeCompare(y.name)
  );
}

export function roundName(round, totalRounds) {
  if (round === totalRounds) return "Final";
  if (round === totalRounds - 1) return "Semifinal";
  if (round === totalRounds - 2) return "Quarterfinal";
  return `Round ${round}`;
}

export const winnerName = (match) => {
  if (!match?.winner) return null;
  return match.winner === "A" ? match.team_a : match.team_b;
};

export const totalRoundsFor = (teamCount) => {
  if (teamCount < 1) return 0;
  return Math.round(Math.log2(Math.max(2, Math.pow(2, Math.ceil(Math.log2(teamCount))))));
};