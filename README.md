# iMessage GraphQL Server

## What is this?
This repo provides a simple GraphQL API to Apple iMessages when running on a relatively recent Macintosh. As of writing, it has been tested on macOS 12 Monterey. It is intended to be used as a counterpart to other peices of software such as [Messages For Macintosh](https://github.com/CamHenlin/MessagesForMacintosh)

## How do I run it?
You have two options: running from package or source. Most users will want to run from package, but if you intend to make changes or do debugging, you will likely want to choose from source.

## Required Permissions
You will need to provide Terminal.app additional permissions in your macOS "Security & Privacy" preferences to run this software due to its interoperability with the Messages and Address Book databases, and access of Messages script functionality. Two items are required and you will be prompted to enable these the first time you run the software:

- Under "Full Disk Access", "Terminal" must be selected
- Under "Automation", "Terminal" must have "Messages" enabled underneath it

#### Running from package
To run from package, try the following:

- Download from LINK
- Double click on the downloaded file
- Terminal window should run

#### Running from source
To run source, try the following. In a new terminal window:

```
git clone LINK
cd imessagegraphqlserver
npm install
node index
```

## What do I do once I'm up and running?
Once you're running, your Mac is ready to provide iMessage services to other products, such as [Messages For Macintosh](https://github.com/CamHenlin/MessagesForMacintosh). Here's an explanation of the UI and how it might help you:

PICTURE

Sections
- `IP Address` - this tells you where your Server is expecting connections at. This is displayed so that you can enter it in to other software, such as [Messages For Macintosh](https://github.com/CamHenlin/MessagesForMacintosh). The IP Address is by far the most important thing being displayed
- `Chat Handle` - this should match the current iMessage account that you will be chatting from
- `Help` - displays some helpful messages on how to exit the Server
- `Logs` - displays what the Server is currently doing -- helpful for debugging or confirming that the Server is up
- `Stats` - some simple progress bars to show that the Server is doing stuff and to take up a bit of space on the screen. Fun to watch