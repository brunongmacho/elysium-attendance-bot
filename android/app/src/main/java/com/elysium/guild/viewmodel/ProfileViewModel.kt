package com.elysium.guild.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elysium.guild.utils.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val updateManager: UpdateManager
) : ViewModel() {

    private val _updateState = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val updateState: StateFlow<UpdateState> = _updateState

    fun checkForUpdates(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _updateState.value = UpdateState.Checking
            }
            
            val updateInfo = updateManager.checkForUpdates()
            if (updateInfo != null) {
                _updateState.value = UpdateState.UpdateAvailable(updateInfo)
            } else if (!silent) {
                _updateState.value = UpdateState.UpToDate
            }
        }
    }

    fun downloadAndInstall(updateInfo: UpdateManager.UpdateInfo) {
        updateManager.downloadAndInstall(updateInfo.apkUrl, "ElysiumGuild.apk")
        _updateState.value = UpdateState.Downloading
    }

    fun resetUpdateState() {
        _updateState.value = UpdateState.Idle
    }
}

sealed class UpdateState {
    object Idle : UpdateState()
    object Checking : UpdateState()
    object UpToDate : UpdateState()
    object Downloading : UpdateState()
    data class UpdateAvailable(val updateInfo: UpdateManager.UpdateInfo) : UpdateState()
}
