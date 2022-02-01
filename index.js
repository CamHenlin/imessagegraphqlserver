const { ApolloServer, gql } = require('apollo-server')
const runningAt = require('running-at')
const blessed = require('neo-blessed')

const {
  getChats,
  sendNewMessage,
  mapFriendlyChatNamesToChats,
  getChatMessagesByArgs,
  cleanChattersInMessages,
  getChatInformationFromArgs,
  getAllMessagesInChatWithDate,
  getLoggedInUseriMessageHandle
} = require('./imessage.js')

const DEBUGGING = false

const typeDefs = gql`
  type ChatMessage {
    chatter: String
    text: String
  }

  type Chat {
    name: String
    friendlyName: String
  }

  type ChatCount {
    friendlyName: String
    count: Int
  }

  type Query {
    getChats: [Chat]
    getChatCounts: [ChatCount]
    getMessages(chatId: String, page: String): [ChatMessage]
    sendMessage(chatId: String, message: String): [ChatMessage]
  }
`;

let cacheArgs
let cacheChatMessages
let chatMessageCounts

const screen = blessed.screen({
  smartCSR: true
});

screen.title = `iMessage GraphQL Server`

const IPBox = blessed.box({
  top: '0%',
  left: '0%',
  width: '50%',
  height: '25%',
  tags: true,
  label: 'IP Address',
  border: {
    type: 'line'
  }
})

const ChatHandleBox = blessed.box({
  top: '25%',
  left: '0%',
  width: '50%',
  height: '25%',
  tags: true,
  label: 'Chat Handle',
  border: {
    type: 'line'
  }
});

const InfoBox = blessed.box({
  top: '50%',
  left: '0%',
  width: '50%',
  height: '25%',
  tags: true,
  label: 'Help',
  border: {
    type: 'line'
  },
  content: `Press {bold}escape{/bold}, {bold}q{/bold}, or {bold}Ctrl+c{/bold} to quit`
});

const StatusBox = blessed.box({
  top: '75%',
  left: '0%',
  width: '100%',
  height: '25%',
  tags: true,
  label: 'Logs',
  border: {
    type: 'line'
  },
  alwaysScroll: true,
  scrollable: true,
  scrollbar: true,
  content: `Starting, waiting for run interval to begin`
});

const StatsTitleBox = blessed.box({
  top: '0%',
  left: '50%',
  width: '50%',
  height: '75%',
  tags: true,
  label: 'Stats',
  border: {
    type: 'line'
  },
});

const IterationInfoBox = blessed.box({
  parent: StatsTitleBox,
  top: '0%',
  left: '0%',
  width: '90%',
  height: '25%',
  tags: true,
  label: `iterations`,
  border: {
    type: 'line'
  },
});

const iterationProgress = blessed.progressbar({
  parent: IterationInfoBox,
  orientation: 'horizontal',
  left: '0%',
  top: '0%',
  height: '30%',
  width: '50%',
  pch: '|',
  style: {
    bar: {
      fg: 'blue',
    },
  }
});

const MessageSendInfoBox = blessed.box({
  parent: StatsTitleBox,
  top: '25%',
  left: '0%',
  width: '90%',
  height: '25%',
  tags: true,
  label: `messages sent`,
  border: {
    type: 'line'
  },
});

const messageSendProgress = blessed.progressbar({
  parent: MessageSendInfoBox,
  orientation: 'horizontal',
  left: '0%',
  top: '0%',
  height: '30%',
  width: '50%',
  pch: '|',
  style: {
    bar: {
      fg: 'blue',
    },
  }
});

const HTTPRequestsInfoBox = blessed.box({
  parent: StatsTitleBox,
  top: '50%',
  left: '0%',
  width: '90%',
  height: '25%',
  tags: true,
  label: `http requests`,
  border: {
    type: 'line'
  },
});

const HTTPRequestsProgress = blessed.progressbar({
  parent: HTTPRequestsInfoBox,
  orientation: 'horizontal',
  left: '0%',
  top: '0%',
  height: '30%',
  width: '50%',
  pch: '|',
  style: {
    bar: {
      fg: 'blue',
    },
  }
});

screen.insert(IPBox)
screen.insert(ChatHandleBox)
screen.insert(InfoBox)
screen.insert(StatusBox)
screen.insert(StatsTitleBox)

const updateIterationProgress = () => {

  if (iterationProgress.value === 100) {

    iterationProgress.reset()
  }

  iterationProgress.progress(1)
  screen.render()
}

const updateMessageSendProgress = () => {

  if (messageSendProgress.value === 100) {

    messageSendProgress.reset()
  }

  messageSendProgress.progress(1)
  screen.render()
}

const updateHTTPRequestsProgress = () => {

  if (HTTPRequestsProgress.value === 100) {

    HTTPRequestsProgress.reset()
  }

  HTTPRequestsProgress.progress(1)
  screen.render()
}

screen.key(['escape', 'q', 'C-c'], () => {

  return process.exit(0);
});

screen.render();

const updateChatMessageCounts = async (chats) => {

  if (!chatMessageCounts) {
    
    chatMessageCounts = {}
  }

  chats = await mapFriendlyChatNamesToChats(chats)

  for (const chat of chats) {

    if (!chatMessageCounts[chat.friendlyName]) {

      chatMessageCounts[chat.friendlyName] = {
        count: 0,
        timestamp: new Date().getTime()
      }
    }

    let messages = await getAllMessagesInChatWithDate(chat.name, chatMessageCounts[chat.friendlyName].timestamp)

    if (chatMessageCounts[chat.friendlyName].count !== messages.length) {

      if (DEBUGGING) {
        
        console.log(`updated count for chat ${chat.friendlyName}: from ${chatMessageCounts[chat.friendlyName]} to ${messages.length}`)
      }

      chatMessageCounts[chat.friendlyName].count = messages.length
    }
  }

  return
}

const resolvers = {
  Query: {
    sendMessage: async (parent, args, context, info) => {

      updateHTTPRequestsProgress()

      let {selectedChatId, selectedChatFriendlyName} = await getChatInformationFromArgs(args)

      if (DEBUGGING) {

        console.log(`send to ${selectedChatId}, ${selectedChatFriendlyName}: ${args.message}`)
      }

      if (selectedChatId.startsWith(`chat`)) {

        await sendNewMessage(`iMessage;+;${selectedChatId}`, args.message)
      } else {

        await sendNewMessage(`iMessage;-;${selectedChatId}`, args.message)
      }

      let {chatMessages} = await getChatMessagesByArgs(args)
      chatMessages = await cleanChattersInMessages(chatMessages)

      //chatMessages.push({chatter: `me`, text: args.message})

      updateMessageSendProgress()

      return chatMessages
    },
    getChats: async () => {

      updateHTTPRequestsProgress()

      let chats = await getChats()

      await updateChatMessageCounts(chats)

      if (DEBUGGING) {

        console.log(`getChats: ${chats.length}`)
      }

      return chats
    },
    getChatCounts: async () => {

      updateHTTPRequestsProgress()

      const chatFriendlyNames = Object.getOwnPropertyNames(chatMessageCounts)

      const counts = chatFriendlyNames.map(friendlyName => {

        return {friendlyName: friendlyName, count: chatMessageCounts[friendlyName].count}
      })

      if (DEBUGGING) {
      
        console.log(`getChatCounts`)
        console.log(counts)
      }

      return counts
    },
    getMessages: async (parent, args, context, info) => {

      updateHTTPRequestsProgress()

      if (JSON.stringify(args) === JSON.stringify(cacheArgs)) {

        return cacheChatMessages
      }

      cacheArgs = args

      let {chatMessages} = await getChatMessagesByArgs(args)
      let {selectedChatId, selectedChatFriendlyName} = await getChatInformationFromArgs(args)

      activeChatId = selectedChatId

      chatMessageCounts[selectedChatFriendlyName].timestamp = new Date().getTime()
      chatMessageCounts[selectedChatFriendlyName].count = 0

      chatMessages = await cleanChattersInMessages(chatMessages)

      return chatMessages
    }
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(async ({ url }) => {

  if (DEBUGGING) {

    console.log(`🚀  Server ready at ${url}`);
  }

  let runningAtOutput = runningAt()

  if (DEBUGGING) {

    console.log(`runningAtOutput`)
    console.log(runningAtOutput)
  }

  IPBox.content = `Your iMessage GraphQL Server is up at:\n{bold}http:${runningAtOutput.network.split(`:`)[1]}:4000{/bold}`

  let chatHandle = await getLoggedInUseriMessageHandle()

  ChatHandleBox.content = `Currently chatting as:\n{bold}${chatHandle}{/bold}`
  StatusBox.insertLine(0, `${new Date().toLocaleString()}: Apollo GraphQL Server is listening!`)

  screen.render();
});

let cacheUpdates = 0
let clearCounter = 0

setInterval(async () => {

  if (clearCounter++ > 10000) {

    StatusBox.setContent(`data cleared`)
    clearCounter = 0
  }

  updateIterationProgress()
  
  try {

    const myCacheUpdate = Number(cacheUpdates++)

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: start of interval`)
    screen.render();

    if (!cacheArgs) {

      StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: no cached args, bail on interval`)
      screen.render();

      if (DEBUGGING) {

        console.log(`${myCacheUpdate}: no cached args, bail on interval`)
      }

      return
    }

    if (DEBUGGING) {

      console.log(`${myCacheUpdate}: updating caches...`)
    }

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: getting chat messages`)
    screen.render();

    let {chatMessages} = await getChatMessagesByArgs(cacheArgs)

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: cleaning chatters in messages`)
    screen.render();

    cacheChatMessages = await cleanChattersInMessages(chatMessages)

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: getting active chats`)
    screen.render();

    let chats = await getChats()

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: getting counts in active chats`)
    screen.render();

    await updateChatMessageCounts(chats)

    if (DEBUGGING) {

      console.log(`${myCacheUpdate}: done updating caches`)
    }

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: ${myCacheUpdate}: interval complete`)
    screen.render();
  } catch (err) {

    if (DEBUGGING) {

      console.log(err)
    }

    StatusBox.insertLine(0, `${new Date().toLocaleString()}: caught error: ${err.toString()}`)
    screen.render();
  }
}, 3000)