"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedCounter from "./AnimatedCounter";

interface PodiumEntry {
  rank: number;
  memberId: string;
  username: string;
  value: number;
  label: string;
}

interface LeaderboardPodiumProps {
  entries: PodiumEntry[];
  type: "attendance" | "points";
}

function LeaderboardPodium({ entries, type }: LeaderboardPodiumProps) {
  if (entries.length === 0) return null;

  // Ensure we have exactly 3 entries (or less)
  const podiumEntries = entries.slice(0, 3);

  // Get colors and effects based on rank
  const getColors = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          medal: "🥇",
          bg: "from-yellow-500/30 via-yellow-600/20 to-yellow-700/10",
          border: "border-yellow-500/70",
          text: "text-yellow-400",
          glow: "shadow-[0_0_30px_rgba(234,179,8,0.6)] glow-gold",
          height: "h-32",
          title: "Guild Champion",
          badge: "👑",
        };
      case 2:
        return {
          medal: "🥈",
          bg: "from-gray-300/30 via-gray-400/20 to-gray-500/10",
          border: "border-gray-400/70",
          text: "text-gray-300",
          glow: "shadow-[0_0_25px_rgba(156,163,175,0.5)] glow-silver",
          height: "h-24",
          title: "Elite Guardian",
          badge: "⚔️",
        };
      case 3:
        return {
          medal: "🥉",
          bg: "from-amber-500/30 via-amber-600/20 to-amber-700/10",
          border: "border-amber-600/70",
          text: "text-amber-500",
          glow: "shadow-[0_0_20px_rgba(217,119,6,0.5)]",
          height: "h-20",
          title: "Elite Guardian",
          badge: "⚔️",
        };
      default:
        return {
          medal: "",
          bg: "from-gray-700/20 to-gray-800/10",
          border: "border-gray-600/50",
          text: "text-gray-400",
          glow: "shadow-gray-600/30",
          height: "h-16",
          title: "Competitor",
          badge: "🎯",
        };
    }
  };

  // Reorder for podium display: [2nd, 1st, 3rd]
  const displayOrder = [
    podiumEntries[1], // 2nd place on left
    podiumEntries[0], // 1st place in center
    podiumEntries[2], // 3rd place on right
  ].filter(Boolean);

  return (
    <div className="glass backdrop-blur-sm rounded-lg border border-primary/20 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
      <motion.h2
        className="text-lg sm:text-2xl font-bold text-gold text-rpg-title mb-4 sm:mb-6 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        🏆 Top 3 {type === "attendance" ? "Attendance" : "Points"}
      </motion.h2>

      <div className="flex items-end justify-center gap-4 max-w-2xl mx-auto perspective-1000">
        {displayOrder.map((entry, index) => {
          if (!entry) return null;

          const colors = getColors(entry.rank);
          // Animation sequence: 3rd place first, then 2nd, then 1st (for dramatic reveal)
          const animationDelay = entry.rank === 3 ? 0 : entry.rank === 2 ? 0.3 : 0.6;

          return (
            <motion.div
              key={entry.memberId}
              className="flex-1 max-w-[200px]"
              initial={{ opacity: 0, y: 50, rotateY: -15 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{
                duration: 0.6,
                delay: animationDelay,
                type: "spring",
                stiffness: 100,
              }}
              whileHover={{
                scale: 1.05,
                rotateY: entry.rank === 1 ? 5 : entry.rank === 2 ? -5 : 5,
                z: 50,
              }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Card */}
              <Link href={`/profile/${entry.memberId}`} className="block">
                <motion.div
                  className={`
                    glass backdrop-blur-sm rounded-lg border-2 ${colors.border} ${colors.glow}
                    bg-gradient-to-b ${colors.bg}
                    p-3 sm:p-4 text-center relative overflow-hidden
                    transform-gpu cursor-pointer
                  `}
                  whileHover={{ boxShadow: `0 0 ${entry.rank === 1 ? '40px' : '30px'} ${entry.rank === 1 ? 'rgba(234,179,8,0.7)' : entry.rank === 2 ? 'rgba(156,163,175,0.6)' : 'rgba(217,119,6,0.6)'}` }}
                >
                {/* Animated background sparkle effect */}
                {entry.rank === 1 && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent"
                    animate={{
                      x: ["-100%", "200%"],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                )}

                {/* Medal */}
                <motion.div
                  className="text-4xl sm:text-5xl mb-2 relative z-10"
                  animate={{
                    y: [0, -10, 0],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {colors.medal}
                </motion.div>

                {/* Badge & Rank */}
                <div className="flex items-center justify-center gap-2 mb-2 relative z-10">
                  <span className="text-lg">{colors.badge}</span>
                  <div className={`text-base sm:text-lg font-bold ${colors.text} font-game-decorative`}>
                    #{entry.rank}
                  </div>
                </div>

                {/* Title */}
                <div className={`text-xs ${colors.text} mb-2 font-game opacity-80 relative z-10`}>
                  {colors.title}
                </div>

                {/* Username */}
                <div className="block text-sm sm:text-base text-white font-semibold mb-2 truncate font-game relative z-10">
                  {entry.username}
                </div>

                {/* Value */}
                <div className="text-xl sm:text-2xl font-bold text-white mb-1 font-game-decorative relative z-10">
                  <AnimatedCounter value={entry.value} duration={1500} />
                </div>
                <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">{entry.label}</div>
              </motion.div>
              </Link>

              {/* Podium Base with 3D effect */}
              <motion.div
                className={`
                  ${colors.height} ${colors.bg}
                  bg-gradient-to-t
                  border-t-2 ${colors.border}
                  rounded-b-lg
                  flex items-center justify-center
                  relative
                `}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{
                  duration: 0.5,
                  delay: animationDelay + 0.3,
                  ease: "easeOut",
                }}
                style={{
                  transformStyle: "preserve-3d",
                  transform: "rotateX(-5deg)",
                  transformOrigin: "bottom",
                }}
                whileHover={{
                  transform: "rotateX(0deg) scale(1.02)",
                }}
              >
                <div className={`text-2xl sm:text-3xl font-bold ${colors.text} opacity-50 font-game-decorative`}>
                  {entry.rank}
                </div>
                {/* 3D depth effect */}
                <div className={`absolute inset-0 bg-gradient-to-b ${colors.bg} opacity-30 rounded-b-lg`}
                  style={{ transform: "translateZ(-10px)" }}
                />
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export default memo(LeaderboardPodium);
