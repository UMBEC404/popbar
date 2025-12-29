/// <reference types="chrome" />

const API_BASE = 'http://localhost:4000'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

async function runAiChat(conversation: ChatMessage[]): Promise<ChatMessage> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversation }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error (${response.status}): ${text}`)
  }

  const data = (await response.json()) as { message: ChatMessage }
  if (!data.message?.content) {
    throw new Error('No response from API')
  }
  return data.message
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle_popbar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) return
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_POPBAR' })
    })
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'AI_CHAT') {
    const conversation = (message.conversation ?? []) as ChatMessage[]
    runAiChat(conversation)
      .then((reply) => sendResponse({ success: true, message: reply }))
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error)
        sendResponse({ success: false, error: msg })
      })
    return true // keep the message channel open for async response
  }
})

