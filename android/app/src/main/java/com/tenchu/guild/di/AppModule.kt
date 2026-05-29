package com.tenchu.guild.di

import android.content.Context
import androidx.room.Room
import com.tenchu.guild.database.TenchuDatabase
import com.tenchu.guild.network.TenchuApiService
import com.tenchu.guild.network.UpdateApiService
import com.tenchu.guild.utils.Constants
import com.tenchu.guild.utils.NotificationHelper
import com.tenchu.guild.utils.PreferenceManager
import com.tenchu.guild.utils.UpdateManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import javax.inject.Named

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideTenchuDatabase(@ApplicationContext context: Context): TenchuDatabase {
        return Room.databaseBuilder(
            context,
            TenchuDatabase::class.java,
            Constants.DATABASE_NAME
        )
        .fallbackToDestructiveMigration() // Critical to resolve schema conflicts by clearing existing data
        .build()
    }

    @Provides
    fun provideBossTimerDao(database: TenchuDatabase) = database.bossTimerDao()

    @Provides
    fun provideLeaderboardDao(database: TenchuDatabase) = database.leaderboardDao()

    @Provides
    fun provideEventsDao(database: TenchuDatabase) = database.eventsDao()

    @Provides
    fun provideMemberProfileDao(database: TenchuDatabase) = database.memberProfileDao()
}

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideHttpLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(loggingInterceptor: HttpLoggingInterceptor): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl(Constants.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    @Named("GithubRetrofit")
    fun provideGithubRetrofit(okHttpClient: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://raw.githubusercontent.com/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideTenchuApiService(retrofit: Retrofit): TenchuApiService {
        return retrofit.create(TenchuApiService::class.java)
    }

    @Provides
    @Singleton
    fun provideUpdateApiService(@Named("GithubRetrofit") retrofit: Retrofit): UpdateApiService {
        return retrofit.create(UpdateApiService::class.java)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object UtilsModule {
    
    @Provides
    @Singleton
    fun provideNotificationHelper(
        @ApplicationContext context: Context,
        preferenceManager: PreferenceManager
    ): NotificationHelper {
        return NotificationHelper(context, preferenceManager)
    }

    @Provides
    @Singleton
    fun providePreferenceManager(@ApplicationContext context: Context): PreferenceManager {
        return PreferenceManager(context)
    }

    @Provides
    @Singleton
    fun provideUpdateManager(
        @ApplicationContext context: Context,
        updateApiService: UpdateApiService
    ): UpdateManager {
        return UpdateManager(context, updateApiService)
    }
}
