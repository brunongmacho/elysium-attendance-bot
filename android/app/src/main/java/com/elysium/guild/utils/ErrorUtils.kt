package com.elysium.guild.utils

import android.content.Context
import com.elysium.guild.R
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

object ErrorUtils {

    fun parseError(context: Context, error: Throwable?): String {
        return when (error) {
            is SocketTimeoutException -> context.getString(R.string.error_timeout)
            is ConnectException, is UnknownHostException -> context.getString(R.string.error_network)
            else -> error?.message ?: context.getString(R.string.error_unknown)
        }
    }

    fun getErrorMessage(context: Context, message: String?): String {
        if (message == null) return context.getString(R.string.error_unknown)
        
        return when {
            message.contains("timeout", ignoreCase = true) -> context.getString(R.string.error_timeout)
            message.contains("connection", ignoreCase = true) || message.contains("network", ignoreCase = true) -> context.getString(R.string.error_network)
            message.contains("server", ignoreCase = true) -> context.getString(R.string.error_server)
            else -> message
        }
    }
}
