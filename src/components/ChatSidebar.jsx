import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Modal, message as antMessage } from 'antd'
import {
  PlusOutlined, DeleteOutlined, MessageOutlined, ReloadOutlined,
  CheckOutlined, MenuOutlined, CloseOutlined,
} from '@ant-design/icons'
import {
  listConversations as listConversationsApi,
  conversationsBulkAction,
} from '../api/ai'

// Sidebar for AI Chat conversation history. Self-contained — pulls its
// own data, owns its own bulk-select state. Just sits next to <main>
// and tells the parent which chatId to load on click.
//
// Mobile: collapses behind a hamburger overlay (tap to open).
//
// Props:
//   refreshKey — bump from parent to force a reload (e.g. after the
//                user sent the first message in a brand-new chat so the
//                title auto-changes from "New chat" → first user line).
//   onNewChat — callback when "+ New chat" is clicked. Parent creates
//               the row + navigates; sidebar stays generic.
export default function ChatSidebar({ refreshKey = 0, onNewChat, isOpenMobile, onCloseMobile }) {
  const navigate = useNavigate()
  const { chatId: activeId } = useParams()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [internalRefresh, setInternalRefresh] = useState(0)

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

  const bulkDelete = () => {
    const ids = [...selected]
    if (!ids.length) { antMessage.warning('Pick at least one chat'); return }
    Modal.confirm({
      title: `Delete ${ids.length} chat${ids.length === 1 ? '' : 's'}?`,
      content: <p className="text-sm text-rose-300 font-medium">⚠ Removes the conversation + all messages. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel', centered: true,
      onOk: async () => {
        const { data, error: err } = await conversationsBulkAction('delete', ids)
        if (err) { antMessage.error(err); return }
        antMessage.success(`Deleted ${data?.affected ?? ids.length}`)
        setSelected(new Set())
        setSelectMode(false)
        setInternalRefresh(n => n + 1)
        // If we just deleted the currently-open chat, navigate to /ai
        if (activeId && ids.includes(activeId)) navigate('/ai')
      },
    })
  }

  const sidebarBody = (
    <>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <button onClick={onNewChat}
          className="flex-1 inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02]">
          <PlusOutlined /> New chat
        </button>
        <button onClick={() => setInternalRefresh(n => n + 1)}
          title="Refresh"
          className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-gray-800 hover:border-gray-700 bg-gray-900/60 hover:bg-gray-900 text-gray-400 hover:text-gray-200 transition-colors">
          <ReloadOutlined />
        </button>
        <button onClick={() => setSelectMode(m => !m)}
          title="Select multiple"
          className={`w-9 h-9 inline-flex items-center justify-center rounded-xl border transition-colors ${
            selectMode
              ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
              : 'border-gray-800 hover:border-gray-700 bg-gray-900/60 hover:bg-gray-900 text-gray-400 hover:text-gray-200'
          }`}>
          <CheckOutlined />
        </button>
      </div>

      {selectMode && selected.size > 0 && (
        <div className="mx-3 mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 flex items-center justify-between">
          <span className="text-[11px] text-rose-200 font-semibold">
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
              <div key={i} className="h-12 rounded-lg bg-gray-900/40 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-500 text-xs px-4 py-8 leading-relaxed">
            <MessageOutlined className="text-3xl text-gray-700 mb-2 block" />
            No chats yet — start your first one with <span className="text-cyan-300 font-semibold">+ New chat</span> above.
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map(c => {
              const active = c.chatId === activeId
              const checked = selected.has(c.chatId)
              return (
                <li key={c.chatId}>
                  <button
                    onClick={() => {
                      if (selectMode) { toggle(c.chatId); return }
                      navigate(`/ai/${encodeURIComponent(c.chatId)}`)
                      onCloseMobile?.()
                    }}
                    className={`group w-full text-left rounded-lg px-2.5 py-2 transition-all relative ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500/15 via-purple-500/10 to-transparent border border-cyan-500/30'
                        : 'hover:bg-gray-900/60 border border-transparent'
                    } ${selectMode && checked ? 'ring-2 ring-amber-400/40' : ''}`}>
                    {selectMode && (
                      <span className={`absolute top-2 right-2 w-4 h-4 rounded border flex items-center justify-center text-[9px] ${
                        checked ? 'bg-amber-400 border-amber-400 text-black' : 'border-gray-700 bg-gray-900'
                      }`}>{checked ? <CheckOutlined /> : ''}</span>
                    )}
                    <div className={`text-xs font-semibold truncate ${active ? 'text-white' : 'text-gray-200'}`}>
                      {c.title || 'Untitled'}
                    </div>
                    {c.lastSnippet && (
                      <div className="text-[10px] text-gray-500 truncate mt-0.5">
                        {c.lastRole === 'assistant' ? '🤖 ' : ''}{c.lastSnippet}
                      </div>
                    )}
                    {c.model && (
                      <div className="text-[9px] font-mono text-gray-600 truncate mt-0.5">
                        {c.model}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-gray-800 bg-gray-950/60 backdrop-blur-md min-h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)] sticky top-20">
        {sidebarBody}
      </aside>

      {/* Mobile drawer — slides in from the left when isOpenMobile is true */}
      {isOpenMobile && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onCloseMobile} />
          <aside className="fixed top-0 bottom-0 left-0 w-80 max-w-[90vw] bg-gray-950 z-50 flex flex-col lg:hidden border-r border-gray-800 pt-16">
            <button onClick={onCloseMobile}
              className="absolute top-3 right-3 w-9 h-9 inline-flex items-center justify-center rounded-full bg-gray-900 hover:bg-gray-800 text-gray-300">
              <CloseOutlined />
            </button>
            {sidebarBody}
          </aside>
        </>
      )}
    </>
  )
}
