/**
 * Test Send Utility - Sends test embeds to all recorded channels
 * Auto-deletes after 2 minutes
 * Admin-only, channel-specific
 */

const { EmbedBuilder } = require('discord.js');
const dbAPI = require('./database-api');

async function handleTestSend(channelId, userId, client) {
  try {
    // Verify channel is admin-logs
    const expectedChannelId = process.env.ADMIN_LOGS_CHANNEL_ID;
    if (channelId !== expectedChannelId) {
      return { error: 'This command can only be used in the admin-logs channel.' };
    }

    // Verify user has admin role (simplified check)
    const member = await client.guilds.resolve(process.env.MAIN_GUILD_ID)?.members.fetch(userId);
    if (!member) {
      return { error: 'Could not verify user permissions.' };
    }
    
    // Check if user has admin role (simplified)
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    const hasAdminRole = member.roles.cache.has(adminRoleId);
    if (!hasAdminRole) {
      return { error: 'You do not have permission to use this command.' };
    }

    // Get all recorded channels from database
    const collections = ['attendance-TPB', 'members-TPB', 'auctionItems-TPB'];
    const channels = new Set();
    
    for (const collName of collections) {
      try {
        const collection = dbAPI.db.collection(collName);
        const docs = await collection.find({}, { projection: { channelId: 1 } }).toArray();
        docs.forEach(doc => {
          if (doc.channelId) channels.add(doc.channelId);
        });
      } catch (err) {
        // Collection might not exist yet
      }
    }

    if (channels.size === 0) {
      return { warning: 'No channels have been recorded yet.' };
    }

    // Create the test embed
    const testEmbed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🔧 THIS IS A TEST')
      .setDescription('This is a test message to verify the bot is working correctly.')
      .addFields(
        { name: 'Status', value: '✅ Working', inline: true },
        { name: 'Channels Tested', value: channels.size.toString(), inline: true },
        { name: 'Timestamp', value: new Date().toLocaleString(), inline: false }
      )
      .setFooter({ text: 'Test message - will auto-delete in 2 minutes' })
      .setTimestamp()
      .setAuthor({ name: 'Test Sender', iconURL: client.user.displayAvatarURL() });

    // Send to all channels and schedule deletion
    const results = [];
    for (const channelId of channels) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const msg = await channel.send({ embeds: [testEmbed] });
          results.push({ channel: channelId, status: 'sent', messageId: msg.id });
          
          // Schedule deletion after 2 minutes
          setTimeout(async () => {
            try {
              await msg.delete();
              console.log(`✅ Test message deleted from channel ${channelId}`);
            } catch (err) {
              console.log(`⚠️ Could not delete test message from ${channelId}: ${err.message}`);
            }
          }, 120000); // 2 minutes
        }
      } catch (err) {
        results.push({ channel: channelId, status: 'failed', error: err.message });
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length;
    return { success: true, channels: results, successCount };
    
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { handleTestSend };
