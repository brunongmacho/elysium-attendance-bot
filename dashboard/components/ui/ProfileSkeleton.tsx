"use client";

import { Card } from './Card';

export function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-700 shimmer" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-gray-700 rounded shimmer w-1/3" />
            <div className="h-4 bg-gray-700 rounded shimmer w-1/4" />
          </div>
        </div>
      </Card>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} variant="glass" className="p-6">
            <div className="space-y-3">
              <div className="h-4 bg-gray-700 rounded shimmer w-1/2" />
              <div className="h-8 bg-gray-700 rounded shimmer w-3/4" />
              <div className="h-3 bg-gray-700 rounded shimmer w-1/3" />
            </div>
          </Card>
        ))}
      </div>

      {/* Content Skeleton */}
      <Card variant="glass" className="p-6">
        <div className="space-y-4">
          <div className="h-5 bg-gray-700 rounded shimmer w-1/4" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-700 rounded shimmer w-full" />
            <div className="h-4 bg-gray-700 rounded shimmer w-5/6" />
            <div className="h-4 bg-gray-700 rounded shimmer w-4/6" />
          </div>
        </div>
      </Card>

      {/* Activity Skeleton */}
      <Card variant="glass" className="p-6">
        <div className="space-y-4">
          <div className="h-5 bg-gray-700 rounded shimmer w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gray-700 shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-700 rounded shimmer w-3/4" />
                  <div className="h-3 bg-gray-700 rounded shimmer w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
