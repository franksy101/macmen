// Maze layout — 20 cols x 22 rows
// 1 = wall, 0 = pellet, 2 = power pellet, 3 = empty, 4 = ghost door, 9 = ghost spawn
const MAZE_LAYOUT = [
  "11111111111111111111",
  "12000000001000000021",
  "10111011110101111010",
  "10111011110101111010",
  "10000000000000000000",
  "10110101111101010110",
  "10000100000000010000",
  "11110131111113101111",
  "33330131311113101333",
  "11110131911113101111",
  "33333031999913033333",
  "11110131111113101111",
  "33330131111113101333",
  "11110131111113101111",
  "10000000000100000000",
  "10110111110101111010",
  "12001000000000010021",
  "11101010111110101011",
  "10000010000000100000",
  "10111111110111111110",
  "10000000000000000000",
  "11111111111111111111",
];

const TILE_SIZE = 28;
const COLS = 20;
const ROWS = 22;

const TILE = {
  WALL: 1,
  PELLET: 0,
  POWER: 2,
  EMPTY: 3,
  DOOR: 4,
  SPAWN: 9,
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
