package com.elysium.guild.utils

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import com.elysium.guild.BuildConfig
import com.elysium.guild.network.UpdateApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UpdateManager @Inject constructor(
    private val context: Context,
    private val updateApiService: UpdateApiService
) {
    data class UpdateInfo(
        val latestVersionCode: Int,
        val latestVersionName: String,
        val apkUrl: String,
        val releaseNotes: String,
        val isForceUpdate: Boolean
    )

    suspend fun checkForUpdates(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val response = updateApiService.getUpdateManifest()
            if (response.isSuccessful) {
                val manifest = response.body()
                if (manifest != null && manifest.latestVersionCode > BuildConfig.VERSION_CODE) {
                    return@withContext UpdateInfo(
                        latestVersionCode = manifest.latestVersionCode,
                        latestVersionName = manifest.latestVersionName,
                        apkUrl = manifest.apkUrl,
                        releaseNotes = manifest.releaseNotes,
                        isForceUpdate = manifest.isForceUpdate
                    )
                }
            }
        } catch (e: Exception) {
            Log.e("UpdateManager", "Update check failed", e)
        }
        null
    }

    fun downloadAndInstall(apkUrl: String, fileName: String) {
        try {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = Uri.parse(apkUrl)
            
            val destinationFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
            if (destinationFile.exists()) {
                destinationFile.delete()
            }

            val request = DownloadManager.Request(uri)
                .setTitle("Elysium Guild Update")
                .setDescription("Downloading v$fileName")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationUri(Uri.fromFile(destinationFile))
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadId = downloadManager.enqueue(request)

            val onComplete = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                    if (downloadId == id) {
                        checkStatus(downloadManager, downloadId, destinationFile)
                        context.unregisterReceiver(this)
                    }
                }
            }
            
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(onComplete, filter, Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(onComplete, filter)
            }
            
            Toast.makeText(context, "Download started...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(context, "Start failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun checkStatus(dm: DownloadManager, id: Long, file: File) {
        val query = DownloadManager.Query().setFilterById(id)
        val cursor: Cursor = dm.query(query)
        if (cursor.moveToFirst()) {
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                Log.d("UpdateManager", "Download successful, triggering install...")
                installApk(file)
            } else {
                val errorMsg = when (reason) {
                    DownloadManager.ERROR_CANNOT_RESUME -> "Cannot resume"
                    DownloadManager.ERROR_DEVICE_NOT_FOUND -> "Storage not found"
                    DownloadManager.ERROR_FILE_ERROR -> "File system error"
                    DownloadManager.ERROR_HTTP_DATA_ERROR -> "Network data error"
                    DownloadManager.ERROR_INSUFFICIENT_SPACE -> "No storage space"
                    DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many redirects"
                    DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "HTTP Error: $reason"
                    else -> "Reason code: $reason"
                }
                Toast.makeText(context, "Download failed: $errorMsg", Toast.LENGTH_LONG).show()
            }
        }
        cursor.close()
    }

    private fun installApk(file: File) {
        if (!file.exists()) {
            Toast.makeText(context, "APK file not found", Toast.LENGTH_SHORT).show()
            return
        }
        
        try {
            val contentUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
            
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            
            Toast.makeText(context, "Opening installer...", Toast.LENGTH_SHORT).show()
            context.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e("UpdateManager", "Installation failed", e)
            Toast.makeText(context, "Installation error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
