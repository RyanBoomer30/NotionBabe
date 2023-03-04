const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")

dotenv.config()

// Notion integration
const notion = new Client({ auth: process.env.NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID

// Discord bot login
const Discord = require("discord.js")
const discordClient = new Discord.Client({ intents: ["MessageContent", "GuildMessages", "GuildMembers", "Guilds"] })

/*
===================================================Discord Bot===================================================
*/
discordClient.on("ready", () => {
  console.log(`Logged in as ${discordClient.user.tag}!`)
})

discordClient.on("messageCreate", async msg => {
  console.log(msg.content)
  if (msg.content === "!help") {
    msg.reply("!tasks: Show all the tasks in the database");
  }else if(msg.content == "!tasks") {
    msg.reply("Here are the tasks in Notion:");
    sendTasksToDiscord(eboardServer);
  }
})

discordClient.login(process.env.DISCORD_TOKEN)

/*
===================================================Discord Database===================================================
*/
eboardServer = process.env.EBOARD_CHANNEL;

/*
===================================================!Update Command===================================================
*/
/**
 * Send the current database.
 *
 * @param {{ discordServer: string }}
 */
async function sendTasksToDiscord(discordServer) {
  // Get the tasks currently in the database.
  console.log("\nFetching tasks from Notion DB...")
  const currentTasks = await getTasksFromNotionDatabase([])

  // Send a notification about the project database.
  for (const task of currentTasks) {
    await sendTasks(task, discordServer)
  }
}

/**
 * Sends task update notification on discord.
 *
 * @param {{ tasks: Array, discordServer: string }}
 */
async function sendTasks(tasks, discordServer) {
  const message = 
  `**${tasks.title}**:
  Assigned to: ${tasks.assignee}
  Status: ${tasks.status}
  Last edited by ${tasks.lastEdited} on ${tasks.lastEditedTime}.`

  console.log(message)
  await discordClient.channels.fetch(discordServer);
  discordClient.channels.cache.get(discordServer).send({ content: message });
}

/*
===================================================Hourly Update===================================================
*/
/**
 * Local map to store task pageId to its last status.
 * { [pageId: string]: string }
 */
const taskPageIdToStatusMap = {}

/**
 * Initialize local data store.
 * Then poll for changes every 1 hour (3.6e+6 milliseconds).
 */
setInitialTaskPageIdToStatusMap().then(() => {
  setInterval(findAndSendUpdatedTasks, (3600000))
})

/**
 * Get and set the initial data store with tasks currently in the database.
 */
async function setInitialTaskPageIdToStatusMap() {
  const currentTasks = await getTasksFromNotionDatabase([])
  for (const { pageId, status } of currentTasks) {
    taskPageIdToStatusMap[pageId] = status
  }
}

async function findAndSendUpdatedTasks() {
  // Get the tasks currently in the database.
  console.log("\nFetching tasks from Notion DB...")
  const currentTasks = await getTasksFromNotionDatabase([])

  // Return any tasks that have had their status updated.
  const updatedTasks = findUpdatedTasks(currentTasks)
  console.log(`Found ${updatedTasks.length} updated tasks.`)

  // For each updated task, update taskPageIdToStatusMap and send a notification.
  for (const task of updatedTasks) {
    taskPageIdToStatusMap[task.pageId] = task.status
    await sendUpdate(task, eboardServer)
  }
}

/**
 * Sends task update notification on discord.
 *
 * @param {{ tasks: Array, discordServer: string }}
 */
async function sendUpdate(tasks, discordServer) {
  const message = `Task ${tasks.title}, assigned to **${tasks.assignee}**, has been updated to **"${tasks.status}"** by "${tasks.lastEdited}".`
  console.log(message)
  await discordClient.channels.fetch(discordServer);
  discordClient.channels.cache.get(discordServer).send({ content: message });
}

/**
 * Gets tasks from the database.
 *
 * @returns {Possible<Array<{ 
 * pageId: string, 
 * status: string, 
 * title: string, 
 * assignee: string, 
 * lastEdited: string, 
 * lastEditedTime: string }>>}
 * 
 * Parameter cases
 * returnList = [] means return everything
 * returnList = [returnList] means return all the elements contained in the list
 */
async function getTasksFromNotionDatabase(returnList) {
  const pages = []
  let cursor = undefined

  // Fetch the database
  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    })
    pages.push(...results)
    if (!next_cursor) {
      break
    }
    cursor = next_cursor
  }
  console.log(`${pages.length} pages successfully fetched.`)

  const tasks = []
  for (const page of pages) {
    // Task id
    const pageId = page.id
    tasks.push(pageId)

    // Task Status
    if (returnList.includes("Status") || returnList.length == 0){
      const statusPropertyId = page.properties["Status"].id
      const statusPropertyItem = await getPropertyValue({
        pageId,
        propertyId: statusPropertyId,
      })

      const status = statusPropertyItem.select
        ? statusPropertyItem.select.name
        : "No Status"

      tasks.push(status)
    }

    // Task title
    if (returnList.includes("Title") || returnList.length == 0) {
      const titlePropertyId = page.properties["Name"].id
      const titlePropertyItems = await getPropertyValue({
        pageId,
        propertyId: titlePropertyId,
      })

      const title = titlePropertyItems
        .map(propertyItem => propertyItem.title.plain_text)
        .join("")

      tasks.push(title)
    }

    // Task assignee
    if (returnList.includes("Assignee") || returnList.length == 0) {
      const assigneePropertyId = page.properties["Assignee"].id
      const assigneePropertyItems = await getPropertyValue({
        pageId,
        propertyId: assigneePropertyId,
      })

      const assignee = assigneePropertyItems
        .map(propertyItem => propertyItem.people.name)
        .join(" ")
      
      tasks.push(assignee)
    }
    
    // Task last edited
    if (returnList.includes("LastEditedBy") || returnList.length == 0) {
      const lastEditedByPropertyId = page.properties["Last edited by"].id
      const lastEditedByPropertyItems = await getPropertyValue({
        pageId,
        propertyId: lastEditedByPropertyId,
      })

      const lastEditedBy = lastEditedByPropertyItems.last_edited_by.name

      tasks.push(lastEditedBy)
    }

    // Task last edited time
    if (returnList.includes("LastEditedTime") || returnList.length == 0) {
      const lastEditedTimePropertyId = page.properties["Last edited time"].id
      const lastEditedTimePropertyItems = await getPropertyValue({
        pageId,
        propertyId: lastEditedTimePropertyId,
      })

      const lastEditedTime = lastEditedTimePropertyItems.last_edited_time.substring(0, 10);

      tasks.push(lastEditedTime)
    }
  }

  return tasks
}

/**
 * Compares task to most recent version of task stored in taskPageIdToStatusMap.
 * Returns any tasks that have a different status than their last version.
 *
 * @param {Array<{ pageId: string, status: string, title: string }>} currentTasks
 * @returns {Array<{ pageId: string, status: string, title: string }>}
 */
function findUpdatedTasks(currentTasks) {
  return currentTasks.filter(currentTask => {
    const previousStatus = getPreviousTaskStatus(currentTask)
    return currentTask.status !== previousStatus
  })
}

/**
 * Finds or creates task in local data store and returns its status.
 * @param {{ pageId: string; status: string }} task
 * @returns {string}
 */
function getPreviousTaskStatus({ pageId, status }) {
  // If this task hasn't been seen before, add to local pageId to status map.
  if (!taskPageIdToStatusMap[pageId]) {
    taskPageIdToStatusMap[pageId] = status
  }
  const message = `Task ("${pageId}") has a status of "${status}".`
  return taskPageIdToStatusMap[pageId]
}

/**
 * If property is paginated, returns an array of property items.
 *
 * Otherwise, it will return a single property item.
 *
 * @param {{ pageId: string, propertyId: string }}
 * @returns {Promise<PropertyItemObject | Array<PropertyItemObject>>}
 */
async function getPropertyValue({ pageId, propertyId }) {
  const propertyItem = await notion.pages.properties.retrieve({
    page_id: pageId,
    property_id: propertyId,
  })
  if (propertyItem.object === "property_item") {
    return propertyItem
  }

  // Property is paginated.
  let nextCursor = propertyItem.next_cursor
  const results = propertyItem.results

  while (nextCursor !== null) {
    const propertyItem = await notion.pages.properties.retrieve({
      page_id: pageId,
      property_id: propertyId,
      start_cursor: nextCursor,
    })

    nextCursor = propertyItem.next_cursor
    results.push(...propertyItem.results)
  }

  return results
}