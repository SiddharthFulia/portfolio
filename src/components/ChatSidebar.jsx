import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Modal, Input, Select, Dropdown, Tooltip } from 'antd'
import notify from '../utils/notify'
import {
  PlusOutlined, DeleteOutlined, MessageOutlined, ReloadOutlined,
  CheckOutlined, MenuOutlined, CloseOutlined, MoreOutlined,
  EditOutlined, SearchOutlined, SortAscendingOutlined, FilterOutlined,
  PushpinOutlined, PushpinFilled,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons'

// Persist the desktop collapse state across reloads — feels more like an
// actual app preference than a lost-on-refresh toggle.
const COLLAPSE_KEY = 'sid:chat:sidebarCollapsed'
import {
  listConversations as listConversationsApi,
  conversationsBulkAction, updateConversation, deleteConversation,
} from '../api/ai'

// Sidebar for AI Chat conversation history. Self-contained — pulls its
// own data, owns its own bulk-select state, search, sort, filter, and
// per-chat rename + delete.
//
// Props:
//   refreshKey      — bump from parent to force a reload (e.g. after the
//                     user sent the first message in a brand-new chat).
//   onNewChat       — callback when "+ New chat" is clicked.
//   isOpenMobile    — mobile drawer open state.
//   onCloseMobile   — close mobile drawer.

// Provider chip labels — kept tight so the filter dropdown stays narrow.
const PROVIDER_FILTERS = [
  { value: 'all',           label: 'All chats',     emoji: '💬' },
  { value: '5090',          label: 'Studio Pro',    emoji: '⚡' },
  { value: 'cloud-groq',    label: 'Groq',          emoji: '☁' },
  { value: 'cloud-gemini',  label: 'Gemini',        emoji: '✨' },
  { value: 'oracle-ollama', label: 'Standby',       emoji: '🛟' },
]

// Sort modes. Each row has a `cmp(a, b)` that returns -1 / 0 / 1.
const SORTS = [
  { value: 'recent',   label: 'Most recent',     cmp: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') },
  { value: 'oldest',   label: 'Oldest first',    cmp: (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '') },
  { value: 'biggest',  label: 'Biggest first',   cmp: (a, b) => (b.totalChars || 0) - (a.totalChars || 0) },
  { value: 'smallest', label: 'Smallest first',  cmp: (a, b) => (a.totalChars || 0) - (b.totalChars || 0) },
  { value: 'longest',  label: 'Longest read',    cmp: (a, b) => (b.totalChars || 0) - (a.totalChars || 0) },
  { value: 'quickest', label: 'Quickest read',   cmp: (a, b) => (a.totalChars || 0) - (b.totalChars || 0) },
  { value: 'mostMsgs', label: 'Most messages',   cmp: (a, b) => (b.messageCount || 0) - (a.messageCount || 0) },
]

// ~250 wpm avg adult reading; 5 chars/word → ~21 chars/sec.
const readTimeStr = (chars = 0) => {
  if (!chars) return '—'
  const secs = chars / 21
  if (secs < 60) return `${Math.max(1, Math.round(secs))}s read`
  const m = secs / 60
  if (m < 60) return `${m.toFixed(m < 10 ? 1 : 0)}m read`
  return `${(m / 60).toFixed(1)}h read`
}

const sizeStr = (chars = 0) => {
  if (chars < 1000) return `${chars} ch`
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)} K`
  return `${(chars / 1_000_000).toFixed(1)} M`
}

export default function ChatSidebar({ refreshKey = 0, onNewChat, isOpenMobile, onCloseMobile }) {
  const navigate = useNavigate()
  const { chatId: activeId } = useParams()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [internalRefresh, setInternalRefresh] = useState(0)

  // Desktop collapse — persisted so the preference sticks across reloads.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  // New: search + sort + provider filter
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [providerFilter, setProviderFilter] = useState('all')

  // Inline rename state — when set, that row swaps title for an input
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listConversationsApi({ archived: 0, page: 1, limit: 200 }).then(({ data }) => {
      if (cancelled) return
      setItems(data?.items || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [refreshKey, internalRefresh])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Apply search → provider filter → sort
  const visible = useMemo(() => {
    let arr = items
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      arr = arr.filter(c =>
        (c.title || '').toLowerCase().includes(needle) ||
        (c.lastSnippet || '').toLowerCase().includes(needle) ||
        (c.model || '').toLowerCase().includes(needle)
      )
    }
    if (providerFilter !== 'all') {
      arr = arr.filter(c => c.provider === providerFilter)
    }
    const cmp = SORTS.find(s => s.value === sortBy)?.cmp || SORTS[0].cmp
    // Pinned rows always float to the top regardless of sort mode
    return [...arr].sort((a, b) => {
      if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0)
      return cmp(a, b)
    })
  }, [items, q, sortBy, providerFilter])

  // ── Per-chat actions ──────────────────────────────────────
  const startRename = (c) => {
    setEditingId(c.chatId)
    setEditingTitle(c.title || '')
  }
  const commitRename = async (chatId) => {
    const title = editingTitle.trim().slice(0, 200)
    setEditingId(null)
    setEditingTitle('')
    if (!title) return
    const cur = items.find(x => x.chatId === chatId)
    if (cur && cur.title === title) return  // no-op
    const { error: err } = await updateConversation(chatId, { title })
    if (err) { notify.error(err); return }
    setItems(prev => prev.map(x => x.chatId === chatId ? { ...x, title } : x))
  }
  const togglePin = async (c) => {
    const next = c.pinned ? 0 : 1
    setItems(prev => prev.map(x => x.chatId === c.chatId ? { ...x, pinned: next } : x))
    const { error: err } = await updateConversation(c.chatId, { pinned: next })
    if (err) {
      notify.error(err)
      setItems(prev => prev.map(x => x.chatId === c.chatId ? { ...x, pinned: c.pinned } : x))
    }
  }
  const deleteOne = (c) => {
    Modal.confirm({
      title: `Delete "${(c.title || 'this chat').slice(0, 40)}"?`,
      content: <p className="text-sm text-rose-300 font-medium">⚠ Removes this conversation + all messages. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel', centered: true,
      onOk: async () => {
        const { error: err } = await deleteConversation(c.chatId)
        if (err) { notify.error(err); return }
        notify.success(`"${(c.title || 'chat').slice(0, 32)}" removed`, { title: 'Chat deleted' })
        setItems(prev => prev.filter(x => x.chatId !== c.chatId))
        if (activeId === c.chatId) navigate('/ai')
      },
    })
  }

  const bulkDelete = () => {
    const ids = [...selected]
    if (!ids.length) { notify.info('Pick at least one chat'); return }
    Modal.confirm({
      title: `Delete ${ids.length} chat${ids.length === 1 ? '' : 's'}?`,
      content: <p className="text-sm text-rose-300 font-medium">⚠ Removes the conversation + all messages. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel', centered: true,
      onOk: async () => {
        const { data, error: err } = await conversationsBulkAction('delete', ids)
        if (err) { notify.error(err); return }
        notify.success(`Removed ${data?.affected ?? ids.length} conversations + all their messages`, { title: 'Bulk delete done' })
        setSelected(new Set())
        setSelectMode(false)
        setInternalRefresh(n => n + 1)
        if (activeId && ids.includes(activeId)) navigate('/ai')
      },
    })
  }

  const providerEmoji = (p) => PROVIDER_FILTERS.find(x => x.value === p)?.emoji || '·'

  const sidebarBody = (
    <>
      {/* Top row — New chat / refresh / multi-select */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <button onClick={onNewChat}
          className="luxe-btn luxe-btn-primary flex-1">
          <PlusOutlined /> New chat
        </button>
        <button onClick={() => setInternalRefresh(n => n + 1)}
          title="Refresh"
          className="luxe-btn luxe-btn-ghost !w-9 !h-9 !p-0">
          <ReloadOutlined />
        </button>
        <button onClick={() => setSelectMode(m => !m)}
          title="Select multiple"
          className={`luxe-btn luxe-btn-ghost !w-9 !h-9 !p-0 ${
            selectMode ? '!text-amber-200' : ''
          }`}>
          <CheckOutlined />
        </button>
      </div>

      {/* Search + sort + filter row */}
      <div className="px-3 pb-2 space-y-1.5">
        <Input
          allowClear
          size="small"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search chats…"
          prefix={<SearchOutlined className="text-gray-500" />}
          className="luxe-input"
        />
        <div className="flex items-center gap-1.5">
          <Select
            size="small"
            value={sortBy}
            onChange={setSortBy}
            popupMatchSelectWidth={160}
            className="flex-1"
            suffixIcon={<SortAscendingOutlined className="text-gray-500" />}
            options={SORTS.map(s => ({
              value: s.value,
              label: <span className="text-xs">{s.label}</span>,
            }))}
          />
          <Select
            size="small"
            value={providerFilter}
            onChange={setProviderFilter}
            popupMatchSelectWidth={140}
            className="flex-1"
            suffixIcon={<FilterOutlined className="text-gray-500" />}
            options={PROVIDER_FILTERS.map(p => ({
              value: p.value,
              label: <span className="text-xs">{p.emoji} {p.label}</span>,
            }))}
          />
        </div>
      </div>

      {/* Bulk-delete strip */}
      {selectMode && selected.size > 0 && (
        <div className="mx-3 mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 flex items-center justify-between">
          <span className="luxe-eyebrow !text-rose-200">
            {selected.size} selected
          </span>
          <button onClick={bulkDelete}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40">
            <DeleteOutlined /> Delete
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1.5 px-1">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-14 rounded-lg bg-gray-900/40 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-500 text-xs px-4 py-8 leading-relaxed">
            <MessageOutlined className="text-3xl text-gray-700 mb-2 block" />
            No chats yet — start your first one with <span className="text-cyan-300 font-semibold">+ New chat</span> above.
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-gray-500 text-xs px-4 py-6">
            No chats match — try clearing search or filter.
          </div>
        ) : (
          <ul className="space-y-1">
            {visible.map(c => {
              const active = c.chatId === activeId
              const checked = selected.has(c.chatId)
              const isEditing = editingId === c.chatId

              const menuItems = [
                { key: 'rename', icon: <EditOutlined />, label: 'Rename', onClick: () => startRename(c) },
                { key: 'pin',    icon: c.pinned ? <PushpinFilled /> : <PushpinOutlined />,
                  label: c.pinned ? 'Unpin' : 'Pin to top', onClick: () => togglePin(c) },
                { type: 'divider' },
                { key: 'delete', icon: <DeleteOutlined />, label: 'Delete chat',
                  danger: true, onClick: () => deleteOne(c) },
              ]

              return (
                <li key={c.chatId}>
                  <div
                    onClick={() => {
                      if (selectMode) { toggle(c.chatId); return }
                      if (isEditing) return
                      navigate(`/ai/${encodeURIComponent(c.chatId)}`)
                      onCloseMobile?.()
                    }}
                    className={`group w-full text-left rounded-lg pl-2.5 pr-1 py-2 transition-all relative cursor-pointer ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500/15 via-purple-500/10 to-transparent border border-cyan-500/30 shadow-md shadow-cyan-500/5'
                        : 'hover:bg-gray-900/60 border border-transparent hover:border-gray-800'
                    } ${selectMode && checked ? 'ring-2 ring-amber-400/40' : ''}`}>
                    {selectMode && (
                      <span className={`absolute top-2 right-2 w-4 h-4 rounded border flex items-center justify-center text-[9px] ${
                        checked ? 'bg-amber-400 border-amber-400 text-black' : 'border-gray-700 bg-gray-900'
                      }`}>{checked ? <CheckOutlined /> : ''}</span>
                    )}
                    <div className="flex items-start gap-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {c.pinned ? (
                            <PushpinFilled className="text-amber-400 text-[10px] shrink-0" />
                          ) : null}
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitRename(c.chatId) }
                                if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                              }}
                              onBlur={() => commitRename(c.chatId)}
                              className="flex-1 bg-gray-950 border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs text-white outline-none min-w-0"
                            />
                          ) : (
                            <div className={`text-xs font-semibold truncate ${active ? 'text-white' : 'text-gray-200'}`}>
                              {c.title || 'Untitled'}
                            </div>
                          )}
                        </div>
                        {c.lastSnippet && !isEditing && (
                          <div className="text-[10px] text-gray-500 truncate mt-0.5">
                            {c.lastRole === 'assistant' ? '🤖 ' : ''}{c.lastSnippet}
                          </div>
                        )}
                        {!isEditing && (
                          <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-gray-600">
                            <span className="opacity-80">{providerEmoji(c.provider)}</span>
                            {c.model && <span className="truncate max-w-[100px]">{c.model}</span>}
                            <span>·</span>
                            <span>{c.messageCount || 0} msgs</span>
                            {c.totalChars > 1500 && (
                              <>
                                <span>·</span>
                                <span>{readTimeStr(c.totalChars)}</span>
                              </>
                            )}
                            {c.compactedCount > 0 && (
                              <span className="text-fuchsia-400/80" title={`${c.compactedCount} earlier messages compacted`}>
                                · 🗜
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {!selectMode && !isEditing && (
                        <Dropdown
                          menu={{ items: menuItems }}
                          trigger={['click']}
                          placement="bottomRight"
                          getPopupContainer={() => document.body}>
                          <button
                            onClick={e => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-200 shrink-0">
                            <MoreOutlined />
                          </button>
                        </Dropdown>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )

  // Collapsed rail — icon-only view for users who want max chat space on
  // desktop. Shows + New chat, expand toggle, and the active chat icon
  // list (capped at ~12 to avoid a 30-tall column).
  const collapsedRail = (
    <div className="flex flex-col items-center py-3 gap-2 h-full">
      <Tooltip title="Expand sidebar" placement="right">
        <button onClick={() => setCollapsed(false)}
          className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-gray-800 hover:border-gray-700 bg-gray-900/60 hover:bg-gray-900 text-gray-400 hover:text-gray-200 transition-colors">
          <MenuUnfoldOutlined />
        </button>
      </Tooltip>
      <Tooltip title="New chat" placement="right">
        <button onClick={onNewChat}
          className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-white bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 shadow-md shadow-purple-500/20">
          <PlusOutlined />
        </button>
      </Tooltip>
      <div className="w-full border-t border-gray-800 my-1" />
      <div className="flex-1 overflow-y-auto w-full px-1.5 space-y-1.5">
        {items.slice(0, 14).map(c => {
          const active = c.chatId === activeId
          return (
            <Tooltip key={c.chatId} title={c.title || 'Untitled'} placement="right">
              <button
                onClick={() => navigate(`/ai/${encodeURIComponent(c.chatId)}`)}
                className={`w-9 h-9 mx-auto flex items-center justify-center rounded-lg border text-[11px] font-bold ${
                  active
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200 shadow-md shadow-cyan-500/10'
                    : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 text-gray-400 hover:text-gray-200'
                }`}>
                {c.pinned ? '★' : (c.title || 'U').trim().charAt(0).toUpperCase()}
              </button>
            </Tooltip>
          )
        })}
        {items.length > 14 && (
          <div className="text-center text-[9px] text-gray-600 pt-1">+ {items.length - 14}</div>
        )}
      </div>
    </div>
  )

  // Header row inside the expanded sidebar — adds a collapse button so
  // desktop users can flip to the icon rail.
  const expandedWithCollapse = (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1 lg:flex hidden">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Chats</span>
        <Tooltip title="Collapse sidebar" placement="left">
          <button onClick={() => setCollapsed(true)}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-900">
            <MenuFoldOutlined />
          </button>
        </Tooltip>
      </div>
      {sidebarBody}
    </>
  )

  return (
    <>
      {/* Desktop sidebar — width animates between rail (3.5rem) and full (18rem) */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-gray-800 bg-gray-950/60 backdrop-blur-md min-h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)] sticky top-20 transition-[width] duration-200 ease-out ${
          collapsed ? 'w-14' : 'w-72'
        }`}>
        {collapsed ? collapsedRail : expandedWithCollapse}
      </aside>

      {/* Mobile drawer — slides in from the left when isOpenMobile is true.
          Uses a CSS transform so the slide-in is smooth on phone. */}
      <div className={`lg:hidden fixed inset-0 z-40 bg-black/60 transition-opacity ${isOpenMobile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onCloseMobile} />
      <aside
        className={`lg:hidden fixed top-0 bottom-0 left-0 w-80 max-w-[88vw] bg-gray-950 z-50 flex flex-col border-r border-gray-800 pt-16 transition-transform duration-200 ease-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <button onClick={onCloseMobile}
          className="absolute top-3 right-3 w-9 h-9 inline-flex items-center justify-center rounded-full bg-gray-900 hover:bg-gray-800 text-gray-300">
          <CloseOutlined />
        </button>
        {sidebarBody}
      </aside>
    </>
  )
}
