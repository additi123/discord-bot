const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log('Bot is ready!');
});


const threadMap = {};

const getOpenAiThreadId = (discordThreadId) => {
    return threadMap[discordThreadId];
}

const addThreadToMap = (discordThreadId, openAiThreadId) => {
    threadMap[discordThreadId] = openAiThreadId;
}

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const terminalStates = ["cancelled", "failed", "completed", "expired"];
const statusCheckLoop = async (openAiThreadId, runId) => {
    try {
        const run = await openai.beta.threads.runs.retrieve(
            openAiThreadId,
            runId
        );

        if (terminalStates.indexOf(run.status) < 0) {
            await sleep(1000);
            return statusCheckLoop(openAiThreadId, runId);
        }
        console.log(run);
        return run.status;
    } catch (error) {
        console.error("Error checking status:", error);
        return "failed";
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content) {
        return;
    }

    const discordThreadId = message.channel.id;
    let openAiThreadId = getOpenAiThreadId(discordThreadId);
    if (!openAiThreadId) {
        try {
            const thread = await openai.beta.threads.create();
            openAiThreadId = thread.id;
            addThreadToMap(discordThreadId, openAiThreadId);
        } catch (error) {
            console.error("Error creating thread:", error);
            return;
        }
    }

    try {
        await openai.beta.threads.messages.create(
            openAiThreadId,
            { role: "user", content: message.content }
        );

        const run = await openai.beta.threads.runs.create(
            openAiThreadId,
            { assistant_id: process.env.ASSISTANT_ID }
        );

        await statusCheckLoop(openAiThreadId, run.id);

        const messages = await openai.beta.threads.messages.list(openAiThreadId);
        const response = messages.data[0]?.content[0]?.text?.value || "No response";
        message.reply(response);

    } catch (error) {
        console.error("Error processing message:", error);
        message.reply("Sorry, there was an error processing your request.");
    }
});

client.login(process.env.DISCORD_TOKEN);
