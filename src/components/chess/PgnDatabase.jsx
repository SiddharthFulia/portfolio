// PGN file loader. Accepts .pgn / .txt files containing one OR many
// games — common case for tournament dumps (Lichess study export, the
// MacKenzie collection, ChessBase databases, etc).
//
// Workflow:
//   1. User picks a file via <input type="file"> OR pastes into textarea
//   2. We split the blob into individual games by `[Event ...]` header
//   3. If exactly 1 game → fire onLoad(pgn) immediately
//   4. If 2+ games → show a list modal with metadata so user picks one

import { useState } from 'react'
import { Modal, Input, message } from 'antd'
import { chessBulkSaveGames } from '../../api/ai'

// Split a PGN blob into individual games. Standard PGN: each game starts
// with `[Event "..."]` tag (sometimes with leading whitespace), followed
// by other [Tag "..."] lines, blank line, move text, result, blank line.
// We slice on the [Event boundary; first chunk before the first [Event
// is discarded (usually empty / comment block).
export function splitPgn(text) {
  if (!text || typeof text !== 'string') return []
  const parts = text.split(/(?=^\[Event\b)/m)
  return parts
    .map(p => p.trim())
    .filter(p => p.startsWith('[Event'))
}

// Extract the standard 7 tags + result from a single PGN game block.
// Returns a metadata object the picker uses for display.
export function readTags(pgn) {
  const tags = {}
  const re = /^\[(\w+)\s+"([^"]*)"\]/gm
  let m
  while ((m = re.exec(pgn))) tags[m[1]] = m[2]
  return {
    event: tags.Event || '',
    site:  tags.Site || '',
    date:  tags.Date || '',
    round: tags.Round || '',
    white: tags.White || '?',
    black: tags.Black || '?',
    result: tags.Result || '*',
    eco:   tags.ECO || '',
    whiteElo: tags.WhiteElo || '',
    blackElo: tags.BlackElo || '',
  }
}

const RESULT_TONE = {
  '1-0':    'text-amber-200 bg-amber-500/15 border-amber-500/40',
  '0-1':    'text-cyan-200 bg-cyan-500/15 border-cyan-500/40',
  '1/2-1/2':'text-gray-300 bg-gray-700/40 border-gray-600',
  '*':      'text-violet-300 bg-violet-500/15 border-violet-500/40',
}

export default function PgnDatabaseLoader({ onLoad, onSavedCollection }) {
  // Pending multi-game blob — opens the picker when set.
  const [games, setGames] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  // Bulk-save modal state — separate from the per-game picker.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkName, setBulkName] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const handleFile = async (file) => {
    if (!file) return
    setError('')
    let text
    try { text = await file.text() }
    catch (e) { setError(`Couldn't read file: ${e.message}`); return }
    const parts = splitPgn(text)
    if (parts.length === 0) {
      setError('No games found in file (no [Event …] headers)')
      return
    }
    if (parts.length === 1) {
      onLoad(parts[0])
      return
    }
    setGames(parts)
    setOpen(true)
  }

  const pick = (idx) => {
    onLoad(games[idx])
    setOpen(false)
  }

  // Open the bulk-save modal. Default the collection name from the first
  // game's Event tag if present — saves the user a typing pass.
  const openBulkSave = () => {
    const first = games[0] ? readTags(games[0]) : {}
    const suggested = (first.event || '').trim().slice(0, 80)
    setBulkName(suggested)
    setBulkOpen(true)
  }

  // Build a row per game and POST them all in a single transaction via
  // the bulk endpoint. The "name" is derived from PGN tags so the row
  // is recognisable in the saved-games list ("White vs Black · Event · Date").
  const commitBulkSave = async () => {
    const collection = (bulkName || '').trim()
    if (!collection) { message.warning('Pick a collection name'); return }
    setBulkSaving(true)
    try {
      const rows = games.map(pgn => {
        const t = readTags(pgn)
        const namePieces = [
          `${t.white || '?'} vs ${t.black || '?'}`,
          t.event,
          t.date,
        ].filter(Boolean)
        const name = namePieces.join(' · ').slice(0, 80)
        return {
          name,
          pgn,
          // Final FEN isn't trivially derivable from raw PGN without chess.js;
          // BE accepts any string and we leave the starting FEN. Loading from
          // the saved games panel re-parses the PGN to find the real position.
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          mode: 'analyze',
          result: t.result || '*',
        }
      })
      const { data, error: err } = await chessBulkSaveGames(rows, collection)
      if (err) {
        message.error(`Save failed: ${err}`)
      } else {
        message.success(`Saved ${data?.saved ?? rows.length} games to "${collection}"`)
        setBulkOpen(false)
        setOpen(false)
        onSavedCollection?.(collection)
      }
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <>
      <div className="luxe-card p-3 space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block">Upload PGN file</label>
        <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-700 hover:border-amber-400/60 hover:bg-amber-500/5 transition-colors cursor-pointer text-xs text-gray-400 hover:text-amber-200">
          <span className="text-base">📁</span>
          <span>Drop or pick a <span className="font-mono">.pgn</span> file</span>
          <input type="file" accept=".pgn,.txt,text/plain,application/x-chess-pgn"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
        {error && (
          <p className="text-[10px] text-rose-400 font-mono">{error}</p>
        )}
        <p className="text-[10px] text-gray-600 leading-snug">
          Single-game and multi-game PGN files supported. Multi-game files
          open a picker so you can choose which game to load.
        </p>
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={`Pick a game — ${games.length} found`}
        width={640}
      >
        {games.length > 1 && (
          <div className="mb-3 flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
            <span className="text-xs text-emerald-200/90">
              💾 Save all {games.length} games into a single collection?
            </span>
            <button
              onClick={openBulkSave}
              className="text-[11px] font-semibold px-2.5 py-1 rounded border border-emerald-400/60 hover:border-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 transition-colors">
              Save all to collection
            </button>
          </div>
        )}
        <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {games.map((pgn, i) => {
            const t = readTags(pgn)
            return (
              <li key={i}>
                <button
                  onClick={() => pick(i)}
                  className="w-full text-left rounded-lg border border-gray-800 hover:border-amber-400/60 bg-gray-900/40 hover:bg-gray-900/80 p-2.5 transition-colors group">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-100 truncate">
                      {t.white}{t.whiteElo && <span className="text-amber-400/80 ml-1">({t.whiteElo})</span>}
                      <span className="text-gray-500 mx-1.5">vs</span>
                      {t.black}{t.blackElo && <span className="text-cyan-400/80 ml-1">({t.blackElo})</span>}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${RESULT_TONE[t.result] || RESULT_TONE['*']}`}>
                      {t.result === '1/2-1/2' ? '½-½' : t.result}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono truncate">
                    {[t.event, t.site, t.date, t.eco].filter(Boolean).join(' · ')}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      </Modal>

      <Modal
        open={bulkOpen}
        onCancel={() => !bulkSaving && setBulkOpen(false)}
        onOk={commitBulkSave}
        okText={bulkSaving ? 'Saving…' : `Save ${games.length} games`}
        confirmLoading={bulkSaving}
        cancelButtonProps={{ disabled: bulkSaving }}
        title="📁 Save all games to collection"
        width={460}
        centered
      >
        <p className="text-xs text-gray-400 mb-2">
          Pick a collection name. All {games.length} games from this PGN will
          be filed under it in your saved-games library.
        </p>
        <Input
          autoFocus
          value={bulkName}
          maxLength={80}
          placeholder="e.g. MacKenzie, Tata Steel 2024, My Lichess study"
          onChange={(e) => setBulkName(e.target.value)}
          onPressEnter={commitBulkSave}
          disabled={bulkSaving}
        />
      </Modal>
    </>
  )
}
