package com.elysium.guild.models

/**
 * Simplified permissions for the app after Discord removal.
 * Defaulting to basic access for all users.
 */
data class GuildPermissions(
    val isAdmin: Boolean = false,
    val isLeader: Boolean = false,
    val isElite: Boolean = false,
    val isElysium: Boolean = true,
    val canViewAdminLogs: Boolean = false,
    val canStartAuction: Boolean = false,
    val canManageAttendance: Boolean = false
)

object GuildRoles {
    const val ELYSIUM_ROLE = "ELYSIUM"
    const val GUILD_ID = "1401784124469149736"
}
