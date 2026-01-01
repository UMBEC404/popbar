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
  console.log('[Popbar] Command received:', command)
  if (command === 'toggle_popbar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        console.warn('[Popbar] No active tab to send TOGGLE_POPBAR')
        return
      }

      // Use callback form so Chrome doesn't create a Promise that can reject with
      // "Could not establish connection. Receiving end does not exist" when
      // the content script is not yet injected in the page.
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_POPBAR' }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Popbar] Failed to send TOGGLE_POPBAR:', chrome.runtime.lastError.message)
        } else {
          console.log('[Popbar] TOGGLE_POPBAR sent to tab', tab.id)
        }
      })
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

