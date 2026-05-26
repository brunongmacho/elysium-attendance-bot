"use client";

interface SkeletonLoaderProps {
  variant?: "card" | "table" | "text" | "avatar";
  count?: number;
  className?: string;
}

export default function SkeletonLoader({
  variant = "card",
  count = 1,
  className = "",
}: SkeletonLoaderProps) {
  const baseClasses = "animate-pulse bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 bg-[length:200%_100%]";

  const renderSkeleton = () => {
    switch (variant) {
      case "card":
        return (
          <div className={`glass backdrop-blur-sm rounded-lg border border-gray-700 p-4 ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <div className={`h-6 ${baseClasses} rounded w-3/4 mb-2`} />
                <div className="flex gap-2">
                  <div className={`h-5 ${baseClasses} rounded-full w-12`} />
                  <div className={`h-5 ${baseClasses} rounded-full w-16`} />
                </div>
              </div>
              <div className={`w-20 h-20 ${baseClasses} rounded`} />
            </div>

            {/* Content */}
            <div className={`h-4 ${baseClasses} rounded w-full mb-2`} />
            <div className={`h-4 ${baseClasses} rounded w-5/6 mb-4`} />

            {/* Countdown area */}
            <div className="flex justify-center mb-4">
              <div className={`w-32 h-32 ${baseClasses} rounded-full`} />
            </div>

            {/* Button */}
            <div className={`h-10 ${baseClasses} rounded w-full`} />
          </div>
        );

      case "table":
        return (
          <div className={`glass backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden ${className}`}>
            {/* Header */}
            <div className="bg-primary/10 border-b border-primary/20 p-4">
              <div className="flex gap-4">
                <div className={`h-4 ${baseClasses} rounded w-16`} />
                <div className={`h-4 ${baseClasses} rounded w-32`} />
                <div className={`h-4 ${baseClasses} rounded w-24`} />
                <div className={`h-4 ${baseClasses} rounded w-24`} />
              </div>
            </div>

            {/* Rows */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 border-b border-primary/10">
                <div className="flex gap-4">
                  <div className={`h-4 ${baseClasses} rounded w-16`} />
                  <div className={`h-4 ${baseClasses} rounded w-32`} />
                  <div className={`h-4 ${baseClasses} rounded w-24`} />
                  <div className={`h-4 ${baseClasses} rounded w-24`} />
                </div>
              </div>
            ))}
          </div>
        );

      case "text":
        return (
          <div className={className}>
            <div className={`h-4 ${baseClasses} rounded w-full mb-2`} />
            <div className={`h-4 ${baseClasses} rounded w-5/6`} />
          </div>
        );

      case "avatar":
        return <div className={`${baseClasses} rounded-full ${className}`} />;

      default:
        return null;
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} style={{ animationDelay: `${index * 0.1}s` }}>
          {renderSkeleton()}
        </div>
      ))}
    </>
  );
}

// Grid skeleton for boss cards
export function BossGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <SkeletonLoader variant="card" count={count} />
    </div>
  );
}

// Table skeleton for leaderboard
export function LeaderboardSkeleton() {
  return <SkeletonLoader variant="table" />;
}
