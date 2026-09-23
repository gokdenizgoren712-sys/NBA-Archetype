/* BUILD §10.2 / 15b / 15y: oy seçicisi sezon kadrosunu değil, bu maçta
   gerçekten sahaya çıkan ve API'de kimliği doğrulanmış oyuncuları kullanır. */
export function playedPlayers(lineups) {
  if (!Array.isArray(lineups)) return [];
  const result = [];
  const seen = new Set();
  for (const side of lineups) {
    for (const [role, rows] of [["STARTED", side.starters], ["CAME ON", side.bench]]) {
      for (const player of Array.isArray(rows) ? rows : []) {
        const id = Number(player.player_id);
        if (!Number.isSafeInteger(id) || id <= 0 || player.played !== true || seen.has(id)) continue;
        seen.add(id);
        result.push({
          id, name: player.name, shirt_no: player.shirt_no,
          position: player.position, sub_in: player.sub_in,
          replaced: player.replaced, role,
          team: side.team, team_id: side.team_id, side: side.side,
        });
      }
    }
  }
  return result;
}
