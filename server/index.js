const http = require('http')
const path = require('path')
const express = require('express')
const socketIo = require('socket.io')
const needle = require('needle')
const config = require('dotenv').config()
const TOKEN = process.env.TWITTER_BEARER_TOKEN
const PORT = process.env.PORT || 3000

const app = express()

const server = http.createServer(app)
const io = socketIo(server)

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../', 'client', 'index.html'))
})

const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules'
const streamURL = 'https://api.twitter.com/2/tweets/search/stream?tweet.fields=text&expansions=author_id'
const rules = [{ value: '(\"is being listed\" OR \"will be listed\" OR \"is going to be listed\") -is:retweet -is:reply lang:en' }]

// Get stream rules
async function getRules() {
  const response = await needle('get', rulesURL, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  })
  console.log('rules', response.body)
  return response.body
}

// Set stream rules
async function setRules() {
  const data = {
    add: rules,
  }

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  })

  return response.body
}

// Delete stream rules
async function deleteRules(rules) {
  if (!Array.isArray(rules.data)) {
    return null
  }

  const ids = rules.data.map((rule) => rule.id)

  const data = {
    delete: {
      ids: ids,
    },
  }

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  })

  return response.body
}

function streamTweets(socket) {
  const stream = needle.get(streamURL, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  })

  stream.on('data', (data) => {
    try {
      const json = JSON.parse(data)
      /* if ((json.data.text).includes("Jim")) {
        console.log(json)
        socket.emit('tweet', json)
      } */
      console.log(json)
      socket.emit('tweet', json)
    } catch (error) { }
  })

  return stream
}

io.on('connection', async () => {
  console.log('Client connected...')
  let currentRules

  try {
    currentRules = await getRules()
    await deleteRules(currentRules)
    await setRules()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }

  let timeout = 0
  const filteredStream = streamTweets(io)
  filteredStream.on('timeout', () => {
    // Reconnect on error
    console.warn('A connection error occurred. Reconnecting…')
    setTimeout(() => {
      timeout++
      streamTweets(io)
    }, 2 ** timeout)
    streamTweets(io)
  })
})

server.listen(PORT, () => console.log(`Listening on port ${PORT}`))
