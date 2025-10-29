/**
 * Discord API utility functions
 */

/**
 * Safely remove all reactions from a message
 */
async function removeAllReactions(message) {
  try {
    await message.reactions.removeAll();
  } catch (err) {
    console.warn("Failed to remove reactions:", err.message);
  }
}

/**
 * Safely delete a message
 */
async function safeDelete(message, delay = 0) {
  try {
    if (delay > 0) {
      setTimeout(async () => {
        await message.delete();
      }, delay);
    } else {
      await message.delete();
    }
  } catch (err) {
    console.warn("Failed to delete message:", err.message);
  }
}

/**
 * Safely reply to a message with fallback to channel send
 */
async function safeReply(message, content) {
  try {
    return await message.reply(content);
  } catch (err) {
    // If reply fails (message deleted), send to channel instead
    try {
      if (typeof content === 'string') {
        return await message.channel.send(`<@${message.author.id}> ${content}`);
      } else if (content.content) {
        content.content = `<@${message.author.id}> ${content.content}`;
        return await message.channel.send(content);
      } else {
        return await message.channel.send(content);
      }
    } catch (err2) {
      console.error("Failed to send message:", err2);
      return null;
    }
  }
}

/**
 * Archive a thread safely
 */
async function archiveThread(thread, reason = "Ended") {
  try {
    if (thread && (thread.type === 11 || thread.type === 12) && typeof thread.setArchived === 'function') {
      await thread.setArchived(true, reason);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`Failed to archive thread ${thread?.id}:`, err.message);
    return false;
  }
}

/**
 * Get parent channel from thread
 */
function getParentChannel(channel) {
  if (channel && (channel.type === 11 || channel.type === 12) && channel.parent) {
    return channel.parent;
  }
  return channel;
}

/**
 * Check if channel is a thread
 */
function isThread(channel) {
  return channel && (channel.type === 11 || channel.type === 12);
}

/**
 * Await user confirmation with reactions
 */
async function awaitConfirmation(message, confirmCallback, cancelCallback, timeout = 30000) {
  try {
    await message.react('✅');
    await message.react('❌');

    const collected = await message.awaitReactions({
      filter: (r, u) => ['✅', '❌'].includes(r.emoji.name) && !u.bot,
      max: 1,
      time: timeout,
      errors: ['time'],
    });

    await removeAllReactions(message);

    if (collected.first().emoji.name === '✅') {
      if (confirmCallback) await confirmCallback(message);
    } else {
      if (cancelCallback) await cancelCallback(message);
    }
  } catch (e) {
    await removeAllReactions(message);
    if (cancelCallback) await cancelCallback(message);
  }
}

/**
 * Fetch channel safely with error handling
 */
async function fetchChannel(client, guildId, channelId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    return await guild.channels.fetch(channelId);
  } catch (err) {
    console.error(`Failed to fetch channel ${channelId}:`, err.message);
    return null;
  }
}

/**
 * Fetch member safely with error handling
 */
async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch (err) {
    console.warn(`Failed to fetch member ${userId}:`, err.message);
    return null;
  }
}

/**
 * Get username from member (nickname or username)
 */
function getDisplayName(member, user) {
  if (member && member.nickname) return member.nickname;
  if (member && member.user) return member.user.username;
  if (user) return user.username;
  return "Unknown";
}

/**
 * Check if user has any of the specified roles
 */
function hasAnyRole(member, roleNames) {
  if (!member || !member.roles) return false;
  return roleNames.some(roleName =>
    member.roles.cache.some(role => role.name === roleName)
  );
}

module.exports = {
  removeAllReactions,
  safeDelete,
  safeReply,
  archiveThread,
  getParentChannel,
  isThread,
  awaitConfirmation,
  fetchChannel,
  fetchMember,
  getDisplayName,
  hasAnyRole,
};
