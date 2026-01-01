
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config()

const app = express()
const port = process.env.PORT || 4000

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

app.use(cors())
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  try {
    const { conversation } = req.body

    if (!Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Invalid conversation' })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversation,
    })

    const message = completion.choices[0].message

    res.json({
      message: {
        role: 'assistant',
        content: message.content ?? '',
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'AI chat failed' })
  }
})

app.listen(port, () => {
  console.log(`AI API running on http://localhost:${port}`)
})
