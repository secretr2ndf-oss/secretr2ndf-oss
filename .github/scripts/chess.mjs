import fs from 'node:fs';
import path from 'node:path';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
const REPO_URL = 'https://github.com/secretr2ndf-oss/secretr2ndf-oss';

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables from White's perspective (row 0 = rank 8, row 7 = rank 1)
const PST = {
  p: [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
    -5, 0,  0,  0,  0,  0,  0, -5,
    -5, 0,  0,  0,  0,  0,  0, -5,
    -5, 0,  0,  0,  0,  0,  0, -5,
    -5, 0,  0,  0,  0,  0,  0, -5,
    -5, 0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -5,   0,  5,  5,  5,  5,  0, -5,
    0,    0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

export function sqToCoord(sq) {
  return FILES[sq % 8] + String(8 - Math.floor(sq / 8));
}

export function coordToSq(coord) {
  if (!/^[a-h][1-8]$/.test(coord)) return -1;
  const col = FILES.indexOf(coord[0]);
  const row = 8 - Number(coord[1]);
  return row * 8 + col;
}

export function pieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

export function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Invalid FEN: ${fen}`);
  const [boardStr, turn, castlingStr, epStr, halfStr = '0', fullStr = '1'] = parts;
  const board = new Array(64).fill(null);
  const rows = boardStr.split('/');
  if (rows.length !== 8) throw new Error(`Invalid FEN board: ${fen}`);

  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) {
        c += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        board[r * 8 + c] = ch;
        c++;
      } else {
        throw new Error(`Invalid FEN char '${ch}'`);
      }
    }
    if (c !== 8) throw new Error(`Invalid FEN row ${r}`);
  }

  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      K: castlingStr.includes('K'),
      Q: castlingStr.includes('Q'),
      k: castlingStr.includes('k'),
      q: castlingStr.includes('q'),
    },
    ep: epStr === '-' ? null : coordToSq(epStr),
    halfmove: Number(halfStr) || 0,
    fullmove: Number(fullStr) || 1,
  };
}

export function toFen(pos) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let row = '';
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r * 8 + c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += p;
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const castling =
    (pos.castling.K ? 'K' : '') +
      (pos.castling.Q ? 'Q' : '') +
      (pos.castling.k ? 'k' : '') +
      (pos.castling.q ? 'q' : '') || '-';
  const ep = pos.ep === null ? '-' : sqToCoord(pos.ep);
  return `${rows.join('/')} ${pos.turn} ${castling} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

export function isSquareAttacked(board, sq, byColor) {
  const r = Math.floor(sq / 8);
  const c = sq % 8;

  // Pawns
  const pawnDir = byColor === 'w' ? 1 : -1;
  const attackerPawn = byColor === 'w' ? 'P' : 'p';
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8 && board[pr * 8 + pc] === attackerPawn) {
      return true;
    }
  }

  // Knights
  const attackerKnight = byColor === 'w' ? 'N' : 'n';
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === attackerKnight) {
      return true;
    }
  }

  // King
  const attackerKing = byColor === 'w' ? 'K' : 'k';
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const kr = r + dr;
      const kc = c + dc;
      if (kr >= 0 && kr < 8 && kc >= 0 && kc < 8 && board[kr * 8 + kc] === attackerKing) {
        return true;
      }
    }
  }

  // Diagonal rays (Bishop / Queen)
  const attackerB = byColor === 'w' ? 'B' : 'b';
  const attackerQ = byColor === 'w' ? 'Q' : 'q';
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p === attackerB || p === attackerQ) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Orthogonal rays (Rook / Queen)
  const attackerR = byColor === 'w' ? 'R' : 'r';
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p === attackerR || p === attackerQ) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return false;
}

export function findKing(board, color) {
  const target = color === 'w' ? 'K' : 'k';
  return board.indexOf(target);
}

export function inCheck(pos, color = pos.turn) {
  const kingSq = findKing(pos.board, color);
  if (kingSq === -1) return false;
  return isSquareAttacked(pos.board, kingSq, color === 'w' ? 'b' : 'w');
}

function generatePseudoLegalMoves(pos) {
  const moves = [];
  const { board, turn, castling, ep } = pos;
  const enemy = turn === 'w' ? 'b' : 'w';

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || pieceColor(piece) !== turn) continue;

    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const type = piece.toLowerCase();

    if (type === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const startRow = turn === 'w' ? 6 : 1;
      const promoRow = turn === 'w' ? 0 : 7;

      const oneSq = (r + dir) * 8 + c;
      if (r + dir >= 0 && r + dir < 8 && !board[oneSq]) {
        if (r + dir === promoRow) {
          for (const promo of ['q', 'r', 'b', 'n']) {
            moves.push({ from: sq, to: oneSq, promo });
          }
        } else {
          moves.push({ from: sq, to: oneSq });
          if (r === startRow) {
            const twoSq = (r + dir * 2) * 8 + c;
            if (!board[twoSq]) {
              moves.push({ from: sq, to: twoSq, doublePush: true });
            }
          }
        }
      }

      for (const dc of [-1, 1]) {
        const nc = c + dc;
        const nr = r + dir;
        if (nc < 0 || nc >= 8 || nr < 0 || nr >= 8) continue;
        const capSq = nr * 8 + nc;
        const target = board[capSq];
        if (target && pieceColor(target) === enemy) {
          if (nr === promoRow) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              moves.push({ from: sq, to: capSq, promo });
            }
          } else {
            moves.push({ from: sq, to: capSq });
          }
        } else if (ep !== null && capSq === ep) {
          moves.push({ from: sq, to: capSq, enPassant: true });
        }
      }
    } else if (type === 'n') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        const to = nr * 8 + nc;
        if (pieceColor(board[to]) !== turn) {
          moves.push({ from: sq, to });
        }
      }
    } else if (type === 'b' || type === 'r' || type === 'q') {
      const dirs = [];
      if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = nr * 8 + nc;
          const target = board[to];
          if (!target) {
            moves.push({ from: sq, to });
          } else {
            if (pieceColor(target) === enemy) moves.push({ from: sq, to });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (type === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
          const to = nr * 8 + nc;
          if (pieceColor(board[to]) !== turn) {
            moves.push({ from: sq, to });
          }
        }
      }

      if (turn === 'w' && sq === 60) {
        if (
          castling.K &&
          !board[61] &&
          !board[62] &&
          board[63] === 'R' &&
          !isSquareAttacked(board, 60, 'b') &&
          !isSquareAttacked(board, 61, 'b') &&
          !isSquareAttacked(board, 62, 'b')
        ) {
          moves.push({ from: 60, to: 62, castle: 'K' });
        }
        if (
          castling.Q &&
          !board[59] &&
          !board[58] &&
          !board[57] &&
          board[56] === 'R' &&
          !isSquareAttacked(board, 60, 'b') &&
          !isSquareAttacked(board, 59, 'b') &&
          !isSquareAttacked(board, 58, 'b')
        ) {
          moves.push({ from: 60, to: 58, castle: 'Q' });
        }
      } else if (turn === 'b' && sq === 4) {
        if (
          castling.k &&
          !board[5] &&
          !board[6] &&
          board[7] === 'r' &&
          !isSquareAttacked(board, 4, 'w') &&
          !isSquareAttacked(board, 5, 'w') &&
          !isSquareAttacked(board, 6, 'w')
        ) {
          moves.push({ from: 4, to: 6, castle: 'k' });
        }
        if (
          castling.q &&
          !board[3] &&
          !board[2] &&
          !board[1] &&
          board[0] === 'r' &&
          !isSquareAttacked(board, 4, 'w') &&
          !isSquareAttacked(board, 3, 'w') &&
          !isSquareAttacked(board, 2, 'w')
        ) {
          moves.push({ from: 4, to: 2, castle: 'q' });
        }
      }
    }
  }

  return moves;
}

export function applyMove(pos, move) {
  const board = pos.board.slice();
  const piece = board[move.from];
  const captured = board[move.to];
  const castling = { ...pos.castling };
  let ep = null;

  board[move.from] = null;
  if (move.promo) {
    board[move.to] = pos.turn === 'w' ? move.promo.toUpperCase() : move.promo.toLowerCase();
  } else {
    board[move.to] = piece;
  }

  if (move.enPassant) {
    const capSq = pos.turn === 'w' ? move.to + 8 : move.to - 8;
    board[capSq] = null;
  }

  if (move.doublePush) {
    ep = pos.turn === 'w' ? move.from - 8 : move.from + 8;
  }

  if (move.castle === 'K') {
    board[61] = 'R';
    board[63] = null;
  } else if (move.castle === 'Q') {
    board[59] = 'R';
    board[56] = null;
  } else if (move.castle === 'k') {
    board[5] = 'r';
    board[7] = null;
  } else if (move.castle === 'q') {
    board[3] = 'r';
    board[0] = null;
  }

  if (piece === 'K') {
    castling.K = false;
    castling.Q = false;
  } else if (piece === 'k') {
    castling.k = false;
    castling.q = false;
  }
  if (move.from === 63 || move.to === 63) castling.K = false;
  if (move.from === 56 || move.to === 56) castling.Q = false;
  if (move.from === 7 || move.to === 7) castling.k = false;
  if (move.from === 0 || move.to === 0) castling.q = false;

  const isPawnOrCap = piece.toLowerCase() === 'p' || Boolean(captured) || Boolean(move.enPassant);
  return {
    board,
    turn: pos.turn === 'w' ? 'b' : 'w',
    castling,
    ep,
    halfmove: isPawnOrCap ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

export function generateLegalMoves(pos) {
  const pseudo = generatePseudoLegalMoves(pos);
  return pseudo.filter((move) => {
    const next = applyMove(pos, move);
    return !inCheck(next, pos.turn);
  });
}

export function uciOf(move) {
  return sqToCoord(move.from) + sqToCoord(move.to) + (move.promo || '');
}

export function formatMoveLabel(pos, move) {
  if (move.castle === 'K' || move.castle === 'k') return 'O-O';
  if (move.castle === 'Q' || move.castle === 'q') return 'O-O-O';
  const piece = pos.board[move.from];
  const type = piece.toLowerCase();
  const isCap = Boolean(pos.board[move.to]) || Boolean(move.enPassant);
  const to = sqToCoord(move.to);
  const from = sqToCoord(move.from);
  const promo = move.promo ? `=${move.promo.toUpperCase()}` : '';
  if (type === 'p') {
    return isCap ? `${from[0]}x${to}${promo}` : `${to}${promo}`;
  }
  return `${type.toUpperCase()}${isCap ? 'x' : ''}${to}`;
}

export function isInsufficientMaterial(board) {
  const minors = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === 'p' || t === 'r' || t === 'q') return false;
    if (t === 'n' || t === 'b') {
      minors.push({ type: t, sqColor: (Math.floor(sq / 8) + (sq % 8)) % 2 });
    }
  }
  if (minors.length <= 1) return true;
  if (
    minors.length === 2 &&
    minors[0].type === 'b' &&
    minors[1].type === 'b' &&
    minors[0].sqColor === minors[1].sqColor
  ) {
    return true;
  }
  return false;
}

export function getGameOutcome(pos, legalMoves = generateLegalMoves(pos)) {
  if (legalMoves.length === 0) {
    if (inCheck(pos, pos.turn)) {
      return {
        over: true,
        status: pos.turn === 'w' ? 'Checkmate! Black (Bot) wins.' : 'Checkmate! White wins.',
      };
    }
    return { over: true, status: 'Stalemate! Game drawn.' };
  }
  if (pos.halfmove >= 100) {
    return { over: true, status: 'Draw by 50-move rule.' };
  }
  if (isInsufficientMaterial(pos.board)) {
    return { over: true, status: 'Draw by insufficient material.' };
  }
  const checkSuffix = inCheck(pos, pos.turn) ? ' (Check!)' : '';
  return {
    over: false,
    status: `${pos.turn === 'w' ? 'White' : 'Black'} to move (Move #${pos.fullmove})${checkSuffix}`,
  };
}

function evaluatePosition(pos) {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const isWhite = p === p.toUpperCase();
    const type = p.toLowerCase();
    const pstSq = isWhite ? sq : (7 - Math.floor(sq / 8)) * 8 + (sq % 8);
    const val = PIECE_VALUES[type] + PST[type][pstSq];
    score += isWhite ? val : -val;
  }
  return score;
}

function orderMoves(pos, moves) {
  return moves.slice().sort((a, b) => {
    const capA = pos.board[a.to] ? PIECE_VALUES[pos.board[a.to].toLowerCase()] : 0;
    const capB = pos.board[b.to] ? PIECE_VALUES[pos.board[b.to].toLowerCase()] : 0;
    const promoA = a.promo ? 800 : 0;
    const promoB = b.promo ? 800 : 0;
    return capB + promoB - (capA + promoA);
  });
}

function alphabeta(pos, depth, alpha, beta, maximizing) {
  const legal = generateLegalMoves(pos);
  if (legal.length === 0) {
    if (inCheck(pos, pos.turn)) {
      return maximizing ? -100000 - depth : 100000 + depth;
    }
    return 0;
  }
  if (depth === 0) return evaluatePosition(pos);

  const ordered = orderMoves(pos, legal);
  if (maximizing) {
    let best = -Infinity;
    for (const m of ordered) {
      const score = alphabeta(applyMove(pos, m), depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of ordered) {
      const score = alphabeta(applyMove(pos, m), depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

export function chooseBotMove(pos, depth = 2) {
  const legal = generateLegalMoves(pos);
  if (legal.length === 0) return null;

  const ordered = orderMoves(pos, legal);
  const maximizing = pos.turn === 'w';
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMoves = [];

  for (const m of ordered) {
    const score = alphabeta(applyMove(pos, m), depth - 1, -Infinity, Infinity, !maximizing);
    if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
      bestScore = score;
      bestMoves = [m];
    } else if (score === bestScore) {
      bestMoves.push(m);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// Standard 45x45 Staunton vector silhouettes
function renderPieceSvg(piece, x, y, size) {
  const isWhite = piece === piece.toUpperCase();
  const type = piece.toLowerCase();
  const fill = isWhite ? '#FFFFFF' : '#0F172A';
  const stroke = isWhite ? '#0F172A' : '#E2E8F0';
  const detail = isWhite ? '#0F172A' : '#E2E8F0';
  const scale = size / 45;

  const shapes = {
    p: `<path d="M22.5,9 C19.5,9 17.5,11.2 17.5,14 C17.5,15.8 18.4,17.4 19.8,18.2 C16.9,19.7 15,22.8 15,26.5 C15,28.5 15.8,30.2 17,31.5 L12.5,37.5 L32.5,37.5 L28,31.5 C29.2,30.2 30,28.5 30,26.5 C30,22.8 28.1,19.7 25.2,18.2 C26.6,17.4 27.5,15.8 27.5,14 C27.5,11.2 25.5,9 22.5,9 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`,
    r: `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"><path d="M9,39 L36,39 L36,36 L9,36 L9,39 Z"/><path d="M12,36 L12,32 L33,32 L33,36 L12,36 Z"/><path d="M11,14 L11,9 L15,9 L15,11 L20,11 L20,9 L25,9 L25,11 L30,11 L30,9 L34,9 L34,14"/><path d="M34,14 L31,17 L14,17 L11,14"/><path d="M31,17 L31,29.5 L14,29.5 L14,17"/><path d="M31,29.5 L32.5,32 L12.5,32 L14,29.5"/><path d="M11,14 L34,14" fill="none"/></g>`,
    n: `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M22,10 C32.5,11 38.5,18 38,39 L15,39 C15,30 25,32.5 23,18"/><path d="M24,18 C24.38,20.91 18.45,25.37 16,27 C13,29 13.18,31.34 11,31 C9.96,30.06 12.41,27.96 11,28 C10,28 11.19,29.23 10,30 C9,30 5.99,31 6,26 C6,24 12,14 12,14 C12,14 13.89,12.1 14,10.5 C13.27,9.51 13.5,8.5 13.5,7.5 C14.5,6.5 16.5,10 16.5,10 L18.5,10 C18.5,10 19.28,8.01 21,7 C22,7 22,10 22,10"/><circle cx="15" cy="15.5" r="0.9" fill="${detail}" stroke="none"/></g>`,
    b: `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M9,36 C12.39,35.03 19.11,36.43 22.5,34 C25.89,36.43 32.61,35.03 36,36 C36,36 37.65,36.54 39,38 C38.32,38.97 37.35,38.99 36,38.5 C32.61,37.53 25.89,38.96 22.5,37.5 C19.11,38.96 12.39,37.53 9,38.5 C7.65,38.99 6.68,38.97 6,38 C7.35,36.06 9,36 9,36 Z"/><path d="M15,32 C17.5,34.5 27.5,34.5 30,32 C30.5,30.5 30,30 30,30 C30,27.5 27.5,26 27.5,26 C33,24.5 33.5,14.5 22.5,10.5 C11.5,14.5 12,24.5 17.5,26 C17.5,26 15,27.5 15,30 C15,30 14.5,30.5 15,32 Z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M17.5,26 L27.5,26 M15,30 L30,30 M22.5,15.5 L22.5,20.5 M20,18 L25,18" fill="none" stroke="${detail}"/></g>`,
    q: `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"><circle cx="6" cy="12" r="2.4"/><circle cx="14" cy="9" r="2.4"/><circle cx="22.5" cy="8" r="2.4"/><circle cx="31" cy="9" r="2.4"/><circle cx="39" cy="12" r="2.4"/><path d="M9,26 C17.5,24.5 30,24.5 36,26 L38.5,13.5 L31,25 L30.7,10.9 L25.5,24.5 L22.5,10 L19.5,24.5 L14.3,10.9 L14,25 L6.5,13.5 L9,26 Z"/><path d="M9,26 C9,28 10.5,28 11.5,30 C12.5,31.5 12.5,31 12,33.5 C10.5,34.5 10.5,36 10.5,36 C9,37.5 11,38.5 11,38.5 C17.5,39.5 27.5,39.5 34,38.5 C34,38.5 35.5,37.5 34,36 C34,36 34.5,34.5 33,33.5 C32.5,31 32.5,31.5 33.5,30 C34.5,28 36,28 36,26 C27.5,24.5 17.5,24.5 9,26 Z"/><path d="M11.5,30 C15,29 30,29 33.5,30 M12,33.5 C18,32.5 27,32.5 33,33.5" fill="none" stroke="${detail}"/></g>`,
    k: `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M22.5,11.63 L22.5,6 M20,8 L25,8" fill="none" stroke="${stroke}"/><path d="M22.5,25 C22.5,25 27,17.5 25.5,14.5 C25.5,14.5 24.5,12 22.5,12 C20.5,12 19.5,14.5 19.5,14.5 C18,17.5 22.5,25 22.5,25"/><path d="M11.5,37 C17,40.5 27,40.5 32.5,37 L32.5,30 C32.5,30 41.5,25.5 38.5,19.5 C34.5,13 25,16 22.5,23.5 L22.5,27 L22.5,23.5 C19,16 9.5,13 6.5,19.5 C3.5,25.5 11.5,29.5 11.5,29.5 Z"/><path d="M11.5,30 C17,27 27,27 32.5,30 M11.5,33.5 C17,30.5 27,30.5 32.5,33.5 M11.5,37 C17,34 27,34 32.5,37" fill="none" stroke="${detail}"/></g>`,
  };

  return `<g transform="translate(${x}, ${y}) scale(${scale.toFixed(4)})">${shapes[type]}</g>`;
}

export function renderBoardSvg(pos, lastMove = null) {
  const sqSize = 40;
  const pad = 18;
  const size = pad * 2 + sqSize * 8; // 356
  const lastFromSq = lastMove ? coordToSq(lastMove.from) : -1;
  const lastToSq = lastMove ? coordToSq(lastMove.to) : -1;
  const checkKingSq = inCheck(pos, pos.turn) ? findKing(pos.board, pos.turn) : -1;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Chess board">`,
    `<rect width="${size}" height="${size}" rx="8" fill="#24292F"/>`,
  ];

  // Coordinates around frame
  for (let i = 0; i < 8; i++) {
    const fileLabel = FILES[i];
    const rankLabel = String(8 - i);
    const fx = pad + i * sqSize + sqSize / 2;
    const ry = pad + i * sqSize + sqSize / 2 + 3.5;
    parts.push(
      `<text x="${fx}" y="12.5" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="600" fill="#CBD5E1">${fileLabel}</text>`,
      `<text x="${fx}" y="${size - 5.5}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="600" fill="#CBD5E1">${fileLabel}</text>`,
      `<text x="9" y="${ry}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="600" fill="#CBD5E1">${rankLabel}</text>`,
      `<text x="${size - 9}" y="${ry}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="600" fill="#CBD5E1">${rankLabel}</text>`,
    );
  }

  // Squares and pieces
  for (let sq = 0; sq < 64; sq++) {
    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const x = pad + c * sqSize;
    const y = pad + r * sqSize;
    const isLight = (r + c) % 2 === 0;
    const baseFill = isLight ? '#E2E8F0' : '#64748B';
    parts.push(`<rect x="${x}" y="${y}" width="${sqSize}" height="${sqSize}" fill="${baseFill}"/>`);

    if (sq === lastFromSq || sq === lastToSq) {
      parts.push(`<rect x="${x}" y="${y}" width="${sqSize}" height="${sqSize}" fill="#2563EB" fill-opacity="0.35"/>`);
    }
    if (sq === checkKingSq) {
      parts.push(`<rect x="${x}" y="${y}" width="${sqSize}" height="${sqSize}" fill="#EF4444" fill-opacity="0.45"/>`);
    }

    const piece = pos.board[sq];
    if (piece) {
      parts.push(renderPieceSvg(piece, x + 1, y + 1, sqSize - 2));
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function issueLink(title, body) {
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function renderChessSection(state) {
  const pos = parseFen(state.fen);
  const legal = generateLegalMoves(pos);
  const outcome = getGameOutcome(pos, legal);
  const lastMovesText = state.history.length > 0 ? state.history.slice(-6).join(', ') : 'Game started';
  const newGameUrl = issueLink(
    'chess: new',
    'Click "Submit new issue" to reset the board and start a new game.',
  );

  const lines = [
    '<!-- CHESS:START -->',
    `<img src="assets/chess-board.svg?v=${state.version}" width="356" alt="Mini Chess Board" />`,
    '',
    `**White (You) vs Black (Bot)** · **Status:** ${outcome.status} · **Recent moves:** ${lastMovesText}`,
    '',
    `Click a move below to open a pre-filled GitHub Issue, then click **Submit new issue**. The board updates automatically in ~20 seconds. ([Start New Game](${newGameUrl}))`,
    '',
  ];

  if (!outcome.over && pos.turn === 'w') {
    const grouped = new Map();
    for (const m of legal) {
      const from = sqToCoord(m.from);
      if (!grouped.has(from)) grouped.set(from, []);
      // For pawn promotion, keep Queen default in the compact picker to avoid 4x clutter (all 4 remain valid via UCI)
      if (m.promo && m.promo !== 'q') continue;
      grouped.get(from).push(m);
    }

    lines.push('<details>');
    lines.push(`<summary><strong>Choose a move (${legal.length} legal moves for White)</strong></summary>`);
    lines.push('');
    lines.push('| From | Legal Moves |');
    lines.push('| :--- | :--- |');
    for (const [from, moves] of grouped.entries()) {
      const links = moves.map((m) => {
        const uci = uciOf(m);
        const label = formatMoveLabel(pos, m);
        const url = issueLink(
          `chess: ${uci}`,
          `Click "Submit new issue" to play ${label} (${uci}).`,
        );
        return `[${label}](${url})`;
      });
      lines.push(`| \`${from}\` | ${links.join(' · ')} |`);
    }
    lines.push('');
    lines.push('</details>');
  } else {
    lines.push(`**Game finished!** [Start a New Game](${newGameUrl}) to play again.`);
  }

  lines.push('<!-- CHESS:END -->');
  return lines.join('\n');
}

export function createInitialState() {
  return {
    fen: START_FEN,
    history: [],
    lastMove: null,
    version: 0,
  };
}

export function processCommand(state, rawCommand) {
  const cmd = rawCommand.trim().toLowerCase();
  if (cmd === 'new' || cmd === 'reset') {
    const fresh = {
      fen: START_FEN,
      history: [],
      lastMove: null,
      version: (state.version || 0) + 1,
    };
    return { ok: true, state: fresh, message: 'Started a new chess game. White to move!' };
  }

  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(cmd)) {
    return {
      ok: false,
      state,
      message: `Invalid command \`${rawCommand.trim()}\`. Use algebraic coordinates like \`e2e4\` or \`new\`.`,
    };
  }

  const pos = parseFen(state.fen);
  const legal = generateLegalMoves(pos);
  const outcomeBefore = getGameOutcome(pos, legal);
  if (outcomeBefore.over) {
    return {
      ok: false,
      state,
      message: `This game is already over (${outcomeBefore.status}). Click "Start New Game" to reset.`,
    };
  }

  const chosen = legal.find((m) => uciOf(m) === cmd);
  if (!chosen) {
    return {
      ok: false,
      state,
      message: `Move \`${cmd}\` is not legal in the current position (${outcomeBefore.status}).`,
    };
  }

  const whiteLabel = formatMoveLabel(pos, chosen);
  let nextPos = applyMove(pos, chosen);
  const history = [...state.history, `${pos.fullmove}. ${whiteLabel}`];
  let lastMove = { from: sqToCoord(chosen.from), to: sqToCoord(chosen.to) };

  const afterWhite = getGameOutcome(nextPos);
  if (afterWhite.over) {
    const nextState = {
      fen: toFen(nextPos),
      history,
      lastMove,
      version: (state.version || 0) + 1,
    };
    return {
      ok: true,
      state: nextState,
      message: `Played **${whiteLabel}** (${cmd}). ${afterWhite.status}`,
    };
  }

  const botMove = chooseBotMove(nextPos, 2);
  const botLabel = formatMoveLabel(nextPos, botMove);
  const botUci = uciOf(botMove);
  nextPos = applyMove(nextPos, botMove);
  history.push(`${pos.fullmove}... ${botLabel}`);
  lastMove = { from: sqToCoord(botMove.from), to: sqToCoord(botMove.to) };

  const afterBot = getGameOutcome(nextPos);
  const nextState = {
    fen: toFen(nextPos),
    history,
    lastMove,
    version: (state.version || 0) + 1,
  };

  return {
    ok: true,
    state: nextState,
    message: `Played **${whiteLabel}** (${cmd}). Bot replied **${botLabel}** (${botUci}). ${afterBot.status}`,
  };
}

export function updateFiles({ rootDir, command = null }) {
  const assetsDir = path.join(rootDir, 'assets');
  const statePath = path.join(assetsDir, 'chess-state.json');
  const svgPath = path.join(assetsDir, 'chess-board.svg');
  const readmePath = path.join(rootDir, 'README.md');

  fs.mkdirSync(assetsDir, { recursive: true });
  let state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : createInitialState();

  let result = { ok: true, state, message: 'Rendered current chess board.' };
  if (command !== null) {
    result = processCommand(state, command);
    if (!result.ok) {
      return result;
    }
    state = result.state;
  }

  const pos = parseFen(state.fen);
  const svg = renderBoardSvg(pos, state.lastMove);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.writeFileSync(svgPath, svg + '\n', 'utf8');

  const readme = fs.readFileSync(readmePath, 'utf8');
  const chessBlock = renderChessSection(state);
  const markerRe = /<!-- CHESS:START -->[\s\S]*?<!-- CHESS:END -->/;
  if (!markerRe.test(readme)) {
    throw new Error('Could not find <!-- CHESS:START -->...<!-- CHESS:END --> markers in README.md');
  }
  const updatedReadme = readme.replace(markerRe, chessBlock);
  fs.writeFileSync(readmePath, updatedReadme, 'utf8');

  return result;
}

// CLI entry point for GitHub Actions and local generation
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('chess.mjs')) {
  const args = process.argv.slice(2);
  const rootDir = process.cwd();
  const cmdFlag = args.find((a) => a.startsWith('--command='));
  const titleFlag = args.find((a) => a.startsWith('--title='));
  const fromEnv = args.includes('--from-env');
  let command = null;

  if (cmdFlag) {
    command = cmdFlag.slice('--command='.length);
  } else if (fromEnv || titleFlag) {
    const title = fromEnv ? process.env.ISSUE_TITLE || '' : titleFlag.slice('--title='.length);
    const match = title.match(/^chess:\s*(.+)$/i);
    if (!match) {
      console.log('ACTION_RESULT=ignored');
      console.log('ACTION_MESSAGE=Issue title does not start with "chess:".');
      process.exit(0);
    }
    command = match[1];
  }

  const res = updateFiles({ rootDir, command });
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    fs.appendFileSync(outFile, `ok=${res.ok}\n`);
    fs.appendFileSync(outFile, `message=${res.message.replace(/\r?\n/g, ' ')}\n`);
  }
  console.log(`ok=${res.ok}: ${res.message}`);
}
