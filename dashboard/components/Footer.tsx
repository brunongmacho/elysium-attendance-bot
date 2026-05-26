"use client";

import { Icon } from "@/components/icons";
import { LINKS } from "@/lib/constants";
import { useSession } from "next-auth/react";

export default function Footer() {
  const { data: session } = useSession();
  
  return (
    <footer className="mt-auto glass backdrop-blur-sm border-t border-primary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <div className="flex flex-wrap justify-center items-center gap-3 text-xs mb-2">
            <a href="/" className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light font-game transition-colors group">
              <Icon
                name="home"
                size="sm"
                className="text-primary group-hover:text-primary-light transition-colors"
              />
              Home
            </a>
            {session?.canAccessBossTimers && (
              <>
                <span className="text-gray-600">•</span>
                <a href="/timers" className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light font-game transition-colors group">
                  <Icon
                    name="clock"
                    size="sm"
                    className="text-primary group-hover:text-primary-light transition-colors"
                  />
                  Boss Timers
                </a>
              </>
            )}
          <span className="text-gray-600">•</span>
          <a href="/events" className="inline-flex items-center gap-1.5 text-accent hover:text-accent-light font-game transition-colors group">
            <Icon
              name="calendar"
              size="sm"
              className="text-accent group-hover:text-accent-light transition-colors"
            />
            Events
          </a>
          <span className="text-gray-600">•</span>
          <a href="/leaderboard" className="inline-flex items-center gap-1.5 text-accent hover:text-accent-light font-game transition-colors group">
            <Icon
              name="trophy"
              size="sm"
              className="text-accent group-hover:text-accent-light transition-colors"
            />
            Leaderboards
          </a>
          <span className="text-gray-600">•</span>
          <a href="/relic-calculator" className="inline-flex items-center gap-1.5 text-accent hover:text-accent-light font-game transition-colors group">
            <Icon
              name="calculator"
              size="sm"
              className="text-accent group-hover:text-accent-light transition-colors"
            />
            Relic Calculator
          </a>
          {session?.canAccessBossTimers && (
            <>
              <span className="text-gray-600">•</span>
              <a
                href={LINKS.APK_DOWNLOAD}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light font-game transition-colors group"
              >
                <Icon
                  name="smartphone"
                  size="sm"
                  className="text-primary group-hover:text-primary-light transition-colors"
                />
                Get Mobile App
              </a>
            </>
          )}
          <span className="text-gray-600">•</span>
          <a
            href={LINKS.DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light font-game transition-colors group"
          >
            <Icon
              name="discord"
              size="sm"
              className="text-primary group-hover:text-primary-light transition-colors"
            />
            Discord
          </a>
        </div>
        <div className="text-xs text-gray-600 font-game mb-1">
          <p>Managed by Goblok's Crayon Intelligence | Powered by the Jalo Bot | Where Chaos Meets Strategy</p>
        </div>
        <div className="text-xs text-gray-500 font-game">
          <p>© 2025 Elysium Guild. All rights reserved.</p>
          <p className="mt-1">Built with ❤️ for the guild</p>
        </div>
      </div>
    </footer>
  );
}
