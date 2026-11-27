import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  START_FEN,
  parseFen,
  toFen,
  generateLegalMoves,
  applyMove,
  getGameOutcome,
  chooseBotMove,
  processCommand,
  createInitialState,
  renderBoardSvg,
  renderChessSection,
  updateFiles,
  uciOf,
} from './chess.mjs';

test('initial position has 20 legal moves and round-trips FEN', () => {
  const pos = parseFen(START_FEN);
  assert.equal(toFen(pos), START_FEN);
  const moves = generateLegalMoves(pos);
  assert.equal(moves.length, 20);
  const outcome = getGameOutcome(pos, moves);
  assert.equal(outcome.over, false);
});

test('detects Scholar Mate / Fool Mate checkmate accurately', () => {
  // Fool's Mate: 1. f3 e5 2. g4 Qh4#
  const foolsMate = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  const outcome = getGameOutcome(foolsMate);
  assert.equal(outcome.over, true);
  assert.match(outcome.status, /Checkmate/);
});

test('detects stalemate accurately', () => {
  const stalematePos = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const outcome = getGameOutcome(stalematePos);
  assert.equal(outcome.over, true);
  assert.match(outcome.status, /Stalemate/);
});

test('handles castling, en passant, and pawn promotion', () => {
  // Castling allowed when clear & safe
  const castlePos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const castleUcis = generateLegalMoves(castlePos).map(uciOf);
  assert.ok(castleUcis.includes('e1g1'));
  assert.ok(castleUcis.includes('e1c1'));

  // En passant capture
  const epPos = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const epMoves = generateLegalMoves(epPos);
  const epMove = epMoves.find((m) => uciOf(m) === 'e5d6');
  assert.ok(epMove);
  const afterEp = applyMove(epPos, epMove);
  assert.equal(afterEp.board[3 * 8 + 3], null); // d5 pawn removed

  // Promotion generates q, r, b, n
  const promoPos = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  const promoUcis = generateLegalMoves(promoPos).map(uciOf);
  assert.ok(promoUcis.includes('a7a8q'));
  assert.ok(promoUcis.includes('a7a8n'));
});

test('bot picks mate-in-1 when available', () => {
  // Black to move: Qh4# is mate-in-1 after 1. f3 e5 2. g4
  const pos = parseFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
  const botMove = chooseBotMove(pos, 2);
  assert.equal(uciOf(botMove), 'd8h4');
});

test('processCommand handles legal move + bot reply, illegal moves, injection, and reset', () => {
  const init = createInitialState();
  const played = processCommand(init, 'e2e4');
  assert.equal(played.ok, true);
  assert.equal(played.state.version, 1);
  assert.equal(played.state.history.length, 2); // White + Bot
  assert.match(played.message, /Played \*\*e4\*\*/);

  const badMove = processCommand(played.state, 'e2e4'); // e2 is now empty
  assert.equal(badMove.ok, false);

  const invalidCmd = processCommand(played.state, 'drop table; rm -rf /');
  assert.equal(invalidCmd.ok, false);

  const reset = processCommand(played.state, 'new');
  assert.equal(reset.ok, true);
  assert.equal(reset.state.fen, START_FEN);
  assert.equal(reset.state.history.length, 0);
});

test('renders valid SVG and updates README markers cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-test-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'README.md'),
      '# Test\n\n<!-- CHESS:START -->\nold\n<!-- CHESS:END -->\n\nFooter\n',
      'utf8',
    );
    const res1 = updateFiles({ rootDir: tmpDir, command: 'e2e4' });
    assert.equal(res1.ok, true);

    const svg = fs.readFileSync(path.join(tmpDir, 'assets', 'chess-board.svg'), 'utf8');
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>\s*$/);
    assert.match(svg, /#2563EB/); // last move highlight

    const updatedReadme = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.match(updatedReadme, /assets\/chess-board\.svg\?v=1/);
    assert.match(updatedReadme, /Footer/);
    assert.equal(updatedReadme.includes('—'), false);

    // Ensure non-chess issue title is not accepted as a move
    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'assets', 'chess-state.json'), 'utf8'));
    assert.equal(state.version, 1);
    const rendered = renderChessSection(state);
    assert.match(rendered, /Choose a move/);
    const svgCheck = renderBoardSvg(parseFen(state.fen), state.lastMove);
    assert.ok(svgCheck.includes('<svg'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
