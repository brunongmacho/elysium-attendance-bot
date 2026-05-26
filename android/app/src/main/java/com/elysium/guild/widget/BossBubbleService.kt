package com.elysium.guild.widget

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.PointF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.StyleSpan
import android.util.Log
import android.util.TypedValue
import android.view.*
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.elysium.guild.R
import com.elysium.guild.models.BossTimer
import com.elysium.guild.models.GuildEvent
import com.elysium.guild.repository.BossTimersRepository
import com.elysium.guild.repository.EventsRepository
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.utils.UIUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.sqrt
import kotlinx.datetime.*

@AndroidEntryPoint
class BossBubbleService : Service() {

    @Inject
    lateinit var preferenceManager: PreferenceManager

    @Inject
    lateinit var bossRepository: BossTimersRepository

    @Inject
    lateinit var eventsRepository: EventsRepository

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    private var params: WindowManager.LayoutParams? = null
    
    private var closeView: View? = null
    private var closeParams: WindowManager.LayoutParams? = null
    private var isCloseViewVisible = false
    private var userManuallyHidden = false
    private var hasHapticTriggeredInZone = false

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var updateJob: Job? = null
    private var currentBosses: List<BossTimer> = emptyList()
    private var currentEvents: List<GuildEvent> = emptyList()

    private var screenWidth = 0
    private var screenHeight = 0
    private var bubbleIcon: ImageView? = null
    private var timerLayout: View? = null
    private var headerContainer: LinearLayout? = null
    private var timerListContainer: LinearLayout? = null
    private var timerScrollView: ScrollView? = null
    
    private var lastStableX = 0
    private var lastStableY = -1
    private var isExpanded = false
    private var isAnimating = false
    private var currentAppTheme: Int = Constants.THEME_SYSTEM
    private var useLocalTimezone: Boolean = false

    private lateinit var prefs: SharedPreferences

    companion object {
        const val ACTION_SHOW = "com.elysium.guild.SHOW_BUBBLE"
        const val ACTION_HIDE = "com.elysium.guild.HIDE_BUBBLE"
        private const val TAG = "BossBubbleService"

        private const val COLOR_BOSS_READY = "#00FF88"
        private const val COLOR_BOSS_SOON = "#FFBB33"
        private const val COLOR_BOSS_TRACKING = "#818CF8"

        private const val COLOR_EVENT_READY = "#00E5FF"
        private const val COLOR_EVENT_SOON = "#FF7043"
        private const val COLOR_EVENT_NORMAL = "#448AFF"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                userManuallyHidden = false
                showFloatingView()
            }
            ACTION_HIDE -> hideFloatingView()
        }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        try {
            prefs = getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
            updateScreenDimensions()
            
            lastStableX = prefs.getInt(Constants.KEY_BUBBLE_LAST_X, screenWidth)
            lastStableY = prefs.getInt(Constants.KEY_BUBBLE_LAST_Y, dpToPx(Constants.BUBBLE_INITIAL_Y_DP))
            
            startForegroundService()
            setupFloatingView()
            setupCloseView()
            observeDataChanges()
            observeSettingsChanges()
            startPeriodicUpdates()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create service: ${e.message}")
            stopSelf()
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        updateScreenDimensions()
        val currentParams = params
        if (currentParams != null) {
            if (isExpanded) {
                currentParams.width = WindowManager.LayoutParams.MATCH_PARENT
                currentParams.height = WindowManager.LayoutParams.MATCH_PARENT
                updateViewLayoutSafely()
            } else {
                snapToEdge()
            }
        }
        updateCloseViewPosition()
        updateTimerDisplay()
    }

    private fun updateScreenDimensions() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val windowMetrics = windowManager?.currentWindowMetrics
                windowMetrics?.bounds?.let { bounds ->
                    screenWidth = bounds.width()
                    screenHeight = bounds.height()
                }
            } else {
                val size = Point()
                @Suppress("DEPRECATION")
                windowManager?.defaultDisplay?.getRealSize(size)
                screenWidth = size.x
                screenHeight = size.y
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating screen dimensions: ${e.message}")
        }
    }

    private fun startForegroundService() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                Constants.BUBBLE_NOTIFICATION_CHANNEL_ID,
                Constants.BUBBLE_NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, Constants.BUBBLE_NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Elysium Bubble Active")
            .setContentText("Boss & Event schedule overlay is running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        startForeground(Constants.BUBBLE_NOTIFICATION_ID, notification)
    }

    private fun setupCloseView() {
        try {
            if (closeView != null && closeView?.isAttachedToWindow == true) return

            closeView = LayoutInflater.from(this).inflate(R.layout.layout_bubble_close, null)
            
            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            closeParams = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or 
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                y = dpToPx(50)
            }
            
            closeView?.visibility = View.GONE
            windowManager?.addView(closeView, closeParams)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up close view: ${e.message}")
        }
    }

    private fun updateCloseViewPosition() {
        if (closeView != null && closeParams != null && closeView!!.isAttachedToWindow) {
            try {
                windowManager?.updateViewLayout(closeView, closeParams)
            } catch (e: Exception) { }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupFloatingView() {
        try {
            if (floatingView != null && floatingView?.isAttachedToWindow == true) return

            floatingView = LayoutInflater.from(this).inflate(R.layout.layout_boss_bubble, null)
            bubbleIcon = floatingView?.findViewById(R.id.bubble_icon)
            timerLayout = floatingView?.findViewById(R.id.timer_list_container)
            
            headerContainer = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            timerListContainer = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }
            
            timerScrollView = ScrollView(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                addView(timerListContainer)
                isVerticalScrollBarEnabled = true
            }

            (timerLayout as? LinearLayout)?.apply {
                orientation = LinearLayout.VERTICAL
                removeAllViews()
                addView(headerContainer)
                addView(timerScrollView)
            }

            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or 
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = lastStableX
                y = lastStableY
            }

            bubbleIcon?.setOnTouchListener(object : View.OnTouchListener {
                private var touchOffsetFromCenter = PointF()
                private var isMoving = false

                override fun onTouch(v: View, event: MotionEvent): Boolean {
                    if (isExpanded || isAnimating) return false
                    
                    val currentParams = params ?: return false
                    val closeCenter = getCloseCenter()
                    val iconWidth = v.width
                    val iconHeight = v.height
                    val padding = dpToPx(8)
                    val centerOffsetInWindowX = padding + iconWidth / 2f
                    val centerOffsetInWindowY = padding + iconHeight / 2f

                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            val location = IntArray(2)
                            v.getLocationOnScreen(location)
                            val currentCenterX = location[0] + iconWidth / 2f
                            val currentCenterY = location[1] + iconHeight / 2f
                            touchOffsetFromCenter.set(event.rawX - currentCenterX, event.rawY - currentCenterY)
                            isMoving = false
                            hasHapticTriggeredInZone = false
                            return true
                        }
                        MotionEvent.ACTION_MOVE -> {
                            val freeCenterX = event.rawX - touchOffsetFromCenter.x
                            val freeCenterY = event.rawY - touchOffsetFromCenter.y
                            
                            if (!isMoving) {
                                val currentLoc = IntArray(2)
                                v.getLocationOnScreen(currentLoc)
                                if (abs(event.rawX - (currentLoc[0] + iconWidth / 2f)) > Constants.BUBBLE_DRAG_THRESHOLD_PX || 
                                    abs(event.rawY - (currentLoc[1] + iconHeight / 2f)) > Constants.BUBBLE_DRAG_THRESHOLD_PX) {
                                    isMoving = true
                                    showCloseView()
                                }
                            }

                            if (isMoving) {
                                currentParams.x = (freeCenterX - centerOffsetInWindowX).toInt()
                                currentParams.y = (freeCenterY - centerOffsetInWindowY).toInt()
                                updateViewLayoutSafely()

                                val dist = sqrt(
                                    ((freeCenterX - closeCenter.x) * (freeCenterX - closeCenter.x) + 
                                     (freeCenterY - closeCenter.y) * (freeCenterY - closeCenter.y)).toDouble()
                                ).toFloat()

                                val inCloseZone = dist < dpToPx(80)
                                if (inCloseZone && !hasHapticTriggeredInZone) {
                                    triggerVibration(70)
                                    animateCloseIcon(true)
                                    hasHapticTriggeredInZone = true
                                } else if (!inCloseZone && hasHapticTriggeredInZone) {
                                    animateCloseIcon(false)
                                    hasHapticTriggeredInZone = false
                                }
                            }
                            return true
                        }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                            if (isMoving) {
                                val freeCenterX = event.rawX - touchOffsetFromCenter.x
                                val freeCenterY = event.rawY - touchOffsetFromCenter.y
                                val dist = sqrt(
                                    ((freeCenterX - closeCenter.x) * (freeCenterX - closeCenter.x) + 
                                     (freeCenterY - closeCenter.y) * (freeCenterY - closeCenter.y)).toDouble()
                                ).toFloat()

                                if (dist < dpToPx(80)) {
                                    performCollapseAndHide()
                                } else {
                                    hideCloseView()
                                    snapToEdge()
                                }
                            } else if (event.action == MotionEvent.ACTION_UP) {
                                v.performClick()
                            }
                            isMoving = false
                            return true
                        }
                    }
                    return false
                }
            })

            bubbleIcon?.setOnClickListener {
                if (!isAnimating) {
                    toggleExpandedView()
                }
            }

            floatingView?.setOnTouchListener { _, event ->
                if (isExpanded && !isAnimating) {
                    if (event.action == MotionEvent.ACTION_DOWN) {
                        val hitRect = android.graphics.Rect()
                        timerLayout?.getGlobalVisibleRect(hitRect)
                        val iconRect = android.graphics.Rect()
                        bubbleIcon?.getGlobalVisibleRect(iconRect)
                        
                        if (!hitRect.contains(event.rawX.toInt(), event.rawY.toInt()) && 
                            !iconRect.contains(event.rawX.toInt(), event.rawY.toInt())) {
                            toggleExpandedView()
                            return@setOnTouchListener true
                        }
                    } else if (event.action == MotionEvent.ACTION_OUTSIDE) {
                        toggleExpandedView()
                        return@setOnTouchListener true
                    }
                }
                false
            }

            floatingView?.visibility = View.GONE
            windowManager?.addView(floatingView, params)
            
            floatingView?.post {
                snapToEdge()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up floating view: ${e.message}")
        }
    }

    private fun getCloseCenter(): Point {
        val closeIcon = closeView?.findViewById<View>(R.id.close_icon)
        if (closeIcon != null && closeIcon.isAttachedToWindow) {
            val location = IntArray(2)
            closeIcon.getLocationOnScreen(location)
            return Point(
                location[0] + closeIcon.width / 2,
                location[1] + closeIcon.height / 2
            )
        }
        return Point(screenWidth / 2, screenHeight - dpToPx(130))
    }

    private fun animateCloseIcon(enlarge: Boolean) {
        val closeIcon = closeView?.findViewById<View>(R.id.close_icon) ?: return
        val targetScale = if (enlarge) 1.4f else 1.0f
        closeIcon.animate()
            .scaleX(targetScale)
            .scaleY(targetScale)
            .setDuration(200)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    private fun showCloseView() {
        if (isCloseViewVisible) return
        isCloseViewVisible = true
        
        closeView?.visibility = View.VISIBLE
        closeView?.alpha = 0f
        closeView?.translationY = dpToPx(20).toFloat()
        
        closeView?.animate()
            ?.alpha(1f)
            ?.translationY(0f)
            ?.setDuration(300)
            ?.setInterpolator(DecelerateInterpolator())
            ?.start()
    }

    private fun hideCloseView() {
        if (!isCloseViewVisible) return
        isCloseViewVisible = false
        
        closeView?.animate()
            ?.alpha(0f)
            ?.translationY(dpToPx(20).toFloat())
            ?.setDuration(300)
            ?.setInterpolator(AccelerateInterpolator())
            ?.withEndAction {
                closeView?.visibility = View.GONE
                animateCloseIcon(false)
            }
            ?.start()
    }

    private fun performCollapseAndHide() {
        triggerVibration(100)
        
        bubbleIcon?.animate()
            ?.scaleX(0f)
            ?.scaleY(0f)
            ?.alpha(0f)
            ?.setDuration(200)
            ?.withEndAction {
                userManuallyHidden = true
                hideFloatingView()
                hideCloseView()
                
                bubbleIcon?.scaleX = 1f
                bubbleIcon?.scaleY = 1f
                bubbleIcon?.alpha = 1f
                
                serviceScope.launch {
                    preferenceManager.setFloatingBubbleEnabled(false)
                }
            }
            ?.start()
    }

    private fun triggerVibration(duration: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
        }
    }

    private fun showFloatingView() {
        if (!userManuallyHidden) {
            params?.let {
                it.x = lastStableX
                it.y = lastStableY
                updateViewLayoutSafely()
                floatingView?.visibility = View.VISIBLE
            }
        }
    }

    private fun hideFloatingView() {
        if (isExpanded) {
            toggleExpandedView()
        }
        floatingView?.visibility = View.GONE
    }

    private fun snapToEdge() {
        val currentParams = params ?: return
        val currentX = currentParams.x
        val viewWidth = if ((floatingView?.width ?: 0) > 0) floatingView!!.width else dpToPx(70)
        val targetX = if (currentX + viewWidth / 2 < screenWidth / 2) {
            0
        } else {
            screenWidth - viewWidth
        }

        val animator = ValueAnimator.ofInt(currentX, targetX)
        animator.addUpdateListener { animation ->
            if (floatingView != null && floatingView!!.isAttachedToWindow) {
                params?.let {
                    it.x = animation.animatedValue as Int
                    updateViewLayoutSafely()
                }
            }
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                params?.let {
                    lastStableX = targetX
                    lastStableY = it.y
                    savePosition(lastStableX, lastStableY)
                }
            }
        })
        animator.duration = Constants.BUBBLE_SNAP_ANIMATION_DURATION
        animator.interpolator = DecelerateInterpolator()
        animator.start()
        
        adjustLayoutForSide(targetX == 0)
    }

    private fun savePosition(x: Int, y: Int) {
        prefs.edit()
            .putInt(Constants.KEY_BUBBLE_LAST_X, x)
            .putInt(Constants.KEY_BUBBLE_LAST_Y, y)
            .apply()
    }

    private fun adjustLayoutForSide(isLeft: Boolean) {
        val rootLayout = floatingView as? LinearLayout ?: return
        val icon = bubbleIcon ?: return
        val timers = timerLayout ?: return
        
        detachFromParent(icon)
        detachFromParent(timers)
        rootLayout.removeAllViews()
        rootLayout.orientation = LinearLayout.HORIZONTAL
        rootLayout.gravity = Gravity.CENTER_VERTICAL
        
        if (isLeft) {
            rootLayout.addView(icon)
            rootLayout.addView(timers)
        } else {
            rootLayout.addView(timers)
            rootLayout.addView(icon)
        }
    }

    private fun toggleExpandedView() {
        val rootLayout = floatingView as? LinearLayout ?: return
        val icon = bubbleIcon ?: return
        val timers = timerLayout ?: return
        val currentParams = params ?: return
        
        isExpanded = !isExpanded
        isAnimating = true

        if (isExpanded) {
            lastStableX = currentParams.x
            lastStableY = currentParams.y
            
            val iconWidth = if (icon.width > 0) icon.width else dpToPx(60)
            val targetXForIcon = screenWidth - iconWidth - dpToPx(16)
            val targetYForIcon = dpToPx(Constants.BUBBLE_EXPANDED_Y_DP)
            
            animateMovement(currentParams.x, targetXForIcon, currentParams.y, targetYForIcon) {
                floatingView?.visibility = View.INVISIBLE
                
                currentParams.width = WindowManager.LayoutParams.MATCH_PARENT
                currentParams.height = WindowManager.LayoutParams.MATCH_PARENT
                currentParams.x = 0
                currentParams.y = 0
                
                rootLayout.orientation = LinearLayout.VERTICAL
                rootLayout.gravity = Gravity.TOP
                
                detachFromParent(icon)
                detachFromParent(timers)
                rootLayout.removeAllViews()
                
                val headerLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.END
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        topMargin = targetYForIcon
                    }
                    setPadding(0, 0, dpToPx(16), 0)
                }
                headerLayout.addView(icon)
                
                timers.layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                timers.visibility = View.VISIBLE
                applyThemeToWindow()
                
                rootLayout.addView(headerLayout)
                rootLayout.addView(timers)
                
                updateViewLayoutSafely()
                updateTimerDisplay()
                
                floatingView?.post {
                    floatingView?.visibility = View.VISIBLE
                    isAnimating = false
                }
            }
        } else {
            floatingView?.visibility = View.INVISIBLE
            timers.visibility = View.GONE
            
            currentParams.width = WindowManager.LayoutParams.WRAP_CONTENT
            currentParams.height = WindowManager.LayoutParams.WRAP_CONTENT
            
            val iconWidth = if (icon.width > 0) icon.width else dpToPx(60)
            currentParams.x = screenWidth - iconWidth - dpToPx(16)
            currentParams.y = dpToPx(Constants.BUBBLE_EXPANDED_Y_DP)
            
            rootLayout.orientation = LinearLayout.HORIZONTAL
            rootLayout.gravity = Gravity.CENTER_VERTICAL
            
            detachFromParent(icon)
            detachFromParent(timers)
            
            timers.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = dpToPx(8)
            }
            
            adjustLayoutForSide(false)
            updateViewLayoutSafely()
            
            floatingView?.post {
                floatingView?.visibility = View.VISIBLE
                animateMovement(currentParams.x, lastStableX, currentParams.y, lastStableY) {
                    adjustLayoutForSide(lastStableX == 0)
                    isAnimating = false
                }
            }
        }
    }

    private fun animateMovement(fromX: Int, toX: Int, fromY: Int, toY: Int, onEnd: () -> Unit) {
        val xAnimator = ValueAnimator.ofInt(fromX, toX)
        val yAnimator = ValueAnimator.ofInt(fromY, toY)
        
        xAnimator.addUpdateListener { 
            params?.let { p ->
                p.x = it.animatedValue as Int
                updateViewLayoutSafely()
            }
        }
        yAnimator.addUpdateListener { 
            params?.let { p ->
                p.y = it.animatedValue as Int
                updateViewLayoutSafely()
            }
        }
        
        val animatorSet = AnimatorSet()
        animatorSet.playTogether(xAnimator, yAnimator)
        animatorSet.duration = Constants.BUBBLE_SNAP_ANIMATION_DURATION
        animatorSet.interpolator = DecelerateInterpolator()
        animatorSet.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                onEnd()
            }
        })
        animatorSet.start()
    }

    private fun detachFromParent(view: View) {
        try {
            (view.parent as? ViewGroup)?.removeView(view)
        } catch (e: Exception) { }
    }

    private fun observeDataChanges() {
        serviceScope.launch {
            bossRepository.bossDataChanged.collectLatest {
                fetchData()
            }
        }
        fetchData()
    }

    private fun observeSettingsChanges() {
        serviceScope.launch {
            preferenceManager.themeMode.collectLatest { mode ->
                currentAppTheme = mode
                if (isExpanded) {
                    applyThemeToWindow()
                    updateTimerDisplay()
                }
            }
        }
        serviceScope.launch {
            preferenceManager.useLocalTimezone.collectLatest { useLocal ->
                useLocalTimezone = useLocal
                if (isExpanded) {
                    updateTimerDisplay()
                }
            }
        }
    }

    private fun isDarkMode(): Boolean {
        return when (currentAppTheme) {
            Constants.THEME_DARK -> true
            Constants.THEME_LIGHT -> false
            else -> {
                (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            }
        }
    }

    private fun applyThemeToWindow() {
        val timers = timerLayout ?: return
        val isDark = isDarkMode()
        
        timers.setBackgroundResource(R.drawable.bg_bubble_window)
        val drawable = timers.background as? GradientDrawable
        if (drawable != null) {
            val bgColor = if (isDark) Color.parseColor("#E60B0B1A") else Color.parseColor("#F2FFFFFF")
            val strokeColor = if (isDark) Color.parseColor("#40FFFFFF") else Color.parseColor("#40000000")
            drawable.setColor(bgColor)
            drawable.setStroke(dpToPx(1), strokeColor)
        }
    }

    private fun fetchData() {
        serviceScope.launch {
            try {
                if (!isNetworkAvailable()) return@launch
                currentBosses = bossRepository.getBossTimers()
                currentEvents = eventsRepository.getEvents()
                updateTimerDisplay()
            } catch (e: Exception) { 
                Log.e(TAG, "Error fetching data: ${e.message}")
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return false
        return activeNetwork.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun startPeriodicUpdates() {
        updateJob = serviceScope.launch {
            while (isActive) {
                // Item 9: Power Save Mode Check
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                val isPowerSaveMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    powerManager.isPowerSaveMode
                } else false
                
                updateTimerDisplay()
                
                // Slow down refresh if power save is on
                val delayTime = if (isPowerSaveMode) 5000L else 1000L
                delay(delayTime)
                
                if (System.currentTimeMillis() % (if (isPowerSaveMode) 120000 else 60000) < delayTime) {
                    fetchData()
                }
            }
        }
    }

    private fun formatCountdown(diff: Long): String {
        if (diff <= 0) return Constants.LABEL_READY
        
        val h = diff / 3600
        val m = (diff % 3600) / 60
        val s = diff % 60
        
        return when {
            h > 0 -> String.format("%dh %02dm %02ds", h, m, s)
            m > 0 -> String.format("%02dm %02ds", m, s)
            else -> String.format("%02ds", s)
        }
    }

    private fun updateTimerDisplay() {
        if (!isExpanded) return
        val container = timerListContainer ?: return
        val hContainer = headerContainer ?: return
        val scrollView = timerScrollView ?: return
        container.removeAllViews()
        hContainer.removeAllViews()

        val now = Clock.System.now()
        val tz = if (useLocalTimezone) TimeZone.currentSystemDefault() else TimeZone.of("Asia/Manila")
        val today = now.toLocalDateTime(tz).date

        val todayBosses = currentBosses.filter { boss ->
            boss.nextSpawnTime?.let {
                try {
                    val spawnInstant = Instant.parse(it)
                    val spawnDate = spawnInstant.toLocalDateTime(tz).date
                    val diff = (spawnInstant - now).inWholeSeconds
                    spawnDate == today || (diff >= Constants.BUBBLE_SPAWNED_GRACE_PERIOD_SECONDS && diff < 0)
                } catch (e: Exception) { false }
            } ?: false
        }.map { boss ->
            val diff = (Instant.parse(boss.nextSpawnTime!!) - now).inWholeSeconds
            Triple(boss.bossName, diff, true)
        }

        val todayEvents = currentEvents.filter { event ->
            try {
                val startInstant = Instant.parse(event.startTime)
                val startDate = startInstant.toLocalDateTime(tz).date
                val diff = (startInstant - now).inWholeSeconds
                
                val endInstant = event.endTime?.let { Instant.parse(it) }
                val isRunning = endInstant?.let { now < it && now >= startInstant } ?: false
                val isToday = startDate == today
                
                isToday || isRunning || (diff >= Constants.BUBBLE_SPAWNED_GRACE_PERIOD_SECONDS && diff < 0)
            } catch (e: Exception) { false }
        }.map { event ->
            val startInstant = Instant.parse(event.startTime)
            val endInstant = event.endTime?.let { Instant.parse(it) }
            val isRunning = endInstant?.let { now < it && now >= startInstant } ?: false
            
            val diff = if (isRunning) 0L else (startInstant - now).inWholeSeconds
            Triple(event.name, diff, false)
        }

        val allItems = (todayBosses + todayEvents)
            .sortedWith(compareBy<Triple<String, Long, Boolean>> { it.second > 0 }
                .thenBy { if (it.second <= 0) -it.second else it.second })

        val isDark = isDarkMode()
        val textColor = if (isDark) Color.WHITE else Color.BLACK
        val subTextColor = if (isDark) Color.parseColor("#E0E0E0") else Color.parseColor("#424242")

        if (allItems.isEmpty()) {
            addTimerRow(hContainer, "No activities today", textColor)
            scrollView.layoutParams.height = 0
        } else {
            val titleColor = ContextCompat.getColor(this, R.color.primary)
            addTimerRow(hContainer, "Today's Schedule", titleColor, isHeader = true)
            addTimerRow(hContainer, "Bosses and guild events", subTextColor, isSubtitle = true)
            
            val displayedItems = allItems.take(Constants.BUBBLE_MAX_ITEMS)
            displayedItems.forEach { (name, diff, isBoss) ->
                val timeStr = formatCountdown(diff)
                
                val colorHex = if (isBoss) {
                    when {
                        diff <= 0 -> COLOR_BOSS_READY
                        diff <= Constants.SPAWNING_SOON_THRESHOLD_MINUTES * 60 -> COLOR_BOSS_SOON
                        else -> COLOR_BOSS_TRACKING
                    }
                } else {
                    when {
                        diff <= 0 -> COLOR_EVENT_READY
                        diff <= Constants.SPAWNING_SOON_THRESHOLD_MINUTES * 60 -> COLOR_EVENT_SOON
                        else -> COLOR_EVENT_NORMAL
                    }
                }
                
                val colorVal = Color.parseColor(colorHex)
                val fullText = "$name: $timeStr"
                addTimerRow(container, fullText, colorVal, boldSpanEnd = name.length)
            }

            val isPortrait = resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
            val maxVisible = if (isPortrait) Constants.BUBBLE_PORTRAIT_MAX_ITEMS else Constants.BUBBLE_LANDSCAPE_MAX_ITEMS
            
            if (displayedItems.size > maxVisible) {
                val estimatedHeight = maxVisible * Constants.BUBBLE_ROW_ESTIMATED_HEIGHT_DP
                scrollView.layoutParams.height = dpToPx(estimatedHeight)
            } else {
                scrollView.layoutParams.height = LinearLayout.LayoutParams.WRAP_CONTENT
            }
        }
        scrollView.requestLayout()
    }

    private fun addTimerRow(container: LinearLayout, text: String, colorVal: Int, isHeader: Boolean = false, isSubtitle: Boolean = false, boldSpanEnd: Int = -1) {
        val tv = TextView(this).apply {
            if (boldSpanEnd > 0) {
                val spannable = SpannableStringBuilder(text)
                spannable.setSpan(StyleSpan(Typeface.BOLD), 0, boldSpanEnd, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                this.text = spannable
            } else {
                this.text = text
            }
            
            this.setTextColor(colorVal)
            
            val textSize = when {
                isHeader -> Constants.BUBBLE_TEXT_SIZE_TITLE_SP
                isSubtitle -> Constants.BUBBLE_TEXT_SIZE_SUBTITLE_SP
                else -> Constants.BUBBLE_TEXT_SIZE_ROW_SP
            }
            this.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSize)
            
            val topPadding = if (isHeader) 12 else 4
            val bottomPadding = if (isSubtitle) 12 else 4
            this.setPadding(dpToPx(Constants.BUBBLE_ROW_PADDING_HORIZONTAL_DP), dpToPx(topPadding), dpToPx(Constants.BUBBLE_ROW_PADDING_HORIZONTAL_DP), dpToPx(bottomPadding))
            
            this.typeface = if (isHeader) Typeface.create("sans-serif-black", Typeface.BOLD) else Typeface.create("sans-serif-medium", Typeface.NORMAL)
            
            setShadowLayer(3f, 2f, 2f, Color.parseColor("#AA000000"))

            this.gravity = if (isHeader || isSubtitle) Gravity.CENTER_HORIZONTAL else Gravity.START
            this.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        container.addView(tv)
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun updateViewLayoutSafely() {
        try {
            val v = floatingView
            val p = params
            if (v != null && p != null && v.isAttachedToWindow) {
                windowManager?.updateViewLayout(v, p)
            }
        } catch (e: Exception) { }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        try {
            if (floatingView != null && floatingView?.isAttachedToWindow == true) {
                windowManager?.removeView(floatingView)
            }
        } catch (e: Exception) { }
        try {
            if (closeView != null && closeView?.isAttachedToWindow == true) {
                windowManager?.removeView(closeView)
            }
        } catch (e: Exception) { }
    }
}
