package com.elysium.guild.network

import com.elysium.guild.models.*
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.*

interface ElysiumApiService {
    
    // Boss Timer Endpoints
    @GET("api/bosses")
    suspend fun getBossTimers(): Response<BossTimerResponse>
    
    @GET("api/bosses/{bossName}")
    suspend fun getBossTimer(@Path("bossName") bossName: String): Response<ApiResponse<BossTimer>>
    
    // Leaderboard Endpoints
    @GET("api/members")
    suspend fun getLeaderboard(
        @Query("type") type: String = "attendance",
        @Query("period") period: String? = null,
        @Query("sub_period") subPeriod: String? = null,
        @Query("limit") limit: Int = 100
    ): Response<LeaderboardResponse>
    
    @GET("api/members/{memberId}")
    suspend fun getMemberProfile(@Path("memberId") memberId: String): Response<ApiResponse<MemberProfileResponse>>
    
    // Events Endpoints
    @GET("api/events")
    suspend fun getEvents(): Response<ApiResponse<EventsResponse>>
    
    // Health Check
    @GET("api/health")
    suspend fun healthCheck(): Response<ApiResponse<Map<String, Any>>>
}

// API Response Wrapper
data class NetworkResult<T>(
    val success: Boolean,
    val data: T?,
    val message: String?,
    val error: String?
)
