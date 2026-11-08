import { assertBoard, fromOffset, type Board, type Hex, ARENA } from './hex.js';
import { randomBelow } from '../../domain/src/random.js';

/** Clockwise inset perimeter, corners included once. Offset-grid inset is exactly two rows/columns. */
export function insetPerimeter(board: Board = ARENA): Hex[] {
  assertBoard(board);
  if (board.columns < 6 || board.rows < 6) throw new Error('BOARD_TOO_SMALL');
  const left = 2,
    right = board.columns - 3,
    top = 2,
    bottom = board.rows - 3;
  const cells: Hex[] = [];
  for (let column = left; column <= right; column++) cells.push(fromOffset({ column, row: top }));
  for (let row = top + 1; row <= bottom; row++) cells.push(fromOffset({ column: right, row }));
  for (let column = right - 1; column >= left; column--) cells.push(fromOffset({ column, row: bottom }));
  for (let row = bottom - 1; row > top; row--) cells.push(fromOffset({ column: left, row }));
  return cells;
}
export function startingPositions(
  players: number,
  randomState: number,
  board: Board = ARENA,
): { positions: Hex[]; randomState: number } {
  if (!Number.isInteger(players) || players < 2 || players > 8) throw new Error('INVALID_PLAYER_COUNT');
  const perimeter = insetPerimeter(board);
  if (perimeter.length < players) throw new Error('INSUFFICIENT_SPAWNS');
  const draw = randomBelow(randomState, perimeter.length);
  return {
    positions: Array.from({ length: players }, (_, i) => ({
      ...perimeter[(draw.value + Math.floor((i * perimeter.length) / players)) % perimeter.length]!,
    })),
    randomState: draw.state,
  };
}
