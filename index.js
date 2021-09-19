const { ApolloServer, gql } = require('apollo-server');
const {
  getChatFriendlyName,
  getNameByPhoneNumber,
  getChats,
  getAllMessagesInChat,
  getMaxMessageId,
  getLastMessageInChat,
  sendNewMessage
} = require('./imessage.js')

const typeDefs = gql`
  type ChatMessage {
    chatter: String
    text: String
  }

  type Chat {
    name: String
    friendlyName: String
  }

  type Name {
    name: String
  }

  type MessageInfo {
    maxMessageId: Int
  }

  type Query {
    getChatFriendlyName: Chat
    getNameByPhoneNumber(phone: String): Name
    getChats: [Chat]
    getMessages(chatId: String, page: String): [ChatMessage]
    getMaxMessageId: MessageInfo
    getLastMessageInChat(chatId: String): [ChatMessage]
    sendNewMessage: [ChatMessage]
    sendMessage(chatId: String, message: String): [ChatMessage]
  }

  type Mutation {
    sendNewMessage: Chat
  }
`;

const getChatMessagesByArgs = async (args) => {

  const messagesPerPage = 8

  console.log(`getMessages args`)
  console.log(args)
  console.log(`getting all messages for ${args.chatId}`)

  if (args.chatId.includes(`-chat`)) {

    args.chatId = args.chatId.split(`-chat`)[0]
  }
  console.log(`getting all messages for x2 ${args.chatId}`)

  let chats = await getChats()

  for (let chat of chats) {

    // console.log(`get chat friendly namne ${chat.name}`)

    let friendlyName = await getNameByPhoneNumber(chat.name)

    if (!friendlyName) {

      friendlyName = chat.name
    }
    // console.log(friendlyName)
    chat.friendlyName = friendlyName 
  }

  let selectedChatId

  for (const chat of chats) {

    let tempChatFriendlyName = chat.friendlyName
    tempChatFriendlyName = tempChatFriendlyName.replace(/\,/g, ``)
    tempChatFriendlyName = tempChatFriendlyName.replace(/[^\x00-\x7f]/g, ``)

    if (tempChatFriendlyName.includes(`-chat`)) {

      tempChatFriendlyName = tempChatFriendlyName.split(`-chat`)[0]
    }

    console.log(`check ${tempChatFriendlyName}`)

    if (tempChatFriendlyName === args.chatId) {

      console.log(`match`)

      selectedChatId = chat.name
    }
  }

  if (!selectedChatId) {

    return []
  }

  if (selectedChatId.includes(`chat`)) {

    selectedChatId = selectedChatId.split(`-chat`)[1]
    selectedChatId = `chat${selectedChatId}`
  }

  let chatMessages = await getAllMessagesInChat(selectedChatId)

  chatMessages = chatMessages.slice(Number(args.page) * messagesPerPage)
  chatMessages = chatMessages.slice(messagesPerPage * -1)

  console.log(`done getting messages:`)
  console.log(chatMessages.length)

  return {selectedChatId, chatMessages} 
}

const resolvers = {
  Query: {
    getChatFriendlyName: async (parent, args, context, info) => {

      getChatFriendlyName()
    },
    getNameByPhoneNumber: async (parent, args, context, info) => {

      console.log(`getting name by phone number for ${args.phone}`)

      return await getNameByPhoneNumber(args.phone)
    },
    sendMessage: async (parent, args, context, info) => {

      console.log(`send new message~~~~`)

      let {selectedChatId, chatMessages} = await getChatMessagesByArgs(args)

      console.log(`send to ${selectedChatId}`)
      console.log(args.message)

      sendNewMessage(selectedChatId, args.message)

      return chatMessages
    },
    getChats: async () => {

      let chats = await getChats()

      for (let chat of chats) {

        // console.log(`get chat friendly namne ${chat.name}`)

        let friendlyName = await getNameByPhoneNumber(chat.name)

        if (!friendlyName) {

          friendlyName = chat.name
        }
        // console.log(friendlyName)
        chat.friendlyName = friendlyName 
      }

      return chats
    },
    getMessages: async (parent, args, context, info) => {

      let {chatMessages} = await getChatMessagesByArgs(args)

      return chatMessages
    },
    getMaxMessageId: async () => {

      let maxMessageId = (await getMaxMessageId()).id

      console.log(`max message Id ${maxMessageId}`)
      console.log(maxMessageId)

      return {maxMessageId}
    },
    getLastMessageInChat: async (parent, args, context, info) => {
      console.log(`getting last message for ${args.chatId}`)

      return await getLastMessageInChat(args.chatId)
    },
  },
  Mutation: {
    sendNewMessage: async (parent, args, context, info) => {

      sendNewMessage()
    },
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});