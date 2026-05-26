package com.elysium.guild.repository

import com.elysium.guild.database.MemberProfileDao
import com.elysium.guild.models.*
import com.elysium.guild.network.ElysiumApiService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val apiService: ElysiumApiService,
    private val memberProfileDao: MemberProfileDao
) {
    
    suspend fun getMemberProfile(memberId: String = "current_user"): MemberProfile? {
        try {
            // Try to get from local database first
            val localProfile = memberProfileDao.getMemberProfile(memberId)
            if (localProfile != null) {
                return localProfile.toMemberProfile()
            }
            
            // If not in local, fetch from API
            refreshProfile(memberId)
            return memberProfileDao.getMemberProfile(memberId)?.toMemberProfile()
        } catch (e: Exception) {
            throw e
        }
    }
    
    suspend fun refreshProfile(memberId: String = "current_user") {
        try {
            val response = apiService.getMemberProfile(memberId)
            if (response.isSuccessful && response.body()?.success == true) {
                val profile = response.body()?.data?.profile
                if (profile != null) {
                    memberProfileDao.insertProfile(profile.toEntity())
                }
            }
        } catch (e: Exception) {
            throw e
        }
    }
}

// Extension functions for entity conversion
private fun MemberProfileEntity.toMemberProfile(): MemberProfile {
    return MemberProfile(
        memberId = memberId,
        name = name,
        avatarUrl = avatarUrl,
        rank = rank,
        totalPoints = totalPoints,
        availablePoints = availablePoints,
        attendanceRate = attendanceRate,
        currentStreak = currentStreak,
        weeklyRank = weeklyRank,
        role = role,
        recentActivities = emptyList() // TODO: Fetch activities separately
    )
}

private fun MemberProfile.toEntity(): MemberProfileEntity {
    return MemberProfileEntity(
        memberId = memberId,
        name = name,
        avatarUrl = avatarUrl,
        rank = rank,
        totalPoints = totalPoints,
        availablePoints = availablePoints,
        attendanceRate = attendanceRate,
        currentStreak = currentStreak,
        weeklyRank = weeklyRank,
        role = role,
        lastUpdated = kotlinx.datetime.Clock.System.now().toString()
    )
}