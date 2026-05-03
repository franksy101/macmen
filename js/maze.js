// Maze layout — 21 cols x 23 rows
// Symmetrisches Layout angelehnt an klassisches Pacman
//   1 = wall    0 = pellet    2 = power pellet    3 = empty
//   4 = ghost door    5 = ghost house interior
const MAZE_LAYOUT = [
  "111111111111111111111", // 0
  "100000000010000000001", // 1
  "102111011110111110021", // 2
  "100000000000000000001", // 3
  "101101111010111101101", // 4
  "100000001010100000001", // 5
  "111110111010111011111", // 6
  "111110100000000101111", // 7
  "111110101144110101111", // 8
  "333330101555510103333", // 9   tunnel row
  "111110101555510101111", // 10
  "333330101555510103333", // 11  tunnel row
  "111110101111110101111", // 12
  "111110100000000101111", // 13
  "111110111010111011111", // 14
  "100000000010000000001", // 15
  "102111011110111110021", // 16
  "100100000000000001001", // 17
  "111100110111110011111", // 18
  "100000010000010000001", // 19
  "101111110111110111101", // 20
  "100000000000000000001", // 21
  "111111111111111111111", // 22
];

const TILE_SIZE = 26;
const COLS = 21;
const ROWS = 23;

const TILE = {
  WALL: 1,
  PELLET: 0,
  POWER: 2,
  EMPTY: 3,
  DOOR: 4,
  HOUSE: 5,
};

function parseMaze() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE_LAYOUT[r][c];
      row.push(parseInt(ch, 10));
    }
    grid.push(row);
  }
  return grid;
}

function countPellets(grid) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === TILE.PELLET || grid[r][c] === TILE.POWER) n++;
    }
  }
  return n;
}

function isWalkable(tile) {
  return tile !== TILE.WALL && tile !== undefined;
}

// Spawn-Punkte (werden in game.js verwendet)
const PLAYER_SPAWN = { col: 10, row: 17 };
// Tür: (10,8) und (11,8) — Spawnpunkte und Exit zentriert dazwischen (col 10)
const GHOST_DOOR = { col: 10, row: 8 };
const GHOST_HOUSE = [
  { col: 9,  row: 10 },
  { col: 10, row: 10 },
  { col: 11, row: 10 },
  { col: 12, row: 10 },
];
const GHOST_RETURN = { col: 10, row: 8 };  // Tür-Tile selbst
const GHOST_EXIT   = { col: 10, row: 7 };  // direkt über der Tür, außerhalb
