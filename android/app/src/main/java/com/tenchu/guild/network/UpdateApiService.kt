package com.tenchu.guild.network

import retrofit2.Response
import retrofit2.http.GET

interface UpdateApiService {
    @GET("brunongmacho/tenchu-guild/main/update-manifest.json")
    suspend fun getUpdateManifest(): Response<UpdateManifest>
}

data class UpdateManifest(
    val latestVersionCode: Int,
    val latestVersionName: String,
    val apkUrl: String,
    val releaseNotes: String,
    val isForceUpdate: Boolean
)
