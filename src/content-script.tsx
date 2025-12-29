/// <reference types="chrome" />

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './popbar.css'

type Mode = 'search' | 'ai' | 'terminal'

type TerminalEntry = {
  command: string
  output: string
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function runTerminalCommand(input: string): TerminalEntry {
  const trimmed = input.trim()
  if (!trimmed) return { command: '', output: '' }

  const [cmd, ...rest] = trimmed.split(' ')
  const arg = rest.join(' ')

  switch (cmd) {
    case 'help':
      return {
        command: input,
        output:
          'Commands: help, time, url, title, echo <text>, clear (handled locally), js <expression> (evals in page context; be careful).',
      }
    case 'time':
      return { command: input, output: new Date().toLocaleString() }
    case 'url':
      return { command: input, output: window.location.href }
    case 'title':
      return { command: input, output: document.title }
    case 'echo':
      return { command: input, output: arg }
    case 'js': {
      try {
        // eslint-disable-next-line no-eval
        const result = eval(arg)
        return { command: input, output: String(result) }
      } catch (err) {
        return { command: input, output: `Error: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    default:
      return { command: input, output: `Unknown command: ${cmd}. Type 'help' for options.` }
  }
}

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 420
const DEFAULT_LEFT = 24

function getDefaultTop() {
  if (typeof window === 'undefined') return 100
  return Math.max(24, window.innerHeight / 2 - DEFAULT_HEIGHT / 2)
}

const FREE_MESSAGE_LIMIT = 20

function Popbar() {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [terminalHistory, setTerminalHistory] = useState<TerminalEntry[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [collapsed, setCollapsed] = useState(false)

  const [position, setPosition] = useState({ left: DEFAULT_LEFT, top: getDefaultTop() })
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  const [usageCount, setUsageCount] = useState(0)
  const [isPremium, setIsPremium] = useState(false)

  const panelRef = useRef<HTMLDivElement | null>(null)

  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'TOGGLE_POPBAR') {
        setVisible((v) => !v)
      }
    })
  }, [])

  useEffect(() => {
    chrome.storage.local.get(['usageCount', 'isPremium'], (result) => {
      const storedUsage = (result as { usageCount?: number }).usageCount
      const storedPremium = (result as { isPremium?: boolean }).isPremium
      if (typeof storedUsage === 'number') setUsageCount(storedUsage)
      if (typeof storedPremium === 'boolean') setIsPremium(storedPremium)
    })
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingRef.current && panelRef.current) {
        const panelWidth = panelRef.current.offsetWidth || width
        const panelHeight = panelRef.current.offsetHeight || height
        const margin = 16

        let newLeft = e.clientX - dragOffsetRef.current.x
        let newTop = e.clientY - dragOffsetRef.current.y

        const maxLeft = window.innerWidth - panelWidth - margin
        const maxTop = window.innerHeight - panelHeight - margin

        if (newLeft < margin) newLeft = margin
        if (newTop < margin) newTop = margin
        if (newLeft > maxLeft) newLeft = maxLeft
        if (newTop > maxTop) newTop = maxTop

        setPosition({ left: newLeft, top: newTop })
      } else if (resizingRef.current && panelRef.current) {
        const deltaX = e.clientX - resizeStartRef.current.mouseX
        const deltaY = e.clientY - resizeStartRef.current.mouseY

        const minWidth = 320
        const maxWidth = Math.min(window.innerWidth - 64, 900)
        let newWidth = resizeStartRef.current.width + deltaX
        if (newWidth < minWidth) newWidth = minWidth
        if (newWidth > maxWidth) newWidth = maxWidth

        const minHeight = 260
        const maxHeight = Math.min(window.innerHeight - 64, 900)
        let newHeight = resizeStartRef.current.height + deltaY
        if (newHeight < minHeight) newHeight = minHeight
        if (newHeight > maxHeight) newHeight = maxHeight

        setWidth(newWidth)
        setHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      draggingRef.current = false
      resizingRef.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [width, height])

  useEffect(() => {
    chrome.storage.local.set({ usageCount, isPremium })
  }, [usageCount, isPremium])

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target && (target.closest('.popbar-traffic-lights') || target.closest('.popbar-modes'))) {
      return
    }

    if (!panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    draggingRef.current = true
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    e.preventDefault()
  }

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    resizingRef.current = true
    resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, width, height }
    e.stopPropagation()
    e.preventDefault()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    if (mode === 'terminal') {
      if (query.trim() === 'clear') {
        setTerminalHistory([])
      } else {
        const entry = runTerminalCommand(query)
        if (entry.command) {
          setTerminalHistory((prev) => [...prev, entry])
        }
      }
      setQuery('')
      return
    }

    if (mode === 'search') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      window.open(url, '_blank')
      setQuery('')
      return
    }

    if (mode === 'ai') {
      if (!isPremium && usageCount >= FREE_MESSAGE_LIMIT) {
        setAiError('Free limit reached. Upgrade to Premium for higher usage.')
        return
      }

      const userMessage: ChatMessage = { role: 'user', content: query }
      const nextConversation = [...messages, userMessage]
      setMessages(nextConversation)
      setQuery('')

      setAiLoading(true)
      setAiError(null)
      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'AI_CHAT',
          conversation: nextConversation,
        })) as { success: boolean; message?: ChatMessage; error?: string }

        if (!response?.success || !response.message) {
          throw new Error(response?.error || 'Unknown AI error')
        }

        setMessages((prev) => [...prev, response.message!])
        setUsageCount((count) => count + 1)
      } catch (err) {
        setAiError(err instanceof Error ? err.message : String(err))
      } finally {
        setAiLoading(false)
      }
    }
  }

  if (!visible) return null

  const handleClose = () => setVisible(false)
  const handleMinimize = () => setCollapsed((c) => !c)
  const handleReset = () => {
    setCollapsed(false)
    setPosition({ left: DEFAULT_LEFT, top: getDefaultTop() })
    setWidth(DEFAULT_WIDTH)
    setHeight(DEFAULT_HEIGHT)
  }

  const handleUpgradeClick = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Failed to start checkout')
      }
      const data = (await response.json()) as { url?: string }
      if (data.url) {
        window.open(data.url, '_blank')
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="popbar-overlay">
      <div
        className={`popbar-panel${collapsed ? ' collapsed' : ''}`}
        ref={panelRef}
        style={{ left: position.left, top: position.top, width, height }}
      >
        <div className="popbar-header" onMouseDown={handleHeaderMouseDown}>
          <div className="popbar-traffic-lights">
            <span className="red" role="button" tabIndex={0} onClick={handleClose} />
            <span className="yellow" role="button" tabIndex={0} onClick={handleMinimize} />
            <span className="green" role="button" tabIndex={0} onClick={handleReset} />
          </div>
          <div className="popbar-modes">
            <button
              className={mode === 'search' ? 'active' : ''}
              onClick={() => {
                setMode('search')
                setAiError(null)
              }}
            >
              Search
            </button>
            <button
              className={mode === 'ai' ? 'active' : ''}
              onClick={() => {
                setMode('ai')
                setAiError(null)
              }}
            >
              AI
            </button>
            <button
              className={mode === 'terminal' ? 'active' : ''}
              onClick={() => {
                setMode('terminal')
                setAiError(null)
              }}
            >
              Terminal
            </button>
          </div>
        </div>

        <div className="popbar-body">
          {mode === 'ai' && (
            <div className="popbar-chat">
              <div className="popbar-chat-header">
                <div className="popbar-chat-title">Popbar AI</div>
                <div className="popbar-chat-usage">
                  {isPremium ? 'Premium' : 'Free'} · {usageCount}/{FREE_MESSAGE_LIMIT}{' '}
                  {!isPremium && '(approx.)'}
                </div>
              </div>
              <div className="popbar-chat-messages">
                {messages.length === 0 && !aiLoading && !aiError && (
                  <div className="popbar-chat-empty">Ask a question to start a conversation.</div>
                )}
                {messages.map((m, idx) => (
                  <div key={idx} className={`popbar-chat-message ${m.role}`}>
                    <div className="role">{m.role === 'user' ? 'You' : 'Popbar'}</div>
                    <div className="bubble">{m.content}</div>
                  </div>
                ))}
                {aiLoading && <div className="popbar-status">Thinking...</div>}
                {aiError && <div className="popbar-error">{aiError}</div>}
              </div>
              <div className="popbar-chat-footer">
                {!isPremium && (
                  <button type="button" className="popbar-upgrade" onClick={handleUpgradeClick}>
                    Upgrade with Stripe
                  </button>
                )}
                <button
                  type="button"
                  className="popbar-mark-premium"
                  onClick={() => setIsPremium((p) => !p)}
                >
                  Toggle premium (dev)
                </button>
              </div>
            </div>
          )}

          {mode === 'terminal' && (
            <div className="popbar-terminal">
              {terminalHistory.length === 0 ? (
                <div className="popbar-terminal-empty">Type "help" to see available commands.</div>
              ) : (
                terminalHistory.map((entry, idx) => (
                  <div key={idx} className="popbar-terminal-entry">
                    <div className="cmd">$ {entry.command}</div>
                    <div className="out">{entry.output}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <form className="popbar-input-row" onSubmit={handleSubmit}>
          <input
            autoFocus
            className="popbar-input"
            placeholder={
              mode === 'search'
                ? 'Search the web...'
                : mode === 'ai'
                  ? 'Ask Popbar anything...'
                  : 'Enter terminal command (type "help" for commands)...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <div className="popbar-resize-handle" onMouseDown={handleResizeMouseDown} />
      </div>
    </div>
  )
}

function mount() {
  const existing = document.getElementById('popbar-root')
  if (existing) return

  const container = document.createElement('div')
  container.id = 'popbar-root'
  document.documentElement.appendChild(container)

  const root = createRoot(container)
  root.render(<Popbar />)
}

mount()

