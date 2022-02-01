const sqlite3 = require('sqlite3').verbose();
const file = process.env.HOME + '/Library/Messages/chat.db';
const osa = require('osa2')
const glob = require('glob');
const emojiShortName = require('emoji-short-name');
const { parse } = require('@devsnowflake/text-emoji-parser');

const db = new sqlite3.Database(file);

const MAX_CHATS = 10

const getLoggedInUseriMessageHandle = () => {

	return new Promise((resolve, reject) => {

		db.serialize(function() {

			let SQL = `SELECT DISTINCT account_login FROM chat WHERE service_name = 'iMessage'`

			db.all(SQL, function(err, rows) {

				if (err) {

					return reject(err);
				}

				if (!rows) {

					return resolve(`no chat handle! [1]`)
				}

				if (!rows[0].account_login) {

					return resolve(`no chat handle! [2]`)
				}

				return resolve(rows[0].account_login.split(`E:`)[1])
			});
		});
	})
}

const getChatFriendlyName = (inputChatUglyName) => {

	let chatUglyName = inputChatUglyName

	if (chatUglyName.includes(`-`)) {

		chatUglyName = chatUglyName.split(`-`)[1]
	}

	return new Promise((resolve, reject) => {

		db.serialize(function() {

			let SQL = `
				SELECT DISTINCT
					message.date,
					handle.id,
					chat.chat_identifier,
					chat.display_name
				FROM
					message
				LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames
				LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id
				WHERE
					message.is_from_me = 0 AND
					message.service = 'iMessage'
				ORDER BY message.date DESC
				`

			db.all(SQL, function(err, rows) {

				if (err) {

					return reject(err);
				}

				for (const row of rows) {

					if (row.chat_identifier === chatUglyName) {

						return resolve(row.display_name);
					}
				}

				return resolve(false)
			});
		});
	})
}

let rowCache = {}

const getNameByPhoneNumber = (phone) => {

	if (rowCache[phone]) {

		return rowCache[phone]
	}

	return new Promise((resolve, reject) => {

		phone = phone.replace(/\(/g,'').replace(/\)/g,'').replace(/\-/g,'').replace(/\ /g,'').replace(/\+/g,'');
		// need to make a like statement so we can get the following phone, which is now in the format
		// 11231231234 into 1%123%123%1234
		// NOTE: this will probably not work for other countries since I assume they store their address differently?
		// fall back to phone number for that case for now
		// 1%
		phone = phone.substr(0, 1) + '%' + phone.substr(1);
		// 1%123
		phone = phone.substr(0, 5) + '%' + phone.substr(5);
		// 1%123%123
		phone = phone.substr(0, 9) + '%' + phone.substr(9);
		// comment out if you want to debug for another locality:
		// throw new Error(phone);

		// the ** here is important, your contacts are split over several different directories!
		return glob(process.env.HOME + '/Library/Application\ Support/AddressBook/**/AddressBook-v22.abcddb', async function(err, files) {

			if (err) {

				return reject(err)
			}

			for (const file of files) {

				let value

				try {
					value = await new Promise((resolve, reject) => {

						let db = new sqlite3.Database(file);

						return db.serialize(function() {
			
							let SQL = `
								SELECT * FROM 
								ZABCDCONTACTINDEX
								LEFT OUTER JOIN ZABCDPHONENUMBER ON ZABCDCONTACTINDEX.ZCONTACT = ZABCDPHONENUMBER.ZOWNER
								LEFT OUTER JOIN ZABCDEMAILADDRESS ON ZABCDEMAILADDRESS.ZOWNER = ZABCDCONTACTINDEX.ZCONTACT
								LEFT OUTER JOIN ZABCDMESSAGINGADDRESS ON ZABCDMESSAGINGADDRESS.ZOWNER = ZABCDCONTACTINDEX.ZCONTACT
								LEFT OUTER JOIN ZABCDRECORD ON ZABCDRECORD.Z_PK = ZABCDCONTACTINDEX.ZCONTACT
								WHERE ZABCDCONTACTINDEX.ZSTRINGFORINDEXING LIKE "%${phone}%"
							`;
			
							db.all(SQL, function(err, rows) {
		
								if (err) {
		
									return reject(err)
								}
		
								if (rows.length > 0) {

									try {

										const output = rows[0].ZFIRSTNAME + ' ' + ((rows[0].ZLASTNAME) ? rows[0].ZLASTNAME : "")
										rowCache[phone] = output

										return resolve(output)
									} catch (e) {
										return reject(e)
									}
								}
			
								resolve(false)
							});
						});
					})
				} catch (err) {

					return reject (err)
				}

				if (value) {

					return resolve(value)
				}
			}

			resolve(false)
		});
	})
}

const getChats = () => {

	return new Promise((resolve, reject) => {

		db.serialize(function() {

			let arr = [];
			let seenNames = [];
			let SQL = `
				SELECT DISTINCT 
					handle.id,
					chat.chat_identifier,
					chat.display_name
				FROM
					message
				LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames 
				LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id
				WHERE
					message.is_from_me = 0 AND 
					message.service = 'iMessage'
				ORDER BY message.date DESC
				`

			db.all(SQL, function(err, rows) {

				if (err) {

					reject(err)
				}

				for (const row of rows) {

					if (row.chat_identifier === null) {
						if (seenNames.indexOf(row.id) < 0 && row.id !== "" && typeof(row.id) !== "undefined") {
							
							const chatId = row.id

							if (!seenNames.includes(chatId)) {
								seenNames.push(chatId)
								arr.push({name: chatId});
							}
						}
					} else if (seenNames.indexOf(row.chat_identifier) < 0 && seenNames.indexOf(row.display_name+'-'+row.chat_identifier) < 0) {
						if (row.chat_identifier.indexOf('chat') > -1) {
							if (row.display_name && row.display_name !== "" && typeof(row.display_name) !== "undefined") {
								
								const chatId = row.display_name+'-'+row.chat_identifier

								if (!seenNames.includes(chatId)) {
									seenNames.push(chatId)
									arr.push({name: chatId});
								}
							}
						} else {
							if (row.chat_identifier && row.chat_identifier !== "" && typeof(row.chat_identifier) !== "undefined") {
								
								const chatId = row.chat_identifier

								if (!seenNames.includes(chatId)) {
									seenNames.push(chatId)
									arr.push({name: chatId});
								}
							}
						}
					}

					if (arr.length > MAX_CHATS - 1) {
						// [{
						// 	id
						// 	chat_identifier
						// 	display_name
						// }]

						return resolve(arr)
					}
				}

				resolve(arr);
			});
		});
	})
}

const getAllMessagesInChatWithDate = (SELECTED_CHATTER, date) => {

	let chat = false

	if (SELECTED_CHATTER.includes(`-chat`)) {

		chat = true
		SELECTED_CHATTER = `chat${SELECTED_CHATTER.split(`-chat`)[1]}`
	}

	return new Promise((resolve, reject) => {

		let SQL = "";

		if (chat) { // this is a group chat
			SQL = `
				SELECT DISTINCT
					message.text,
					((message.date / 1000000000) + 978307200) * 1000 AS date_x 
				FROM 
					message 
				LEFT OUTER JOIN 
					chat ON chat.room_name = message.cache_roomnames
				WHERE
					message.service = 'iMessage' 
					AND
					chat.chat_identifier = '${SELECTED_CHATTER}'
					AND
					date_x > ${date} ORDER BY message.date
				DESC LIMIT 50
					`
		} else { // this is one person
			SQL = `
				SELECT DISTINCT
					message.text,
					((message.date / 1000000000) + 978307200) * 1000 AS date_x 
				FROM
					message
				LEFT OUTER JOIN
					chat ON chat.room_name = message.cache_roomnames 
				LEFT OUTER JOIN
					handle ON handle.ROWID = message.handle_id 
				WHERE
					message.service = 'iMessage' AND handle.id = '${SELECTED_CHATTER}'
					AND
					chat.room_name IS NULL
					AND date_x > ${date} 
					ORDER BY message.date
					DESC LIMIT 50
					`
		}

		db.serialize(function() {

			let arr = []

			db.all(SQL, function(err, rows) {

				if (err) throw err;

				for (const row of rows) {

					LAST_SEEN_CHAT_ID = row.ROWID;

					const emojiEntities = parse(row.text)

					for (const entity of emojiEntities) {

						let rowText = row.text.split(``)

						rowText.splice(entity.indices[0], entity.indices[1] - entity.indices[0], `:${emojiShortName[entity.text]}:`)

						row.text = rowText.join(``)
					}
					
					arr.push({chatter: ((!row.is_from_me) ? row.id : `me`), text: row.text });

					if (row.is_from_me) {

						MY_APPLE_ID = row.id;
					}
				}

				resolve(arr.reverse());
			});
		});
	})
}

const mapFriendlyChatNamesToChats = async (chats) => {

	for (let chat of chats) {

        if (!chat.name) {

          chat.friendlyName = `blank` 
          continue
        }

        let friendlyName

        if (chat.name.includes(`-chat`)) {

          friendlyName = await getChatFriendlyName(chat.name)

          if (!friendlyName) {
  
            friendlyName = chat.name
          }
        } else {

          friendlyName = await getNameByPhoneNumber(chat.name)

          if (!friendlyName) {
  
            friendlyName = chat.name
          }
        }

        // console.log(friendlyName)
        chat.friendlyName = friendlyName 
    }

	return chats
}

const sendNewMessage = (SELECTED_CHATTER, message) => {

	return new Promise(async (resolve, reject) => {

		const osaFunction = (SELECTED_CHATTER, message) => {

			const Messages = Application('Messages')
			let target
	
			try {

				target = Messages.chats.whose({ id: SELECTED_CHATTER })[0]
			} catch (e) {

				// console.log(e)
			}
	
			try {

				Messages.send(message, { to: target })
			} catch (e) {

				// console.log(e)
			}

			return {}
		}

		return osa(osaFunction)(SELECTED_CHATTER, message).then(resolve)
	})
}

let getChatInformationFromArgsCache = {}

const getChatInformationFromArgs = async (args) => {

	let selectedChatFriendlyName
	let selectedChatId
	let stringifiedArgs = JSON.stringify(args)

	if (getChatInformationFromArgsCache[stringifiedArgs]) {

		return getChatInformationFromArgsCache[stringifiedArgs]
	}
  
	if (args.chatId.includes(`-chat`)) {
  
	  args.chatId = args.chatId.split(`-chat`)[0]
	}
  
	let chats = await getChats()
  
	for (let chat of chats) {
  
	  if (!chat.name) {
  
		chat.friendlyName = `null`
		continue
	  }
  
	  let friendlyName = await getNameByPhoneNumber(chat.name)
  
	  if (!friendlyName) {
  
		friendlyName = chat.name
	  }
	  // console.log(friendlyName)
	  chat.friendlyName = friendlyName 
	}

	for (const chat of chats) {

		if (selectedChatId) {

			continue
		}
  
		let tempChatFriendlyName = chat.friendlyName
		tempChatFriendlyName = tempChatFriendlyName.replace(/\,/g, ``)
		tempChatFriendlyName = tempChatFriendlyName.replace(/[^\x00-\x7f]/g, ``)

		if (tempChatFriendlyName.includes(`-chat`)) {

			tempChatFriendlyName = tempChatFriendlyName.split(`-chat`)[0]
		}

		if (tempChatFriendlyName === args.chatId) {

			selectedChatFriendlyName = chat.friendlyName
			selectedChatId = chat.name
		}
	}
  
	if (!selectedChatId) {
  
	  return []
	}
  
	if (selectedChatId.includes(`-chat`)) {
  
	  selectedChatId = selectedChatId.split(`-chat`)[1]
	  selectedChatId = `chat${selectedChatId}`
	}
  
	if (selectedChatFriendlyName.includes(`-chat`)) {
  
	  selectedChatFriendlyName = selectedChatFriendlyName.split(`-chat`)[0]
	  selectedChatFriendlyName = `${selectedChatFriendlyName}`
	}

	getChatInformationFromArgsCache[stringifiedArgs] = {selectedChatId, selectedChatFriendlyName}

	return getChatInformationFromArgsCache[stringifiedArgs]
}

const getAllMessagesInChat = (SELECTED_CHATTER) => {

	return new Promise((resolve, reject) => {

		let SQL = "";
		if (SELECTED_CHATTER.indexOf('chat') > -1) { // this is a group chat
			SQL = `
				SELECT DISTINCT
					message.ROWID,
					handle.id,
					message.text,
					message.is_from_me,
					message.date,
					message.date_delivered,
					message.date_read
				FROM
					message
				LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames
				LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id 
				WHERE
					message.service = 'iMessage'
					AND chat.chat_identifier = '${SELECTED_CHATTER}'
				ORDER BY message.date
				DESC LIMIT 50
			`
		} else { // this is one person
			SQL = `
				SELECT DISTINCT
					message.ROWID,
					handle.id,
					message.text,
					message.is_from_me,
					message.date,
					message.date_delivered,
					message.date_read
				FROM
					message
				LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames
				LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id 
				WHERE
					message.service = 'iMessage'
					AND handle.id = '${SELECTED_CHATTER}'
					AND chat.room_name IS NULL
				ORDER BY message.date
				DESC LIMIT 50
			`
		}

		db.serialize(function() {
			let arr = [];
			db.all(SQL, function(err, rows) {

				if (err) throw err;

				for (const row of rows) {

					LAST_SEEN_CHAT_ID = row.ROWID;

					const emojiEntities = parse(row.text)

					for (const entity of emojiEntities) {

						let rowText = row.text.split(``)

						rowText.splice(entity.indices[0], entity.indices[1] - entity.indices[0], `:${emojiShortName[entity.text]}:`)

						row.text = rowText.join(``)
					}
					
					arr.push({chatter: ((!row.is_from_me) ? row.id : "me"), text: row.text });

					if (row.is_from_me) {

						MY_APPLE_ID = row.id;
					}
				}

				resolve(arr.reverse());
			});
		});
	})
}

const getChatMessagesByArgs = async (args) => {

	let {selectedChatId, selectedChatFriendlyName} = await getChatInformationFromArgs(args)

	const MAX_MESSAGES_PER_PAGE = 16
  
	let chatMessages = await getAllMessagesInChat(selectedChatId)
  
	chatMessages = chatMessages.slice(Number(args.page) * MAX_MESSAGES_PER_PAGE)
	chatMessages = chatMessages.slice(MAX_MESSAGES_PER_PAGE * -1)
  
	return {selectedChatId, selectedChatFriendlyName, chatMessages} 
}

const cleanChattersInMessages = async (messages) => {

	let returnMessages = []

	for (const message of messages) {

		let {chatter, text} = message
		let tempChatter

		if (chatter === `me`) {

			returnMessages.push({chatter, text})

			continue
		}

		tempChatter = await getNameByPhoneNumber(chatter)

		if (tempChatter) {

			chatter = tempChatter
		}

		returnMessages.push({chatter, text})
	}

	return returnMessages
}

module.exports = {
	getChats,
	sendNewMessage,
	mapFriendlyChatNamesToChats,
	getChatMessagesByArgs,
	cleanChattersInMessages,
	getChatInformationFromArgs,
	getAllMessagesInChatWithDate,
	getLoggedInUseriMessageHandle
}






