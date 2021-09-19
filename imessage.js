const sqlite3 = require('sqlite3').verbose();
const dir = process.env.HOME + '/Library/Messages/';
const file = process.env.HOME + '/Library/Messages/chat.db';
const applescript = require("./applescript/lib/applescript.js");
const exec = require('exec');
const glob = require('glob');
const imessagemodule = require('imessagemodule');

const db = new sqlite3.Database(file);

let LAST_SEEN_ID = 0;
let LAST_SEEN_CHAT_ID = 0;
let ID_MISMATCH = false;
let SELECTED_CHATTER = ""; // could be phone number or email address or groupchat id
let SELECTED_CHATTER_NAME = ""; // should be a firstname and lastname if selected chatter exists in addressbook
let GROUPCHAT_SELECTED = false;
let SELECTED_GROUP = ""; // stores actual group title
let MY_APPLE_ID = "";
let sending = false;

const getChatFriendlyName = (chatUglyName) => {

	return new Promise((resolve, reject) => {

		db.serialize(function() {

			let arr = [];
			let SQL = "SELECT DISTINCT message.date, handle.id, chat.chat_identifier, chat.display_name  FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.is_from_me = 0 AND message.service = 'iMessage' ORDER BY message.date DESC";
			let found = false;

			db.all(SQL, function(err, rows) {
				if (err) {

					return reject(err);
				}

				for (let i = 0; i < rows.length; i++) {
					let row = rows[i];
				console.log(`inspect row!`)
				console.log(row)
				console.log(`vs ${chatUglyName}`)

					if (row.chat_identifier === chatUglyName) {
						console.log(`found`)
						found = true;
						resolve(row.display_name);
						break;
					}
				}
			});

			setTimeout(function() {
				if (!found) {
					resolve();
				}
			}, 250)
		});
	})
}

const getNameByPhoneNumber = (phone) => {

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

		glob(process.env.HOME + '/Library/Application\ Support/AddressBook/**/AddressBook-v22.abcddb', function (er, files) {
			let found = false;

			for (let i = 0; i < files.length; i++) {
				let file = files[i];
				let db = new sqlite3.Database(file);

				db.serialize(function() {
					let SQL = 'SELECT * FROM ZABCDCONTACTINDEX LEFT OUTER JOIN ZABCDPHONENUMBER ON ZABCDCONTACTINDEX.ZCONTACT = ZABCDPHONENUMBER.ZOWNER LEFT OUTER JOIN ZABCDEMAILADDRESS ON ZABCDEMAILADDRESS.ZOWNER = ZABCDCONTACTINDEX.ZCONTACT LEFT OUTER JOIN ZABCDMESSAGINGADDRESS ON ZABCDMESSAGINGADDRESS.ZOWNER = ZABCDCONTACTINDEX.ZCONTACT LEFT OUTER JOIN ZABCDRECORD ON ZABCDRECORD.Z_PK = ZABCDCONTACTINDEX.ZCONTACT WHERE ZFULLNUMBER LIKE "%'+phone+'%"';
					db.all(SQL, function(err, rows) {

						if (rows.length > 0 && !found) {
							try {
								resolve(rows[0].ZFIRSTNAME + ' ' + ((rows[0].ZLASTNAME) ? rows[0].ZLASTNAME : ""));
							} catch (e) {
								reject(e)
							}
						} else {
							resolve(false)
						}
					});
				});
			}
		});
	})
}


const getChats = () => {

	return new Promise((resolve, reject) => {

		db.serialize(function() {
			let arr = [];
			let SQL = "SELECT DISTINCT message.date, handle.id, chat.chat_identifier, chat.display_name  FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.is_from_me = 0 AND message.service = 'iMessage' ORDER BY message.date DESC";

			db.all(SQL, function(err, rows) {
				if (err) {

					reject(err)
				}
				for (let i = 0; i < rows.length; i++) {
					let row = rows[i];
					if (row.chat_identifier === null) {
						if (arr.indexOf(row.id) < 0 && row.id !== "" && typeof(row.id) !== "undefined") {
							
							const chatId = row.id

							if (!arr.includes(chatId)) {
								arr.push(chatId);
							}
						}
					} else if (arr.indexOf(row.chat_identifier) < 0 && arr.indexOf(row.display_name+'-'+row.chat_identifier) < 0) {
						if (row.chat_identifier.indexOf('chat') > -1) {
							if (row.display_name && row.display_name !== "" && typeof(row.display_name) !== "undefined") {
								
								const chatId = row.display_name+'-'+row.chat_identifier

								if (!arr.includes(chatId)) {
									arr.push(chatId);
								}
							}
						} else {
							if (row.chat_identifier && row.chat_identifier !== "" && typeof(row.chat_identifier) !== "undefined") {
								
								const chatId = row.chat_identifier

								if (!arr.includes(chatId)) {
									arr.push(chatId);
								}
							}
						}
					}
				}

				resolve(arr.map((el) => { return {name: el}}));
			});
		});
	})
}

const getAllMessagesInChat = (SELECTED_CHATTER) => {

	console.log(SELECTED_CHATTER)

	return new Promise((resolve, reject) => {

		let SQL = "";
		if (SELECTED_CHATTER.indexOf('chat') > -1) { // this is a group chat
			SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND chat.chat_identifier = '"+SELECTED_CHATTER+"' ORDER BY message.date DESC LIMIT 50";
		} else { // this is one person
			SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND handle.id = '"+SELECTED_CHATTER+"' AND chat.room_name IS NULL ORDER BY message.date DESC LIMIT 50";
		}

		db.serialize(function() {
			let arr = [];
			db.all(SQL, function(err, rows) {

				console.log(rows)
				if (err) throw err;
				for (let i = 0; i < rows.length; i++) {
					let row = rows[i];
					LAST_SEEN_CHAT_ID = row.ROWID;
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

const getMaxMessageId = () => {

	return new Promise((resolve, reject) => {

		let SQL = "SELECT MAX(message.ROWID) AS maxid FROM message";

		db.serialize(function() {
			let arr = [];
			db.all(SQL, function(err, rows) {
				if (err) {

					return reject(err)
				}

				resolve({id: rows[0].maxid});
			});
		});
	})
}

const getLastMessageInChat = (SELECTED_CHATTER) => {

	return new Promise((resolve, reject) => {


	let SQL = "";
		if (SELECTED_CHATTER.indexOf('chat') > -1) { // this is a group chat
			SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND chat.chat_identifier = '"+SELECTED_CHATTER+"' ORDER BY message.date DESC LIMIT 1";
		} else { // this is one person
			SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND handle.id = '"+SELECTED_CHATTER+"' ORDER BY message.date DESC LIMIT 1";
		}

		db.serialize(function() {
			let arr = [];
			db.all(SQL, function(err, rows) {
				if (err) throw err;
				for (let i = 0; i < rows.length; i++) {
					let row = rows[i];
					LAST_SEEN_CHAT_ID = row.ROWID;
					resolve({chatter: ((!row.is_from_me) ? row.id : "me"), text: row.text });
					if (row.is_from_me) {
						MY_APPLE_ID = row.id;
					}
				}
			});
		});
	})
}

const sendNewMessage = (SELECTED_CHATTER, message) => {

	return new Promise(async (resolve, reject) => {

		if (SELECTED_CHATTER.indexOf('chat') > -1) {
			let friendlyChatterName = await getChatFriendlyName(SELECTED_CHATTER)
			console.log(`sending to imessage lib: ${friendlyChatterName}, ${message}`)
			imessagemodule.sendMessage(friendlyChatterName, message, resolve);
		} else {
			imessagemodule.sendMessage(SELECTED_CHATTER, message, resolve);
		}
	})
}

module.exports = {
	getChatFriendlyName,
	getNameByPhoneNumber,
	getChats,
	getAllMessagesInChat,
	getMaxMessageId,
	getLastMessageInChat,
	sendNewMessage
}






